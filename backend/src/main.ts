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

    // Track which migrations have run, so each applies exactly once.
    // (Most early migrations use plain CREATE TABLE and would error on re-run.)
    await ds.query(`CREATE TABLE IF NOT EXISTS _migrations (
      filename   VARCHAR(200) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => null);

    const appliedRows = await ds.query(`SELECT filename FROM _migrations`).catch(() => []);
    let applied = new Set((appliedRows || []).map((r: any) => r.filename));

    // Self-heal a broken tracker: if migrations are marked applied but the core tables
    // they create are missing (e.g. a prior deploy recorded them without actually
    // creating the schema, or this is a fresh DB seeded from a half-applied state),
    // clear the tracker so every migration re-runs and rebuilds the schema cleanly.
    if (applied.size > 0) {
      const coreExists = await ds.query(`SELECT to_regclass('public.tenants') AS t`).catch(() => [{ t: null }]);
      if (!coreExists?.[0]?.t) {
        console.warn('⚠️  migrations marked applied but core tables missing — resetting migration tracker to rebuild schema');
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

  // ── Auto-run database migrations (idempotent) ─────────────
  await runMigrations(app);

  // ── Diagnostic: confirm the assessment book seeded ────────
  try {
    const ds = app.get(DataSource);
    const r = await ds.query(`SELECT COUNT(*)::int AS n FROM assessment_templates WHERE tenant_id IS NULL`);
    const n = r?.[0]?.n ?? 0;
    if (n > 0) {
      console.log(`✅ assessment book ready: ${n} learning-area templates seeded`);
    } else {
      console.warn('⚠️  assessment book EMPTY: 0 templates. The learning-area dropdown will be blank. Migration 014 did not seed — check the log above for "014_assessment_book.sql".');
    }
  } catch (e: any) {
    console.warn(`⚠️  could not check assessment templates: ${e.message} (the assessment_templates table may not exist — migration 014 failed)`);
  }

  // ── CORS — allow the Next.js frontend ────────────────────
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL     || 'http://localhost:3001',
      'http://localhost:3001',
      'http://localhost:3000',
      'http://127.0.0.1:3001',
    ],
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

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`\n🚀 ZARODA SMS API running on http://localhost:${port}/api/v1`);
  console.log(`📚 Health check:  http://localhost:${port}/health`);
  console.log(`✅ CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3001'}\n`);
}

bootstrap();
