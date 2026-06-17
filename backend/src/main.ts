import { NestFactory }    from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { DataSource }     from 'typeorm';
import * as fs            from 'fs';
import * as path          from 'path';
import compression from 'compression';
import helmet             from 'helmet';
import { AppModule }      from './app.module';

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
      // Allow same-origin/non-browser requests (no origin) and any listed/onrender origin.
      if (!origin || staticOrigins.includes(origin) || /\.onrender\.com$/.test(new URL(origin).hostname)) {
        return cb(null, true);
      }
      return cb(null, false);
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

  // One-time manual migration trigger you can hit from a browser (no shell needed).
  // Visit:  /run-migrations?key=YOUR_SECRET   where the secret is the MIGRATE_KEY env
  // var (defaults to 'zaroda-migrate-now'). It drops the _migrations tracker and runs
  // every (idempotent) .sql file, returning a per-file OK/FAIL report as plain text.
  // Remove or rotate MIGRATE_KEY after you're done.
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

      // Optional clean rebuild: add &reset=true to DROP the entire public schema first.
      // This wipes ALL data and objects, giving a guaranteed-clean slate so migrations
      // run start-to-finish without tripping over leftovers from earlier partial runs.
      // Use this once to fix a broken/half-built database, then migrate fresh.
      if (String(req.query?.reset || '') === 'true') {
        await ds.query(`DROP SCHEMA public CASCADE`).catch((e: any) => lines.push(`(reset note: ${e.message})`));
        await ds.query(`CREATE SCHEMA public`).catch(() => null);
        await ds.query(`GRANT ALL ON SCHEMA public TO CURRENT_USER`).catch(() => null);
        await ds.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).catch(() => null);
        await ds.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`).catch(() => null);
        lines.push('🧹 public schema reset (clean slate)');
      }

      await ds.query(`CREATE TABLE IF NOT EXISTS _migrations (filename VARCHAR(200) PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => null);
      await ds.query(`DELETE FROM _migrations`).catch(() => null);
      await ds.query(`CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $fn$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $fn$ LANGUAGE plpgsql;`).catch(() => null);
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
      let ok = 0, fail = 0;
      for (const file of files) {
        try {
          await ds.query(fs.readFileSync(path.join(dir, file), 'utf8'));
          await ds.query(`INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]).catch(() => null);
          lines.push(`OK    ${file}`); ok++;
        } catch (e: any) {
          lines.push(`FAIL  ${file} — ${String(e.message || '').slice(0, 200)}`); fail++;
        }
      }
      lines.push(`\nDONE — ${ok} ok, ${fail} failed`);
      res.type('text/plain').send(lines.join('\n'));
    } catch (e: any) {
      res.status(500).type('text/plain').send(`ERROR: ${e.message}\n${lines.join('\n')}`);
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
