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
  // Test messaging config: /messaging-check?key=...&email=you@x.com  or  &sms=07XXXXXXXX
  httpAdapter.get('/messaging-check', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const out: string[] = [];
    out.push(`GMAIL_USER set: ${!!process.env.GMAIL_USER}`);
    out.push(`GMAIL_APP_PASSWORD set: ${!!process.env.GMAIL_APP_PASSWORD}`);
    out.push(`AT_API_KEY set: ${!!process.env.AT_API_KEY}`);
    out.push(`AT_USERNAME set: ${!!process.env.AT_USERNAME}`);
    out.push(`FRONTEND_URL: ${process.env.FRONTEND_URL || '(unset)'}`);
    try {
      const msg = eval('require')('./common/messaging');
      if (req.query?.email) {
        const r = await msg.sendEmail(req.query.email, 'ZARODA test email',
          '<p>This is a ZARODA test email. If you received it, Gmail SMTP is working.</p>');
        out.push(`\nEmail to ${req.query.email}: ${r.ok ? 'SENT ✓' : 'FAILED — ' + r.detail}`);
      }
      if (req.query?.sms) {
        const r = await msg.sendSms([req.query.sms], 'ZARODA test SMS — your SMS integration is working.');
        out.push(`\nSMS to ${req.query.sms}: sent=${r.sent} failed=${r.failed} ${r.detail ? '— ' + r.detail : ''}`);
      }
    } catch (e: any) { out.push(`\nERROR: ${e.message}`); }
    res.type('text/plain').send(out.join('\n'));
  });

  httpAdapter.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', service: 'zaroda-sms-api', build: 'level-from-points-total-2026-07-06', features: ['mark-list-readonly', 'creative-arts-normalize', 'stream-grade-trust', 'dashboard-top-classes', 'assessment-progress', 'parent-analytics', 'enrollment-trend'], timestamp: new Date().toISOString() });
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
      // Strand counts per grade + term — shows whether Term 2/3 strands are seeded.
      const strandsByTerm = await ds.query(
        `SELECT t.grade_level, st.term, COUNT(*)::int AS strands
           FROM assessment_strands st JOIN assessment_templates t ON t.id = st.template_id
          GROUP BY t.grade_level, st.term ORDER BY t.grade_level, st.term`,
      ).catch(() => []);
      // Parent linkage: parent accounts and whether any learner's guardian_email matches.
      const parents = await ds.query(
        `SELECT u.email,
                (SELECT COUNT(*)::int FROM learners l WHERE LOWER(l.guardian_email) = LOWER(u.email)) AS "linkedChildren"
           FROM users u WHERE u.role = 'parent' ORDER BY u.email LIMIT 20`,
      ).catch(() => []);
      const guardianEmails = await ds.query(
        `SELECT first_name AS "firstName", last_name AS "lastName", guardian_email AS "guardianEmail"
           FROM learners WHERE guardian_email IS NOT NULL AND guardian_email <> '' ORDER BY first_name LIMIT 20`,
      ).catch(() => []);
      res.type('text/plain').send(
        `DATABASE: ${dbinfo[0]?.db} (user ${dbinfo[0]?.usr})\n\n` +
        `ROW COUNTS:\n` + Object.entries(out).map(([k, v]) => `  ${k.padEnd(22)} ${v}`).join('\n') +
        `\n\nSUPER ADMINS (${owners.length}):\n` + owners.map((o: any) => `  ${o.email}  [${o.role}]  ${o.created_at}`).join('\n') +
        `\n\n5 MOST RECENT USERS:\n` + recentUsers.map((u: any) => `  ${u.email}  [${u.role}]  ${u.created_at}`).join('\n') +
        `\n\nPARENT ACCOUNTS (email → children matched by guardian_email):\n` + (parents.length ? parents.map((p: any) => `  ${p.email}  → ${p.linkedChildren} child(ren)`).join('\n') : '  (none)') +
        `\n\nLEARNERS' GUARDIAN EMAILS:\n` + (guardianEmails.length ? guardianEmails.map((l: any) => `  ${l.firstName} ${l.lastName}  → ${l.guardianEmail}`).join('\n') : '  (none set)') +
        `\n\nGRADE_5 LEARNING AREAS IN TEMPLATES (${g5areas.length}):\n` + g5areas.map((a: any) => `  ${a.learning_area}`).join('\n') +
        `\n\nTEMPLATE GRADE LEVELS:\n` + gradeLevelsInTemplates.map((g: any) => `  ${g.grade_level.padEnd(12)} ${g.n} areas`).join('\n') +
        `\n\nSTRANDS BY GRADE + TERM (shows if Term 2/3 seeded):\n` + strandsByTerm.map((s: any) => `  ${(s.grade_level||'').padEnd(12)} ${(s.term||'').padEnd(8)} ${s.strands} strands`).join('\n') +
        `\n\nSTREAMS & THEIR GRADE LEVELS:\n` + streamGrades.map((s: any) => `  ${(s.name||'').padEnd(24)} grade_level=${s.grade_level}`).join('\n'),
      );
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}`);
    }
  });

  // Browser-runnable: REMOVE non-examinable "Indigenous Language" learning areas from the
  // assessment rubric (assessment_templates + related rows) so they stop appearing on mark
  // lists. Run with &confirm=yes to actually delete; without it, just reports what exists.
  // /remove-indigenous?key=...&confirm=yes
  httpAdapter.get('/remove-indigenous', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const like = `%indigenous%`;
    try {
      const ds = app.get(DataSource);
      // Show what exists first.
      const found = await ds.query(
        `SELECT grade_level, learning_area, COUNT(*) AS n FROM assessment_templates
          WHERE LOWER(learning_area) LIKE $1 GROUP BY grade_level, learning_area ORDER BY grade_level`,
        [like],
      ).catch((e: any) => ({ error: e.message }));

      let report = `INDIGENOUS LANGUAGE TEMPLATES FOUND:\n` +
        (Array.isArray(found) && found.length
          ? found.map((r: any) => `  ${String(r.grade_level).padEnd(12)} ${r.learning_area}  (${r.n})`).join('\n')
          : `  (none)`);

      if ((req.query?.confirm || '') === 'yes' && Array.isArray(found) && found.length) {
        // Delete the rubric rows. Child tables (strands/sub-strands) reference templates by
        // template_id; delete those first where the table exists, then the templates.
        const tplIds = await ds.query(
          `SELECT id FROM assessment_templates WHERE LOWER(learning_area) LIKE $1`, [like],
        ).then((r: any[]) => r.map(x => x.id)).catch(() => []);
        let del = 0;
        if (tplIds.length) {
          for (const child of ['assessment_substrands', 'assessment_strands']) {
            await ds.query(`DELETE FROM ${child} WHERE template_id = ANY($1::int[])`, [tplIds]).catch(() => null);
          }
          const r = await ds.query(
            `DELETE FROM assessment_templates WHERE LOWER(learning_area) LIKE $1`, [like],
          ).catch(() => ({ rowCount: 0 }));
          del = (r as any)?.rowCount ?? tplIds.length;
        }
        report += `\n\nDELETED ${del} template row(s). Indigenous Language will no longer appear on mark lists.`;
      } else if (Array.isArray(found) && found.length) {
        report += `\n\nTo remove these, re-run with &confirm=yes appended to the URL.`;
      }
      res.type('text/plain').send(report);
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  // Seed strands + sub-strands into the rubric for one grade/area/term. POST JSON:
  // { key, gradeLevel, learningArea, term, replace?: true, strands: [{ name, substrands:[".."] }] }
  // 'replace:true' first deletes existing strands for that area+term (use to correct bad data).
  // Bulk seed the whole rubric from one JSON payload:
  // { key, replace?, data: { grade_level: { term_x: { "Learning Area": [ {name, substrands:[]} ] } } } }
  // Remove specific rubric learning areas entirely (templates + their strands + sub-strands).
  // /remove-rubric-areas?key=...&areas=Creative Activities,Mathematical Activities,Indigenous Language
  // Matching is case-insensitive and also matches an optional " Activities" suffix variant.
  httpAdapter.get('/remove-rubric-areas', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const raw = String(req.query?.areas || '').trim();
    if (!raw) { res.status(400).type('text/plain').send('Provide ?areas=Name1,Name2 (comma-separated).'); return; }
    const names = raw.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const ds = app.get(DataSource);
      const report: string[] = [];
      let totalTpl = 0;
      for (const name of names) {
        // Match the exact area name, or with/without an " Activities" suffix (case-insensitive).
        // Exact matching only — avoid prefix matches that could hit the wrong area
        // (e.g. removing "Mathematical Activities" must NOT touch "Mathematics Activities").
        // Indigenous Language is also stored misspelled ("Indeginous") in some books.
        const isIndigenous = /indig|indeg/i.test(name);
        const tpls = isIndigenous
          ? await ds.query(
              `SELECT id, grade_level, learning_area FROM assessment_templates
                WHERE LOWER(learning_area) LIKE '%indig%' OR LOWER(learning_area) LIKE '%indeg%'`,
            ).catch(() => [])
          : await ds.query(
              `SELECT id, grade_level, learning_area FROM assessment_templates
                WHERE LOWER(learning_area) = LOWER($1)
                   OR LOWER(learning_area) = LOWER($1 || ' Activities')
                   OR LOWER(learning_area) = LOWER(REPLACE($1,' Activities',''))`,
              [name],
            ).catch(() => []);
        for (const tpl of tpls) {
          const strandIds = (await ds.query(`SELECT id FROM assessment_strands WHERE template_id = $1`, [tpl.id]).catch(() => [])).map((r: any) => r.id);
          if (strandIds.length) {
            await ds.query(`DELETE FROM assessment_substrands WHERE strand_id = ANY($1::uuid[])`, [strandIds]).catch(() => null);
            await ds.query(`DELETE FROM assessment_strands WHERE id = ANY($1::uuid[])`, [strandIds]).catch(() => null);
          }
          await ds.query(`DELETE FROM assessment_templates WHERE id = $1`, [tpl.id]).catch(() => null);
          report.push(`  removed: ${tpl.grade_level} / ${tpl.learning_area}`);
          totalTpl++;
        }
      }
      res.type('text/plain').send(`Removed ${totalTpl} learning-area template(s):\n${report.join('\n') || '  (none matched)'}`);
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}`);
    }
  });

  // Shared rubric-seeding routine. Loads bundled rubric_seed.json when no data is given.
  const runRubricSeed = async (data: any, replace: boolean): Promise<string> => {
    if (!data) {
      try {
        const fs = eval('require')('fs');
        const path = eval('require')('path');
        const candidates = [
          path.join(process.cwd(), 'rubric_seed.json'),
          path.join(process.cwd(), 'src', 'seed', 'rubric_seed.json'),
          path.join(__dirname, 'seed', 'rubric_seed.json'),
          path.join(__dirname, '..', 'rubric_seed.json'),
        ];
        for (const p of candidates) {
          try { if (fs.existsSync(p)) { data = JSON.parse(fs.readFileSync(p, 'utf8')); break; } } catch {}
        }
      } catch {}
    }
    if (!data || typeof data !== 'object') return 'No data posted and bundled rubric_seed.json not found.';
    const ds = app.get(DataSource);

    // First, remove known-bad leftover areas from earlier seeds that are NOT in the corrected
    // data (these linger because re-seeding only replaces areas it knows about). Exact-match by
    // name (plus Indigenous misspelling) so we never touch the good areas we're about to seed.
    const badAreas = ['Creative Activities', 'Mathematical Activities', 'Indigenous Language', 'Indeginous Language', 'Learners Performance'];
    for (const bad of badAreas) {
      const tpls = /indig|indeg/i.test(bad)
        ? await ds.query(`SELECT id FROM assessment_templates WHERE LOWER(learning_area) LIKE '%indig%' OR LOWER(learning_area) LIKE '%indeg%'`).catch(() => [])
        : await ds.query(`SELECT id FROM assessment_templates WHERE LOWER(learning_area) = LOWER($1)`, [bad]).catch(() => []);
      for (const tpl of (tpls as any[])) {
        const sids = (await ds.query(`SELECT id FROM assessment_strands WHERE template_id = $1`, [tpl.id]).catch(() => [])).map((r: any) => r.id);
        if (sids.length) {
          await ds.query(`DELETE FROM assessment_substrands WHERE strand_id = ANY($1::uuid[])`, [sids]).catch(() => null);
          await ds.query(`DELETE FROM assessment_strands WHERE id = ANY($1::uuid[])`, [sids]).catch(() => null);
        }
        await ds.query(`DELETE FROM assessment_templates WHERE id = $1`, [tpl.id]).catch(() => null);
      }
    }

    // Grade-specific leftover removals (an area that is valid for one band but not another).
    // - Environmental Activities is a VALID Grade 1-3 area (in the official KICD books, and
    //   schools have marks for it) so it is NOT removed — it is kept for ECDE and Grades 1-3.
    // - "Religious Activities" is an old mis-named leftover (correct ECDE name is
    //   "Religious Education Activities") — remove it wherever it appears.
    const gradeSpecificBad: Array<{ grades: string[]; area: string }> = [
      { grades: ['playgroup', 'pp1', 'pp2'], area: 'Religious Activities' },
    ];
    for (const { grades, area } of gradeSpecificBad) {
      const tpls = await ds.query(
        `SELECT id FROM assessment_templates WHERE LOWER(learning_area) = LOWER($1) AND grade_level = ANY($2::text[])`,
        [area, grades],
      ).catch(() => []);
      for (const tpl of (tpls as any[])) {
        const sids = (await ds.query(`SELECT id FROM assessment_strands WHERE template_id = $1`, [tpl.id]).catch(() => [])).map((r: any) => r.id);
        if (sids.length) {
          await ds.query(`DELETE FROM assessment_substrands WHERE strand_id = ANY($1::uuid[])`, [sids]).catch(() => null);
          await ds.query(`DELETE FROM assessment_strands WHERE id = ANY($1::uuid[])`, [sids]).catch(() => null);
        }
        await ds.query(`DELETE FROM assessment_templates WHERE id = $1`, [tpl.id]).catch(() => null);
      }
    }

    let tplCount = 0, strandCount = 0, subCount = 0;
    const log: string[] = [];
    for (const gradeLevel of Object.keys(data)) {
      for (const term of Object.keys(data[gradeLevel])) {
        const areas = data[gradeLevel][term];
        for (const learningArea of Object.keys(areas)) {
          const strands = areas[learningArea];
          if (!Array.isArray(strands) || !strands.length) continue;
          let tpl = await ds.query(
            `SELECT id FROM assessment_templates WHERE grade_level = $1 AND learning_area = $2 ORDER BY tenant_id NULLS FIRST LIMIT 1`,
            [gradeLevel, learningArea],
          ).catch(() => []);
          let templateId: string;
          if (tpl.length) templateId = tpl[0].id;
          else { const c = await ds.query(`INSERT INTO assessment_templates (grade_level, learning_area, tenant_id) VALUES ($1,$2,NULL) RETURNING id`, [gradeLevel, learningArea]); templateId = c[0].id; tplCount++; }
          if (replace) {
            const old = await ds.query(`SELECT id FROM assessment_strands WHERE template_id = $1 AND term = $2`, [templateId, term]).catch(() => []);
            const ids = old.map((r: any) => r.id);
            if (ids.length) {
              await ds.query(`DELETE FROM assessment_substrands WHERE strand_id = ANY($1::uuid[])`, [ids]).catch(() => null);
              await ds.query(`DELETE FROM assessment_strands WHERE id = ANY($1::uuid[])`, [ids]).catch(() => null);
            }
          }
          let pos = 0;
          for (const st of strands) {
            if (!st?.name) continue;
            pos++; strandCount++;
            const sRow = await ds.query(`INSERT INTO assessment_strands (template_id, position, name, term) VALUES ($1,$2,$3,$4) RETURNING id`, [templateId, pos, st.name, term]);
            const strandId = sRow[0].id;
            let sp = 0;
            for (const sub of (st.substrands || [])) {
              const subName = typeof sub === 'string' ? sub : (sub?.name || '');
              if (!subName) continue;
              sp++; subCount++;
              await ds.query(`INSERT INTO assessment_substrands (strand_id, position, name) VALUES ($1,$2,$3)`, [strandId, sp, subName]);
            }
          }
          log.push(`${gradeLevel}/${term}/${learningArea}: ${strands.length} strands`);
        }
      }
    }
    return `OK — seeded rubric.\nNew templates: ${tplCount}\nStrands: ${strandCount}\nSub-strands: ${subCount}\n\n${log.join('\n')}`;
  };

  // GET twin — runnable from the browser address bar (no console paste needed):
  // /seed-rubric-bulk-run?key=zaroda-migrate-now
  httpAdapter.get('/seed-rubric-bulk-run', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const out = await runRubricSeed(null, req.query?.replace !== 'false');
      res.type('text/plain').send(out);
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  httpAdapter.post('/seed-rubric-bulk', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    const b = req.body || {};
    if ((b.key || req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const out = await runRubricSeed(b.data, b.replace !== false);
      res.type('text/plain').send(out);
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}`);
    }
  });

  httpAdapter.post('/seed-rubric', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    const b = req.body || {};
    if ((b.key || req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const { gradeLevel, learningArea, term, strands, replace } = b;
    if (!gradeLevel || !learningArea || !term || !Array.isArray(strands) || !strands.length) {
      res.status(400).type('text/plain').send('Need gradeLevel, learningArea, term and a non-empty strands array.');
      return;
    }
    try {
      const ds = app.get(DataSource);
      // Find (or create) the template for this grade + area (global / null tenant).
      let tpl = await ds.query(
        `SELECT id FROM assessment_templates WHERE grade_level = $1 AND learning_area = $2 ORDER BY tenant_id NULLS FIRST LIMIT 1`,
        [gradeLevel, learningArea],
      ).catch(() => []);
      let templateId: string;
      if (tpl.length) {
        templateId = tpl[0].id;
      } else {
        const created = await ds.query(
          `INSERT INTO assessment_templates (grade_level, learning_area, tenant_id) VALUES ($1,$2,NULL) RETURNING id`,
          [gradeLevel, learningArea],
        );
        templateId = created[0].id;
      }

      if (replace) {
        // Delete existing strands (and their substrands via FK or manual) for this area+term.
        const old = await ds.query(`SELECT id FROM assessment_strands WHERE template_id = $1 AND term = $2`, [templateId, term]).catch(() => []);
        const ids = old.map((r: any) => r.id);
        if (ids.length) {
          await ds.query(`DELETE FROM assessment_substrands WHERE strand_id = ANY($1::uuid[])`, [ids]).catch(() => null);
          await ds.query(`DELETE FROM assessment_strands WHERE id = ANY($1::uuid[])`, [ids]).catch(() => null);
        }
      }

      // Find current max position so appended strands order after existing ones.
      const posRow = await ds.query(`SELECT COALESCE(MAX(position),0) AS m FROM assessment_strands WHERE template_id = $1 AND term = $2`, [templateId, term]).catch(() => [{ m: 0 }]);
      let pos = Number(posRow[0]?.m || 0);
      let strandCount = 0, subCount = 0;
      for (const st of strands) {
        if (!st?.name) continue;
        pos += 1; strandCount += 1;
        const sRow = await ds.query(
          `INSERT INTO assessment_strands (template_id, position, name, term) VALUES ($1,$2,$3,$4) RETURNING id`,
          [templateId, pos, st.name, term],
        );
        const strandId = sRow[0].id;
        const subs = Array.isArray(st.substrands) ? st.substrands : [];
        let sp = 0;
        for (const sub of subs) {
          const subName = typeof sub === 'string' ? sub : (sub?.name || '');
          if (!subName) continue;
          sp += 1; subCount += 1;
          await ds.query(
            `INSERT INTO assessment_substrands (strand_id, position, name) VALUES ($1,$2,$3)`,
            [strandId, sp, subName],
          );
        }
      }
      res.type('text/plain').send(`OK — ${gradeLevel} / ${learningArea} / ${term}\nInserted ${strandCount} strand(s) and ${subCount} sub-strand(s)${replace ? ' (replaced existing for this term)' : ''}.`);
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}`);
    }
  });

  // Browser-runnable: shows what learning areas exist in the rubric (assessment_templates)
  // per grade, so we can verify the rubric data. /rubric-check?key=...&grade=grade_7
  httpAdapter.get('/library-books-check', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const ds = app.get(DataSource);
      // Optional cleanup: ?deleteCode=LIB-... removes that copy (and its loans).
      let deleted = '';
      if (req.query?.deleteCode) {
        const r = await ds.query(`SELECT id FROM library_books WHERE code = $1`, [req.query.deleteCode]).catch(() => []);
        for (const row of (r as any[])) {
          await ds.query(`DELETE FROM library_loans WHERE book_id = $1`, [row.id]).catch(() => null);
          await ds.query(`DELETE FROM library_books WHERE id = $1`, [row.id]).catch(() => null);
        }
        deleted = `\nDeleted ${(r as any[]).length} copy(ies) with code ${req.query.deleteCode}\n`;
      }
      const books = await ds.query(
        `SELECT code, title, status, condition, notes,
                (SELECT COUNT(*) FROM library_loans l WHERE l.book_id = b.id) AS loans
           FROM library_books b ORDER BY created_at DESC LIMIT 100`,
      ).catch((e: any) => ({ error: e.message }));
      res.type('text/plain').send(
        deleted +
        `library_books (latest 100):\n` +
        (Array.isArray(books) ? books.map((b: any) =>
          `  ${String(b.code).padEnd(22)} ${String(b.status||'').padEnd(10)} loans:${b.loans}  ${String(b.title||'').slice(0,30)}${b.notes?'  ['+String(b.notes).slice(0,30)+']':''}`
        ).join('\n') : JSON.stringify(books)) +
        `\n\nTo delete a stray copy: add &deleteCode=THE-CODE to this URL.`,
      );
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  httpAdapter.get('/fixtures-check', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const ds = app.get(DataSource);
      await ds.query(
        `CREATE TABLE IF NOT EXISTS sports_fixtures (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW())`,
      ).catch(() => null);
      for (const [n, t] of [['discipline','text'],['kind','text'],['home_team','text'],['away_team','text'],['venue','text'],['fixture_date','date'],['type','text'],['status',"text DEFAULT 'scheduled'"],['home_score','integer'],['away_score','integer'],['winner','text'],['results','jsonb'],['notes','text'],['school_id','uuid'],['created_by','uuid'],['updated_at','timestamptz DEFAULT NOW()']] as [string,string][]) {
        await ds.query(`ALTER TABLE sports_fixtures ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
      }
      const cols = await ds.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'sports_fixtures' ORDER BY ordinal_position`,
      ).catch((e: any) => ({ error: e.message }));
      const cnt = await ds.query(`SELECT COUNT(*) AS n FROM sports_fixtures`).catch((e: any) => [{ n: 'ERR: ' + e.message }]);
      res.type('text/plain').send(
        `sports_fixtures table OK. Rows: ${cnt[0]?.n}\n\nColumns:\n` +
        (Array.isArray(cols) ? cols.map((c: any) => `  ${String(c.column_name).padEnd(16)} ${c.data_type}  ${c.is_nullable === 'NO' ? 'NOT NULL' : ''}`).join('\n') : JSON.stringify(cols)),
      );
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  httpAdapter.get('/rubric-check', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const ds = app.get(DataSource);
      const grade = req.query?.grade || null;
      const byGrade = await ds.query(
        `SELECT grade_level, COUNT(DISTINCT learning_area) AS areas, COUNT(*) AS templates,
                COUNT(*) FILTER (WHERE tenant_id IS NULL) AS global_rows
           FROM assessment_templates GROUP BY grade_level ORDER BY grade_level`,
      ).catch((e: any) => ({ error: e.message }));
      let detail: any = null;
      if (grade) {
        detail = await ds.query(
          `SELECT t.learning_area,
                  COUNT(*) FILTER (WHERE st.term = 'term_1') AS t1,
                  COUNT(*) FILTER (WHERE st.term = 'term_2') AS t2,
                  COUNT(*) FILTER (WHERE st.term = 'term_3') AS t3,
                  COUNT(*) FILTER (WHERE st.term IS NULL) AS tnull,
                  COUNT(*) AS total_strands
             FROM assessment_templates t
             LEFT JOIN assessment_strands st ON st.template_id = t.id
            WHERE t.grade_level = $1
            GROUP BY t.learning_area ORDER BY t.learning_area`,
          [grade],
        ).catch((e: any) => ({ error: e.message }));
      }
      // All-grades gap scan: every learning area whose T1/T2/T3 strand counts look incomplete.
      const allGaps = await ds.query(
        `SELECT t.grade_level, t.learning_area,
                COUNT(*) FILTER (WHERE st.term = 'term_1') AS t1,
                COUNT(*) FILTER (WHERE st.term = 'term_2') AS t2,
                COUNT(*) FILTER (WHERE st.term = 'term_3') AS t3,
                COUNT(*) FILTER (WHERE st.term IS NULL) AS tnull
           FROM assessment_templates t
           LEFT JOIN assessment_strands st ON st.template_id = t.id
          GROUP BY t.grade_level, t.learning_area
         HAVING COUNT(*) FILTER (WHERE st.term = 'term_1') = 0
             OR COUNT(*) FILTER (WHERE st.term = 'term_2') = 0
             OR COUNT(*) FILTER (WHERE st.term = 'term_3') = 0
             OR COUNT(*) FILTER (WHERE st.term IS NULL) > 0
          ORDER BY t.grade_level, t.learning_area`,
      ).catch((e: any) => ({ error: e.message }));

      res.type('text/plain').send(
        `RUBRIC (assessment_templates)\n\nBY GRADE:\n` +
        (Array.isArray(byGrade) && byGrade.length
          ? byGrade.map((r: any) => `  ${String(r.grade_level).padEnd(12)} areas:${r.areas}  templates:${r.templates}  global(null-tenant):${r.global_rows}`).join('\n')
          : `  (none) ${JSON.stringify(byGrade)}`) +
        `\n\n⚠ INCOMPLETE AREAS (missing a term, ALL GRADES):\n  ${'GRADE'.padEnd(10)} ${'AREA'.padEnd(30)} T1  T2  T3  NULL\n` +
        (Array.isArray(allGaps) && allGaps.length
          ? allGaps.map((r: any) => `  ${String(r.grade_level).padEnd(10)} ${String(r.learning_area).padEnd(30)} ${String(r.t1).padEnd(3)} ${String(r.t2).padEnd(3)} ${String(r.t3).padEnd(3)} ${r.tnull}`).join('\n')
          : `  (none — all areas have strands in every term)`) +
        (detail ? `\n\n${grade} STRANDS PER LEARNING AREA (by term):\n  ${'AREA'.padEnd(34)} T1  T2  T3  NULL  TOTAL\n` +
          (Array.isArray(detail) && detail.length
            ? detail.map((r: any) => `  ${String(r.learning_area).padEnd(34)} ${String(r.t1).padEnd(3)} ${String(r.t2).padEnd(3)} ${String(r.t3).padEnd(3)} ${String(r.tnull).padEnd(4)}  ${r.total_strands}`).join('\n')
            : `  (none for ${grade})`) : ''),
      );
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  // Browser-runnable: shows the REAL top-performing classes the dashboard computes, so we
  // can confirm the data without logging in. /dashboard-check?key=...
  httpAdapter.get('/dashboard-check', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const ds = app.get(DataSource);
      const top = await ds.query(
        `SELECT s.name AS name, ROUND(AVG(ar.percent)) AS score, COUNT(*) AS marks
           FROM assessment_results ar JOIN streams s ON s.id::text = ar.stream_id::text
          WHERE ar.percent IS NOT NULL
          GROUP BY s.name HAVING COUNT(*) > 0 ORDER BY score DESC LIMIT 10`,
      ).catch((e: any) => ({ error: e.message }));
      const totalMarks = await ds.query(`SELECT COUNT(*) AS n FROM assessment_results WHERE percent IS NOT NULL`).catch(() => [{ n: '?' }]);
      res.type('text/plain').send(
        `TOTAL MARKS WITH percent: ${totalMarks[0]?.n}\n\n` +
        `TOP CLASSES (real, computed live):\n` +
        (Array.isArray(top) && top.length
          ? top.map((t: any) => `  ${String(t.name).padEnd(24)} ${t.score}%  (${t.marks} marks)`).join('\n')
          : `  (none) ${JSON.stringify(top)}`),
      );
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  // OWNER BACKUP: download a full JSON snapshot of all data (schools, learners, marks,
  // streams, exams). Read-only. Save this file regularly — it is your restore point.
  // Visit: /export-data?key=zaroda-migrate-now
  httpAdapter.get('/export-data', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const ds = app.get(DataSource);
      const dump: any = { exportedAt: new Date().toISOString() };
      const tables = ['tenants', 'schools', 'users', 'streams', 'learners', 'exams',
        'assessment_results', 'assessment_scores'];
      for (const t of tables) {
        dump[t] = await ds.query(`SELECT * FROM ${t}`).catch((e: any) => ({ error: e.message }));
      }
      res.setHeader('Content-Disposition', `attachment; filename="zaroda-backup-${new Date().toISOString().slice(0,10)}.json"`);
      res.type('application/json').send(JSON.stringify(dump, null, 2));
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}`);
    }
  });

  // saved as grade_7, which makes the rubric show the wrong learning areas). This only
  // updates the class's grade LABEL — it does not touch or delete any marks, which are
  // tied to the learner + subject, not the stream's grade tag.
  // Visit: /fix-stream-grade?key=zaroda-migrate-now&name=Grade%205%20A&grade=grade_5
  // Matches the stream by name (case-insensitive). Safe to run.
  // Inspect the distinct subject names that marks are stored under for a stream — used
  // to recover marks that were saved under a different grade's subject names (e.g. a
  // Grade 5 class briefly labeled grade_7 saved "Integrated Science" instead of
  // "Science & Technology"). Read-only. Visit:
  //   /stream-marks?key=...&name=Grade 5 A
  httpAdapter.get('/stream-marks', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const name = String(req.query?.name || '').trim();
    if (!name) { res.type('text/plain').send('Usage: /stream-marks?key=...&name=Grade 5 A'); return; }
    try {
      const ds = app.get(DataSource);
      const st = (await ds.query(`SELECT id, grade_level FROM streams WHERE LOWER(REGEXP_REPLACE(name,'\\s+',' ','g')) = $1 LIMIT 1`,
        [name.toLowerCase().replace(/\s+/g, ' ')]).catch(() => []))[0];
      if (!st) { res.type('text/plain').send(`No stream "${name}".`); return; }
      const rows = await ds.query(
        `SELECT subject, term, COUNT(*)::int AS marks,
                MIN(max_score) AS "minOutOf", MAX(max_score) AS "maxOutOf",
                ROUND(AVG(percent)) AS "avgPct", MIN(percent) AS "minPct", MAX(percent) AS "maxPct"
           FROM assessment_results WHERE stream_id = $1 GROUP BY subject, term ORDER BY subject, term`, [st.id],
      ).catch(() => []);
      res.type('text/plain').send(
        `Stream "${name}" (grade_level=${st.grade_level})\n\nMARKS BY SUBJECT:\n` +
        (rows.length ? rows.map((r: any) => `  ${(r.subject||'').padEnd(26)} ${r.term||''}  ${String(r.marks).padStart(3)} marks  | out-of ${r.minOutOf}–${r.maxOutOf}  | pct ${r.minPct}–${r.maxPct} (avg ${r.avgPct})`).join('\n')
                     : '  (no marks found for this stream)'),
      );
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  // Rename the subject on a stream's marks (recovery for mislabeled marks). Visit:
  //   /rename-mark-subject?key=...&name=Grade 5 A&from=Integrated Science&to=Science %26 Technology
  // Only touches assessment_results.subject — moves marks from one subject label to the
  // correct one so they reappear in the rubric/report. No marks are deleted.
  // Bulk-align existing marks to the canonical seeded rubric names, band-scoped by grade.
  // Fixes historical marks entered under old names (e.g. "Mathematical Activities" →
  // "Mathematics Activities") so mark list, PDF and report card columns read uniformly.
  // /align-mark-subjects?key=...   (add &dry=1 to preview counts without changing anything)
  // Diagnose marklist mismatches: shows the rubric areas for a class vs the DISTINCT subject
  // names actually stored in marks, so we can see which marks don't match a rubric column.
  // /marklist-diag?key=...&stream=Grade 5 A   (or &grade=grade_5)
  // Find duplicate streams (same name + grade) and optionally delete the EMPTY duplicate
  // (0 learners AND 0 marks). /dedupe-streams?key=...          → report only
  //                          /dedupe-streams?key=...&delete=1  → delete empty duplicates
  httpAdapter.get('/dedupe-streams', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const doDelete = !!req.query?.delete;
    try {
      const ds = app.get(DataSource);
      // All streams with their learner + mark counts.
      const rows = await ds.query(
        `SELECT s.id, s.name, s.grade_level AS grade, s.tenant_id,
                (SELECT COUNT(*) FROM learners l WHERE l.stream_id::text = s.id::text AND l.is_active = true) AS learners,
                (SELECT COUNT(*) FROM assessment_results ar WHERE ar.stream_id::text = s.id::text) AS marks
           FROM streams s ORDER BY s.grade_level, LOWER(s.name)`,
      ).catch(() => []);
      // Group by tenant+grade+normalised name.
      const groups: Record<string, any[]> = {};
      for (const r of (rows as any[])) {
        const k = `${r.tenant_id}|${r.grade}|${String(r.name).toLowerCase().replace(/\s+/g, ' ').trim()}`;
        (groups[k] = groups[k] || []).push(r);
      }
      const report: string[] = [];
      let deleted = 0;
      for (const k of Object.keys(groups)) {
        const g = groups[k];
        if (g.length < 2) continue; // not a duplicate
        report.push(`\nDUPLICATE: "${g[0].name}" (${g[0].grade}) — ${g.length} copies:`);
        for (const s of g) report.push(`   ${s.id}  learners:${s.learners}  marks:${s.marks}`);
        // Delete only the EMPTY copies, and only if at least one non-empty copy remains.
        const nonEmpty = g.filter(s => Number(s.learners) > 0 || Number(s.marks) > 0);
        const empties = g.filter(s => Number(s.learners) === 0 && Number(s.marks) === 0);
        if (nonEmpty.length >= 1 && empties.length) {
          for (const s of empties) {
            if (doDelete) { await ds.query(`DELETE FROM streams WHERE id = $1`, [s.id]).catch(() => null); deleted++; }
            report.push(`   → ${doDelete ? 'DELETED' : 'would delete'} empty copy ${s.id}`);
          }
        } else {
          report.push(`   (no safe empty copy to remove — resolve manually)`);
        }
      }
      res.type('text/plain').send(
        (report.length ? report.join('\n') : 'No duplicate streams found.') +
        `\n\n${doDelete ? `Deleted ${deleted} empty duplicate stream(s).` : 'REPORT ONLY — add &delete=1 to remove the empty duplicates.'}`,
      );
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  httpAdapter.get('/marklist-diag', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    try {
      const ds = app.get(DataSource);
      const streamName = String(req.query?.stream || '').trim();
      let grade = String(req.query?.grade || '').trim();
      let streamId: string | null = null;
      if (streamName) {
        const st = (await ds.query(`SELECT id, grade_level FROM streams WHERE LOWER(REGEXP_REPLACE(name,'\\s+',' ','g')) = $1 LIMIT 1`,
          [streamName.toLowerCase().replace(/\s+/g, ' ')]).catch(() => []))[0];
        if (st) { streamId = st.id; grade = st.grade_level; }
      }
      if (!grade) { res.type('text/plain').send('Provide ?grade=grade_5 or ?stream=Grade 5 A'); return; }
      const rubric = (await ds.query(
        `SELECT DISTINCT learning_area AS a FROM assessment_templates WHERE grade_level = $1 ORDER BY a`, [grade],
      ).catch(() => [])).map((r: any) => r.a);
      const marksQ = streamId
        ? await ds.query(`SELECT DISTINCT subject, COUNT(*)::int n FROM assessment_results WHERE stream_id::text=$1 GROUP BY subject ORDER BY subject`, [streamId]).catch(() => [])
        : await ds.query(
            `SELECT DISTINCT ar.subject, COUNT(*)::int n FROM assessment_results ar JOIN streams s ON s.id::text=ar.stream_id::text
              WHERE s.grade_level=$1 GROUP BY ar.subject ORDER BY ar.subject`, [grade]).catch(() => []);
      const rubricLC = new Set(rubric.map((x: string) => x.toLowerCase().trim()));
      const rubricArr = rubric.map((x: string) => x.toLowerCase().trim());
      const lines = (marksQ as any[]).map(m => {
        const key = String(m.subject).toLowerCase().trim();
        const ok = rubricLC.has(key);
        let extra = '';
        if (!ok) {
          // Show the closest rubric name + a byte dump to reveal hidden differences
          // (trailing spaces, non-breaking spaces, casing, ampersand vs 'and', etc.).
          const near = rubricArr.find((r: string) => r.replace(/[^a-z]/g, '') === key.replace(/[^a-z]/g, ''));
          const bytes = Array.from(String(m.subject)).map(c => {
            const code = c.charCodeAt(0);
            return (code < 32 || code > 126) ? `[${code}]` : c;
          }).join('');
          extra = near
            ? `  ← letters match a rubric area but punctuation/spacing differ. raw="${bytes}"`
            : `  ← no similar rubric area. raw="${bytes}"`;
        }
        return `  ${ok ? '✓' : '✗ NO-MATCH'}  "${m.subject}"  (${m.n} marks)${extra}`;
      });

      // Optional auto-heal: rename mark subjects whose LETTERS match a rubric area but whose
      // spacing/punctuation differs, so they land on the rubric column. /marklist-diag?...&fix=1
      let fixLog = '';
      if (req.query?.fix) {
        const letters = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '');
        const rubricByLetters = new Map(rubric.map((r: string) => [letters(r), r]));
        for (const m of (marksQ as any[])) {
          const key = String(m.subject).toLowerCase().trim();
          if (rubricLC.has(key)) continue;               // already matches
          const target = rubricByLetters.get(letters(String(m.subject)));
          if (target && target !== m.subject) {
            if (streamId) {
              await ds.query(`UPDATE assessment_results SET subject = $1 WHERE stream_id::text = $2 AND subject = $3`, [target, streamId, m.subject]).catch(() => null);
            } else {
              await ds.query(
                `UPDATE assessment_results ar SET subject = $1 FROM streams s
                  WHERE s.id::text = ar.stream_id::text AND s.grade_level = $2 AND ar.subject = $3`,
                [target, grade, m.subject]).catch(() => null);
            }
            fixLog += `\n  fixed "${m.subject}" → "${target}" (${m.n} marks)`;
          }
        }
        fixLog = fixLog ? `\nAUTO-HEAL applied:${fixLog}\n(re-run without &fix=1 to confirm all ✓)\n` : '\nAUTO-HEAL: nothing to fix (no letter-matching mismatches).\n';
      }

      const rubricDump = rubric.map((a: string) => {
        const bytes = Array.from(a).map(c => { const code = c.charCodeAt(0); return (code < 32 || code > 126) ? `[${code}]` : c; }).join('');
        return `  • ${a}${bytes !== a ? `   raw="${bytes}"` : ''}`;
      });

      // Also list every stream of this grade and how many marks each has — helps find where
      // marks actually live when a named stream shows "(none)".
      const streamsOfGrade = await ds.query(
        `SELECT s.id, s.name,
                (SELECT COUNT(*) FROM assessment_results ar WHERE ar.stream_id::text = s.id::text) AS marks,
                (SELECT COUNT(*) FROM learners l WHERE l.stream_id::text = s.id::text AND l.is_active = true) AS learners
           FROM streams s WHERE s.grade_level = $1 ORDER BY s.name`, [grade],
      ).catch(() => []);
      const streamLines = (streamsOfGrade as any[]).map(s =>
        `  ${s.name}: ${s.marks} marks · ${s.learners} learners${streamId && s.id === streamId ? '   ← queried' : ''}`);

      res.type('text/plain').send(
        `Grade: ${grade}${streamName ? ' · ' + streamName : ''}\n` + fixLog + `\n` +
        `RUBRIC AREAS (${rubric.length}):\n${rubricDump.join('\n')}\n\n` +
        `ALL ${grade} STREAMS:\n${streamLines.join('\n') || '  (none)'}\n\n` +
        `SUBJECTS IN MARKS${streamId ? ' (this stream)' : ' (whole grade)'}:\n${lines.join('\n') || '  (none)'}\n\n` +
        `Notes:\n` +
        `  • ✗ NO-MATCH = mark subject isn't a rubric column. If letters match but spacing/punctuation\n` +
        `    differ, add &fix=1 to auto-rename them onto the rubric column.\n` +
        `  • Otherwise fix with /align-mark-subjects or /rename-mark-subject.`,
      );
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  httpAdapter.get('/align-mark-subjects', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const dry = !!req.query?.dry;
    // grade bands → [ [from, to], ... ] canonical renames.
    const ECDE = ['playgroup', 'pp1', 'pp2'];
    const LOWER = ['grade_1', 'grade_2', 'grade_3'];
    const renames: Array<{ grades: string[]; from: string; to: string }> = [
      // ECDE
      { grades: ECDE, from: 'Mathematical Activities', to: 'Mathematics Activities' },
      { grades: ECDE, from: 'Creative Activities', to: 'Creative Arts Activities' },
      { grades: ECDE, from: 'Religious Activities', to: 'Religious Education Activities' },
      // Lower Primary (Grade 1-3)
      { grades: LOWER, from: 'Mathematical Activities', to: 'Mathematics Activities' },
      { grades: LOWER, from: 'Creative Activities', to: 'Creative Arts Activities' },
      { grades: LOWER, from: 'Religious Activities', to: 'Religious Education Activities' },
      { grades: LOWER, from: 'Christian Religious Education Activities', to: 'Religious Education Activities' },
      // Junior (Grade 7-9): CA → CAS
      { grades: ['grade_7', 'grade_8', 'grade_9'], from: 'Creative Arts', to: 'Creative Arts and Sports' },
      // Upper Primary (Grade 4-6): recover marks wrongly saved as CAS back to "Creative Arts"
      // (a recurring Grade 5 bug where the column name drifted to the Junior name).
      { grades: ['grade_4', 'grade_5', 'grade_6'], from: 'Creative Arts and Sports', to: 'Creative Arts' },
    ];
    try {
      const ds = app.get(DataSource);
      const log: string[] = [];
      let total = 0;
      for (const { grades, from, to } of renames) {
        // Count first (marks whose stream is in the band and subject = from).
        const cnt = await ds.query(
          `SELECT COUNT(*)::int AS n FROM assessment_results ar
             JOIN streams s ON s.id::text = ar.stream_id::text
            WHERE s.grade_level = ANY($1::text[]) AND ar.subject = $2`,
          [grades, from],
        ).catch(() => [{ n: 0 }]);
        const n = Number(cnt[0]?.n || 0);
        if (n === 0) continue;
        if (!dry) {
          await ds.query(
            `UPDATE assessment_results ar SET subject = $3
               FROM streams s
              WHERE s.id::text = ar.stream_id::text
                AND s.grade_level = ANY($1::text[]) AND ar.subject = $2`,
            [grades, from, to],
          ).catch((e: any) => { throw e; });
        }
        log.push(`  ${grades[0].replace('grade_','G').replace('playgroup','PG')}…: "${from}" → "${to}"  (${n} marks)`);
        total += n;
      }
      res.type('text/plain').send(
        `${dry ? 'DRY RUN — no changes made.\n' : 'Aligned mark subjects to canonical rubric names.\n'}` +
        `Total marks ${dry ? 'that would be ' : ''}updated: ${total}\n${log.join('\n') || '  (nothing to change — already aligned)'}` +
        `\n\nAfter running (without &dry=1), reload the mark list / report card.`,
      );
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  httpAdapter.get('/rename-mark-subject', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const name = String(req.query?.name || '').trim();
    const from = String(req.query?.from || '').trim();
    const to = String(req.query?.to || '').trim();
    if (!name || !from || !to) { res.type('text/plain').send('Usage: /rename-mark-subject?key=...&name=Grade 5 A&from=Integrated Science&to=Science & Technology'); return; }
    try {
      const ds = app.get(DataSource);
      const st = (await ds.query(`SELECT id FROM streams WHERE LOWER(REGEXP_REPLACE(name,'\\s+',' ','g')) = $1 LIMIT 1`,
        [name.toLowerCase().replace(/\s+/g, ' ')]).catch(() => []))[0];
      if (!st) { res.type('text/plain').send(`No stream "${name}".`); return; }
      const r = await ds.query(
        `UPDATE assessment_results SET subject = $1 WHERE stream_id = $2 AND subject = $3`,
        [to, st.id, from],
      ).catch((e: any) => { throw e; });
      const n = Array.isArray(r) ? (r[1] ?? '?') : (r?.rowCount ?? '?');
      res.type('text/plain').send(`OK — moved marks on "${name}" from "${from}" to "${to}". Rows updated: ${n}.\nReload the rubric/report to see them.`);
    } catch (e: any) { res.status(500).type('text/plain').send(`ERROR: ${e.message}`); }
  });

  httpAdapter.get('/fix-stream-grade', async (req: any, res: any) => {
    const expected = process.env.MIGRATE_KEY || 'zaroda-migrate-now';
    if ((req.query?.key || '') !== expected) { res.status(403).send('Forbidden'); return; }
    const name = String(req.query?.name || '').trim();
    const id = String(req.query?.id || '').trim();
    const grade = String(req.query?.grade || '').trim();
    const valid = ['playgroup','pp1','pp2','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6',
      'grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'];
    if ((!name && !id) || !valid.includes(grade)) {
      res.type('text/plain').send('Usage: /fix-stream-grade?key=...&name=Grade 5 A&grade=grade_5   (or &id=<streamId>)'); return;
    }
    try {
      const ds = app.get(DataSource);
      // Match by exact id, or by name ignoring case AND extra spaces (so "Grade 5  A"
      // or a trailing space still matches "Grade 5 A").
      let streams;
      if (id) {
        streams = await ds.query(`SELECT id, name, grade_level FROM streams WHERE id::text = $1`, [id]).catch(() => []);
      } else {
        const norm = name.toLowerCase().replace(/\s+/g, ' ');
        streams = await ds.query(
          `SELECT id, name, grade_level FROM streams WHERE LOWER(REGEXP_REPLACE(name, '\\s+', ' ', 'g')) = $1`, [norm],
        ).catch(() => []);
        // Fallback: contains match (e.g. name has a hidden suffix)
        if (!streams.length) {
          streams = await ds.query(`SELECT id, name, grade_level FROM streams WHERE LOWER(name) LIKE $1`, [`%${name.toLowerCase()}%`]).catch(() => []);
        }
      }
      if (!streams.length) {
        const all = await ds.query(`SELECT name, grade_level FROM streams ORDER BY name`).catch(() => []);
        res.type('text/plain').send(`No stream matched "${name || id}".\n\nExisting streams (copy the exact name):\n` +
          all.map((s: any) => `  "${s.name}"  → ${s.grade_level}`).join('\n'));
        return;
      }
      const report: string[] = [];
      for (const s of streams) {
        await ds.query(`UPDATE streams SET grade_level = $1 WHERE id = $2`, [grade, s.id]).catch(() => null);
        await ds.query(`UPDATE learners SET grade_level = $1 WHERE stream_id = $2`, [grade, s.id]).catch(() => null);
        report.push(`  "${s.name}"  ${s.grade_level} → ${grade}`);
      }
      res.type('text/plain').send(`OK — updated ${streams.length} stream(s):\n${report.join('\n')}\n\nMarks are unaffected. Reload the rubric for that class to see the correct learning areas.`);
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
