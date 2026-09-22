// ─────────────────────────────────────────────────────────────
// Read-side audit for personal data (Kenya Data Protection Act 2019)
//
// Writes were already auditable via audit_logs; reads were not. Under the DPA a
// school must be able to answer "who looked at this child's record", so every
// endpoint that returns learner or guardian PII is tagged with @AuditPii() and
// logged here.
//
// Usage on a controller method:
//   @AuditPii('learner.viewed', 'learners')
//   @Get('learners/:id') ...
// ─────────────────────────────────────────────────────────────
import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export const AUDIT_PII_KEY = 'audit_pii';

export interface AuditPiiMeta {
  action:     string;   // learner.viewed | learner.exported | ...
  entityType: string;   // learners | discipline_incidents | ...
}

export const AuditPii = (action: string, entityType: string) =>
  SetMetadata(AUDIT_PII_KEY, { action, entityType } as AuditPiiMeta);

/** Best-effort count of how many people's records a response exposed. */
function countRecords(body: any): number | null {
  if (Array.isArray(body)) return body.length;
  if (body && Array.isArray(body.data)) return body.data.length;
  if (body && Array.isArray(body.learners)) return body.learners.length;
  if (body && typeof body === 'object') return 1;
  return null;
}

@Injectable()
export class PiiAuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.getAllAndOverride<AuditPiiMeta>(AUDIT_PII_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!meta) return next.handle();

    const req  = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.tenantId) return next.handle();

    return next.handle().pipe(
      tap(body => {
        // Deliberately not awaited: a failing audit sink must not slow down or
        // break a teacher's request. Failures are logged loudly instead.
        this.write(meta, req, user, countRecords(body)).catch(err =>
          console.error('[pii-audit] failed to record PII access', {
            action: meta.action, route: req.route?.path, err: err?.message,
          }),
        );
      }),
    );
  }

  private async write(meta: AuditPiiMeta, req: any, user: any, recordCount: number | null) {
    const entityId = req.params?.id || req.params?.learnerId || null;
    // Trust the proxy header only for the first hop; Render/nginx append.
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket?.remoteAddress || null;

    await this.dataSource.query(
      `INSERT INTO audit_logs
         (tenant_id, user_id, action, entity_type, entity_id,
          record_count, route, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        user.tenantId,
        user.id || null,
        meta.action,
        meta.entityType,
        // entity_id is a UUID column; a non-UUID path param would abort the insert.
        /^[0-9a-f-]{36}$/i.test(entityId || '') ? entityId : null,
        recordCount,
        `${req.method} ${req.route?.path || req.url}`,
        ip,
        req.headers['user-agent']?.slice(0, 500) || null,
      ],
    );
  }
}
