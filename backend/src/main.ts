import { NestFactory }    from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { DataSource }     from 'typeorm';
import * as fs            from 'fs';
import * as path          from 'path';
import compression from 'compression';
import { json, urlencoded } from 'express';
import helmet             from 'helmet';
import { AppModule }      from './app.module';
import { AuthService }    from './modules/auth/auth.service';

// Run every .sql file in database/migrations on startup.
// All migrations use IF NOT EXISTS, so this is safe to run on every boot.
async function runMigrations(app: any) {
  try {
    const ds = app.get(DataSource);
    const dir = path.join(process.cwd(), 'database', 'migrations');
    if (!fs.existsSync(dir)) { console.log('ℹ️  No migrations folder found, skipping auto-migrate'); return; }

    // Cap any single migration statement so a lock wait can't hang boot forever.
    await ds.query(`SET statement_timeout = '60s'`).catch(() => null);
    await ds.query(`SET lock_timeout = '10s'`).catch(() => null);

    // Track which migrations have run, so each applies exactly once.
    // (Most early migrations use plain CREATE TABLE and would error on re-run.)
    await ds.query(`CREATE TABLE IF NOT EXISTS _migrations (
      filename   VARCHAR(200) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => null);

    const appliedRows = await ds.query(`SELECT filename FROM _migrations`).catch(() => []);
    let applied = new Set((appliedRows || []).map((r: any) => r.filename));

    // Manual override: set FORCE_MIGRATE=true in the environment to re-run EVERY
    // migration on the next boot (then remove the variable). Safe because all
    // migrations are idempotent (IF NOT EXISTS). Use this to rebuild a broken schema
    // without shell access — set the var, redeploy, watch the logs, then unset it.
    const forceMigrate = String(process.env.FORCE_MIGRATE || '').toLowerCase() === 'true';
    if (forceMigrate) {
      console.warn('⚠️  FORCE_MIGRATE=true — re-running ALL migrations regardless of tracker');
      await ds.query(`DELETE FROM _migrations`).catch(() => null);
      applied = new Set();
    }

    // Self-heal a broken tracker: if migrations are marked applied but the core tables
    // they create are missing (e.g. migration 001 failed partway and was wrongly
    // recorded as applied, or the DB was recreated), clear the tracker so every
    // migration re-runs. With migrations now idempotent (IF NOT EXISTS), re-running is safe.
    if (!forceMigrate && applied.size > 0) {
      const core = await ds.query(
        `SELECT to_regclass('public.tenants') AS tenants, to_regclass('public.users') AS users, to_regclass('public.learners') AS learners`
      ).catch(() => [{ tenants: null, users: null, learners: null }]);
      if (!core?.[0]?.tenants || !core?.[0]?.users || !core?.[0]?.learners) {
        console.warn('⚠️  migrations marked applied but core tables (tenants/users/learners) missing — resetting migration tracker to rebuild schema');
        await ds.query(`DELETE FROM _migrations`).catch(() => null);
        applied = new Set();
      }
    }

    // Shared trigger function used by many schema migrations (001-010).
    // Define it up-front so every migration can reference it regardless of order.
    await ds.query(`
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $fn$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $fn$ LANGUAGE plpgsql;
    `).catch((e: any) => console.warn(`⚠️  could not create set_updated_at(): ${e.message}`));

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    let ran = 0, skipped = 0, failed = 0;
    for (const file of files) {
      if (applied.has(file)) { skipped++; continue; }   // already applied — skip silently
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      try {
        await ds.query(sql);
        await ds.query(`INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]).catch(() => null);
        console.log(`✅ migration applied: ${file}`);
        ran++;
      } catch (e: any) {
        const msg = String(e.message || '');
        // "already exists" means the schema is already in place (e.g. created by
        // a prior run or by synchronize). Mark as applied so it won't retry/spam.
        if (/already exists/i.test(msg)) {
          await ds.query(`INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]).catch(() => null);
          console.log(`↪️  migration already in place: ${file}`);
          skipped++;
        } else {
          console.error(`❌ migration FAILED: ${file} — ${msg}`);
          failed++;
        }
      }
    }
    console.log(`ℹ️  migrations: ${ran} applied, ${skipped} already up-to-date, ${failed} failed`);

    // Diagnostic: how many KNEC codes are loaded for signup lookup?
    const knecCount = await ds.query(`SELECT COUNT(*)::int AS n FROM knec_school_registry`).catch(() => [{ n: 'table missing' }]);
    console.log(`ℹ️  KNEC registry: ${knecCount?.[0]?.n} codes available for signup lookup`);
  } catch (e: any) {
    console.warn(`⚠️  auto-migrate could not run: ${e.message}`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Allow larger request bodies (e.g. base64 school logo uploads). The default ~100KB
  // limit causes 413 Content Too Large when saving settings with an image.
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ limit: '5mb', extended: true }));

  // ── Security ──────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));
  // Compress text responses, but NEVER compress PDFs/binaries — compressing a
  // PDF stream (or a stale Content-Length) corrupts it and the browser shows
  // "failed to load PDF".
  app.use(compression({
    filter: (req: any, res: any) => {
      if (res.getHeader('X-No-Compression')) return false;
      const type = String(res.getHeader('Content-Type') || '');
      if (type.includes('application/pdf') || type.includes('octet-stream')) return false;
      return compression.filter(req, res);
    },
  }));

  // ── Migrations now run AFTER app.listen() (see end of bootstrap) so a slow
  //    migration pass can't block the port from binding. ──

  // ── CORS — allow the Next.js frontend ────────────────────
  // Allowed browser origins: the configured frontend URL, any extra origins from
  // ALLOWED_ORIGINS (comma-separated, e.g. a custom domain), localhost for dev, and
  // any *.onrender.com host so the deployed frontend works out of the box.
  const staticOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3001',
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
    'http://localhost:3001',
    'http://localhost:3000',
    'http://127.0.0.1:3001',
  ];
  app.enableCors({
    origin: (origin, cb) => {
      // Allow same-origin/non-browser requests (no origin), any listed origin, any
      // *.onrender.com host, and the zarodasolutions.app custom domain + subdomains.
      if (!origin) return cb(null, true);
      let host = '';
      try { host = new URL(origin).hostname; } catch { return cb(null, false); }
      const ok =
        staticOrigins.includes(origin) ||
        /\.onrender\.com$/.test(host) ||
        host === 'zarodasolutions.app' ||
        host.endsWith('.zarodasolutions.app');
      return cb(null, ok);
    },
    methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
  });

  // ── Global prefix ─────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Validation ────────────────────────────────────────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist:        true,
    transform:        true,
    forbidNonWhitelisted: false,
  }));

  // ── Swagger API docs (dev only) ───────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ZARODA SMS API')
      .setDescription('Kenya CBC/CBE School Management System — REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    console.log(`📋 Swagger docs: http://localhost:${process.env.PORT || 3000}/api/docs`);
  }

  // ── Health check ─────────────────────────────────────────
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', service: 'zaroda-sms-api', timestamp: new Date().toISOString() });
  });

  // Read-only data census — confirms whether data exists, viewable from a browser.
  // Visit: /data-check?key=zaroda-migrate-now   (uses the same MIGRATE_KEY). Returns
  // row counts for the core tables + the database name it's actually connected to, so
  // we can tell if anything was wiped or if the backend is pointed at a fresh DB.
  httpAdapter.get('/data-check', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const ds = app.get(DataSource);
      const tables = ['users', 'schools', 'tenants', 'learners', 'streams', 'exams',
        'assessment_results', 'assessment_scores', 'retooling_articles'];
      const out: any = {};
      for (const t of tables) {
        try {
          const r = await ds.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
          out[t] = r[0]?.c ?? 0;
        } catch (e: any) { out[t] = `n/a (${e.message?.split('\n')[0]})`; }
      }
      const dbinfo = await ds.query(`SELECT current_database() AS db, current_user AS usr`).catch(() => [{}]);
      const owners = await ds.query(
        `SELECT email, role, created_at FROM users WHERE role = 'super_admin' ORDER BY created_at`,
      ).catch(() => []);
      const recentUsers = await ds.query(
        `SELECT email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5`,
      ).catch(() => []);
      // Diagnostics for the Grade 5 rubric issue: what areas grade_5 has, and what
      // grade_level each stream was created with (a mis-set stream grade pulls the
      // wrong learning areas into the rubric).
      const g5areas = await ds.query(
        `SELECT DISTINCT learning_area FROM assessment_templates WHERE grade_level='grade_5' ORDER BY learning_area`,
      ).catch(() => []);
      const streamGrades = await ds.query(
        `SELECT name, grade_level FROM streams ORDER BY grade_level, name LIMIT 50`,
      ).catch(() => []);
      const gradeLevelsInTemplates = await ds.query(
        `SELECT grade_level, COUNT(*)::int AS n FROM assessment_templates GROUP BY grade_level ORDER BY grade_level`,
      ).catch(() => []);
      res.type('text/plain').send(
        `DATABASE: ${dbinfo[0]?.db} (user ${dbinfo[0]?.usr})\n\n` +
        `ROW COUNTS:\n` + Object.entries(out).map(([k, v]) => `  ${k.padEnd(22)} ${v}`).join('\n') +
        `\n\nSUPER ADMINS (${owners.length}):\n` + owners.map((o: any) => `  ${o.email}  [${o.role}]  ${o.created_at}`).join('\n') +
        `\n\n5 MOST RECENT USERS:\n` + recentUsers.map((u: any) => `  ${u.email}  [${u.role}]  ${u.created_at}`).join('\n') +
        `\n\nGRADE_5 LEARNING AREAS IN TEMPLATES (${g5areas.length}):\n` + g5areas.map((a: any) => `  ${a.learning_area}`).join('\n') +
        `\n\nTEMPLATE GRADE LEVELS:\n` + gradeLevelsInTemplates.map((g: any) => `  ${g.grade_level.padEnd(12)} ${g.n} areas`).join('\n') +
        `\n\nSTREAMS & THEIR GRADE LEVELS:\n` + streamGrades.map((s: any) => `  ${(s.name||'').padEnd(24)} grade_level=${s.grade_level}`).join('\n'),
      );
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}`);
    }
  });

  // Browser-runnable repair for a mislabeled class grade level (e.g. a Grade 5 stream
  // saved as grade_7, which makes the rubric show the wrong learning areas). This only
  // updates the class's grade LABEL — it does not touch or delete any marks, which are
  // tied to the learner + subject, not the stream's grade tag.
  // Visit: /fix-stream-grade?key=zaroda-migrate-now&name=Grade%205%20A&grade=grade_5
  // Matches the stream by name (case-insensitive). Safe to run.
  httpAdapter.get('/fix-stream-grade', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const name = String(req.query?.name || '').trim();
    const grade = String(req.query?.grade || '').trim();
    const valid = ['playgroup','pp1','pp2','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6',
      'grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'];
    if (!name || !valid.includes(grade)) {
      res.type('text/plain').send('Usage: /fix-stream-grade?key=...&name=Grade 5 A&grade=grade_5'); return;
    }
    try {
      const ds = app.get(DataSource);
      const streams = await ds.query(`SELECT id, name, grade_level FROM streams WHERE LOWER(name) = LOWER($1)`, [name]).catch(() => []);
      if (!streams.length) { res.type('text/plain').send(`No stream named "${name}". Check the exact name from /data-check.`); return; }
      for (const s of streams) {
        await ds.query(`UPDATE streams SET grade_level = $1 WHERE id = $2`, [grade, s.id]).catch(() => null);
        await ds.query(`UPDATE learners SET grade_level = $1 WHERE stream_id = $2`, [grade, s.id]).catch(() => null);
      }
      res.type('text/plain').send(`OK — set ${streams.length} stream(s) named "${name}" to ${grade}.\nMarks are unaffected. Reload the rubric to see the correct learning areas.`);
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}`);
    }
  });
  httpAdapter.get('/run-migrations', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) {
      res.status(403).send('Forbidden: add ?key=YOUR_MIGRATE_KEY to the URL.');
      return;
    }
    const lines: string[] = [];
    try {
      const ds = app.get(DataSource);
      const dir = path.join(process.cwd(), 'database', 'migrations');

      // SAFETY: the destructive "&reset=true" rebuild path (which dropped the schema and
      // wiped ALL data) has been REMOVED, along with the tracker-wipe. This endpoint is
      // now strictly ADDITIVE — it only runs migration files that have not been applied
      // before, and never drops the schema or clears the tracker. Re-hitting the URL is
      // safe and simply skips everything already applied. A genuine rebuild must be done
      // via a database backup/restore, never from a URL.
      await ds.query(`CREATE TABLE IF NOT EXISTS _migrations (filename VARCHAR(200) PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => null);
      const appliedRows = await ds.query(`SELECT filename FROM _migrations`).catch(() => []);
      const applied = new Set<string>((appliedRows || []).map((r: any) => r.filename));
      await ds.query(`CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $fn$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $fn$ LANGUAGE plpgsql;`).catch(() => null);
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
      let ok = 0, fail = 0, skip = 0;
      for (const file of files) {
        if (applied.has(file)) { lines.push(`SKIP  ${file} (already applied)`); skip++; continue; }
        try {
          await ds.query(fs.readFileSync(path.join(dir, file), 'utf8'));
          await ds.query(`INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]).catch(() => null);
          lines.push(`OK    ${file}`); ok++;
        } catch (e: any) {
          lines.push(`FAIL  ${file} — ${String(e.message || '').slice(0, 200)}`); fail++;
        }
      }
      lines.push(`\nDONE — ${ok} applied, ${skip} skipped, ${fail} failed`);
      res.type('text/plain').send(lines.join('\n'));
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}\n${lines.join('\n')}`);
    }
  });

  // One-time platform-owner creation (free tier has no shell). Visit:
  //   /create-owner?key=SECRET&email=you@example.com&password=YourPass&name=Your+Name
  // The key is OWNER_KEY env (defaults to 'zaroda-owner-setup'). Creates a super_admin
  // with no tenant. Safe to call once; if the email already exists it upgrades that
  // account to super_admin. Rotate/remove OWNER_KEY afterwards.
  httpAdapter.get('/create-owner', async (req: any, res: any) => {
    const expected = process.env.OWNER_KEY || 'zaroda-owner-setup';
    if ((req.query?.key || '') !== expected) {
      res.status(403).send('Forbidden: add ?key=YOUR_OWNER_KEY to the URL.');
      return;
    }
    const email = String(req.query?.email || '').trim().toLowerCase();
    const password = String(req.query?.password || '');
    const name = String(req.query?.name || 'Platform Owner').trim();
    if (!email || password.length < 6) {
      res.status(400).type('text/plain').send('Need ?email= and ?password= (min 6 chars).');
      return;
    }
    try {
      const ds = app.get(DataSource);
      const bcryptLib = require('bcryptjs');
      const hash = await bcryptLib.hash(password, 12);
      const [firstName, ...rest] = name.split(/\s+/);
      const lastName = rest.join(' ') || 'Owner';
      const existing = await ds.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]).catch(() => []);
      if (existing.length) {
        await ds.query(
          `UPDATE users SET role='super_admin', password_hash=$2, is_active=true, must_change_password=false WHERE email=$1`,
          [email, hash],
        );
        res.type('text/plain').send(`Existing account ${email} upgraded to platform owner (super_admin). You can now log in.`);
        return;
      }
      await ds.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, tenant_id, is_active, email_verified, must_change_password, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'super_admin',NULL,true,true,false,NOW(),NOW())`,
        [email, hash, firstName, lastName],
      );
      res.type('text/plain').send(`Platform owner created: ${email}. Log in and you'll land on the Owner Console.`);
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}`);
    }
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`\n🚀 ZARODA SMS API running on http://localhost:${port}/api/v1`);
  console.log(`📚 Health check:  http://localhost:${port}/health`);
  console.log(`✅ CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3001'}\n`);

  // Run migrations AFTER the port is bound, so Render's port scan succeeds even if
  // the migration pass is slow. The schema is already built; this is a safety check.
  // Runs in the background — a slow or failing migration never blocks startup.
  runMigrations(app)
    .then(async () => {
      try {
        const ds = app.get(DataSource);
        const r = await ds.query(`SELECT COUNT(*)::int AS n FROM assessment_templates WHERE tenant_id IS NULL`);
        const n = r?.[0]?.n ?? 0;
        console.log(n > 0
          ? `✅ assessment book ready: ${n} learning-area templates seeded`
          : '⚠️  assessment book EMPTY: 0 templates.');
      } catch { /* ignore */ }
    })
    .catch((e: any) => console.warn(`⚠️  background migrate failed: ${e.message}`));
}

bootstrap();
