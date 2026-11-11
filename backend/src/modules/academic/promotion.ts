import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SchoolOnly } from '../../common/decorators/access.decorator';
import { assertStreamsWritable } from '../../common/subscription';
import { currentSchoolYear } from '../../common/school-year';

/** School order. Each grade's learning areas come from its own rubric, so moving a learner's grade is all promotion needs. */
export const GRADE_ORDER = ['playgroup', 'pp1', 'pp2', 'grade_1', 'grade_2', 'grade_3', 'grade_4', 'grade_5', 'grade_6',
  'grade_7', 'grade_8', 'grade_9', 'grade_10', 'grade_11', 'grade_12'];
export const nextGrade = (g: string): string | null => {
  const i = GRADE_ORDER.indexOf(g);
  return i >= 0 && i < GRADE_ORDER.length - 1 ? GRADE_ORDER[i + 1] : null;
};
export const gradeLabel = (g: string) => g === 'playgroup' ? 'Playgroup' : g.replace(/^pp/, 'PP').replace(/^grade_/, 'Grade ');

/** The stream's own name without its grade ("Grade 3 East" -> "East"), to find or name the same stream a grade up. */
const streamSuffix = (name: string) => name.replace(/^(playgroup|pp\s*\d+|grade\s*\d+|g\d+)\s*/i, '').trim();

const ADMIN_ROLES = ['hoi', 'dhois', 'school_admin', 'tenant_owner', 'super_admin', 'dos'];
const ACTIONS = ['promote', 'repeat', 'transfer', 'complete'] as const;
type Action = typeof ACTIONS[number];
const UNDO_DAYS = 30;
/** The last Junior School grade. Grade 10 onwards is Senior School, usually another school. */
const JUNIOR_END = 'grade_9';
type Queryable = { query: (sql: string, params?: any[]) => Promise<any> };

/**
 * True when learner `l` was already moved into the class it is in now during school year $2 (promoted in from the grade
 * below, or kept back to repeat). Those learners are done for the year: they are not offered for promotion again, and they
 * do not hold up the class below from moving in. Everyone else in a class is still waiting to move up.
 */
const MOVED_IN_THIS_YEAR = `EXISTS (SELECT 1 FROM learner_promotions p
   WHERE p.tenant_id::text = l.tenant_id::text AND p.learner_id::text = l.id::text AND p.school_year = $2
     AND p.undone_at IS NULL AND p.to_stream_id::text = l.stream_id::text)`;

@Injectable()
export class PromotionService {
  constructor(private ds: DataSource) {}

  private async stream(tenantId: string, id: string) {
    const r = await this.ds.query(
      `SELECT id::text AS id, name, grade_level AS "gradeLevel" FROM streams WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
      [id, tenantId]);
    if (!r.length) throw new BadRequestException('Class not found.');
    return r[0] as { id: string; name: string; gradeLevel: string };
  }

  /** Each class's active learners and how many are still waiting to move up this year. */
  private async waitingCounts(q: Queryable, tenantId: string, streamIds?: string[]) {
    const rows = await q.query(
      `SELECT s.id::text AS id, s.name, s.grade_level AS "gradeLevel",
              COUNT(l.id)::int AS learners,
              COUNT(l.id) FILTER (WHERE NOT ${MOVED_IN_THIS_YEAR})::int AS waiting
         FROM streams s
         LEFT JOIN learners l ON l.stream_id::text = s.id::text AND l.tenant_id::text = s.tenant_id::text AND l.is_active = true
        WHERE s.tenant_id::text = $1 ${streamIds ? 'AND s.id::text = ANY($3::text[])' : ''}
        GROUP BY s.id, s.name, s.grade_level`,
      streamIds ? [tenantId, currentSchoolYear(), streamIds] : [tenantId, currentSchoolYear()]);
    return rows as { id: string; name: string; gradeLevel: string; learners: number; waiting: number }[];
  }

  /**
   * Every class, top grade first: the order promotion has to go in. A class can only move up into a class that has
   * already moved its own learners on, or Grade 2 arriving in Grade 3 would sit alongside the Grade 3s still there.
   */
  async classes(tenantId: string) {
    const rank = (g: string) => { const i = GRADE_ORDER.indexOf(g); return i < 0 ? -1 : i; };
    return (await this.waitingCounts(this.ds, tenantId))
      .sort((a, b) => rank(b.gradeLevel) - rank(a.gradeLevel) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  /** The class(es) in the way: learners still in `targetId` from this year who have not been moved on yet. */
  private async blockedBy(q: Queryable, tenantId: string, targetId: string) {
    const [t] = await this.waitingCounts(q, tenantId, [targetId]);
    return t && t.waiting > 0
      ? `${t.name} still has ${t.waiting} learner${t.waiting === 1 ? '' : 's'} from this year. Promote ${t.name} first (work from the top grade down), then come back to this class.`
      : null;
  }

  /** One class: the learners still to move up this year, the grade they go up to, and the classes in that grade (with the matching one suggested). */
  async preview(tenantId: string, streamId: string) {
    const from = await this.stream(tenantId, streamId);
    const to = nextGrade(from.gradeLevel);
    const year = currentSchoolYear();
    const learners = await this.ds.query(
      `SELECT l.id::text AS id, TRIM(l.first_name || ' ' || COALESCE(l.last_name, '')) AS name,
              l.admission_number AS "admissionNumber", l.gender
         FROM learners l WHERE l.tenant_id::text = $1 AND l.stream_id::text = $3 AND l.is_active = true
          AND NOT ${MOVED_IN_THIS_YEAR}
        ORDER BY l.first_name, l.last_name`, [tenantId, year, streamId]);
    // Learners who arrived (or were kept back) this year: already done, so not offered again.
    const [{ count: alreadyMoved }] = await this.ds.query(
      `SELECT COUNT(*)::int AS count FROM learners l
        WHERE l.tenant_id::text = $1 AND l.stream_id::text = $3 AND l.is_active = true AND ${MOVED_IN_THIS_YEAR}`,
      [tenantId, year, streamId]);
    const targets = to ? (await this.waitingCounts(this.ds, tenantId))
      .filter(t => t.gradeLevel === to)
      .map(t => ({ id: t.id, name: t.name, waiting: t.waiting }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : [];
    const suffix = streamSuffix(from.name).toLowerCase();
    const suggested = targets.find((t: any) => streamSuffix(t.name).toLowerCase() === suffix) || (targets.length === 1 ? targets[0] : null);
    // Grade 9 ends Junior School: learners leave for a senior school through placement. Only a school that already
    // runs Grade 10 classes can keep them, and even then most leave, so completing is the default.
    const endsJunior = from.gradeLevel === JUNIOR_END;
    const canPromote = !!to && (!endsJunior || targets.length > 0);
    const actions: Action[] = !canPromote ? ['complete', 'repeat', 'transfer']
      : endsJunior ? ['complete', 'promote', 'repeat', 'transfer'] : ['promote', 'repeat', 'transfer'];
    return {
      alreadyMoved,
      stream: { ...from, gradeName: gradeLabel(from.gradeLevel) },
      nextGrade: to, nextGradeName: to ? gradeLabel(to) : null,
      actions, defaultAction: actions[0],
      completeLabel: endsJunior ? 'Completed Junior School' : 'Completed school',
      // A new Grade 10 class can't be made here: Senior School is set up on purpose, not by promoting Grade 9.
      canCreateTarget: !endsJunior,
      isFinalGrade: !canPromote, needsPathway: canPromote && to === 'grade_10',
      targets, suggestedTargetId: suggested?.id || null,
      suggestedNewName: to ? `${gradeLabel(to)}${suffix ? ' ' + streamSuffix(from.name) : ''}` : null,
      learners, schoolYear: currentSchoolYear(),
    };
  }

  /**
   * Applies one class's decisions in one transaction and logs every move, so the batch can be undone.
   * dto = { streamId, targetStreamId?, newStreamName?, decisions: [{ learnerId, action }] }
   */
  async promote(user: any, dto: any) {
    const tenantId = user.tenantId;
    const from = await this.stream(tenantId, dto.streamId);
    const to = nextGrade(from.gradeLevel);
    const decisions: { learnerId: string; action: Action }[] = (Array.isArray(dto.decisions) ? dto.decisions : [])
      .filter((d: any) => d?.learnerId && ACTIONS.includes(d.action));
    if (!decisions.length) throw new BadRequestException('Choose what happens to at least one learner.');
    if (!to && decisions.some(d => d.action === 'promote')) {
      throw new BadRequestException(`${gradeLabel(from.gradeLevel)} is the last grade: mark these learners as completed instead.`);
    }

    const promoting = decisions.some(d => d.action === 'promote');
    let target: { id: string; name: string } | null = null;
    if (promoting) {
      if (dto.targetStreamId) {
        const t = await this.stream(tenantId, dto.targetStreamId);
        if (t.gradeLevel !== to) throw new BadRequestException(`Choose a ${gradeLabel(to!)} class to promote into.`);
        target = t;
      } else if (from.gradeLevel === JUNIOR_END) {
        throw new BadRequestException(
          'Grade 10 is Senior School. Mark these learners as Completed Junior School; only a school that already has Grade 10 classes can keep them.');
      } else if (String(dto.newStreamName || '').trim()) {
        target = { id: '', name: String(dto.newStreamName).trim() };
      } else {
        throw new BadRequestException(`Choose the ${gradeLabel(to!)} class these learners move into.`);
      }
    }
    await assertStreamsWritable(this.ds, tenantId, { streamIds: [from.id, target?.id || null] });

    const batchId = randomUUID();
    const year = currentSchoolYear();
    const counts: Record<Action, number> = { promote: 0, repeat: 0, transfer: 0, complete: 0 };
    await this.ds.transaction(async (m) => {
      if (target && !target.id) {
        const school = await m.query(`SELECT school_id::text AS id FROM streams WHERE id::text = $1`, [from.id]);
        const clash = await m.query(
          `SELECT id::text AS id FROM streams WHERE tenant_id::text = $1 AND grade_level = $2 AND LOWER(name) = LOWER($3) LIMIT 1`,
          [tenantId, to, target.name]);
        target.id = clash[0]?.id || (await m.query(
          `INSERT INTO streams (tenant_id, school_id, name, grade_level, academic_year, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id::text AS id`,
          [tenantId, school[0]?.id || null, target.name, to, String(year + 1)]))[0].id;
      }
      // Never move a class in on top of learners who are still there from this year.
      if (target) {
        const blocked = await this.blockedBy(m, tenantId, target.id);
        if (blocked) throw new BadRequestException(blocked);
      }
      const ids = decisions.map(d => d.learnerId);
      // Only learners still waiting this year: ones who arrived from the grade below are not promoted a second time.
      const rows = await m.query(
        `SELECT l.id::text AS id, l.grade_level AS "gradeLevel", l.stream_id::text AS "streamId", l.status
           FROM learners l WHERE l.tenant_id::text = $1 AND l.stream_id::text = $3 AND l.is_active = true
            AND l.id::text = ANY($4::text[]) AND NOT ${MOVED_IN_THIS_YEAR}
           FOR UPDATE`, [tenantId, year, from.id, ids]);
      const byId = new Map(rows.map((r: any) => [r.id, r]));
      for (const d of decisions) {
        const l: any = byId.get(d.learnerId);
        if (!l) continue;
        const next = d.action === 'promote' ? { grade: to, stream: target!.id, status: l.status, active: true }
          : d.action === 'repeat' ? { grade: l.gradeLevel, stream: l.streamId, status: l.status, active: true }
          : { grade: l.gradeLevel, stream: l.streamId, status: d.action === 'transfer' ? 'transferred' : 'completed', active: false };
        if (d.action !== 'repeat') {
          await m.query(
            `UPDATE learners SET grade_level = $1, stream_id = $2, status = $3, is_active = $4 WHERE id::text = $5 AND tenant_id::text = $6`,
            [next.grade, next.stream, next.status, next.active, l.id, tenantId]);
        }
        await m.query(
          `INSERT INTO learner_promotions (tenant_id, batch_id, learner_id, action, from_grade, from_stream_id, to_grade, to_stream_id,
                                           from_status, to_status, school_year, done_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [tenantId, batchId, l.id, d.action, l.gradeLevel, l.streamId, next.grade, next.stream, l.status, next.status, year, user.id || null]);
        counts[d.action]++;
      }
    });
    const moved = counts.promote + counts.repeat + counts.transfer + counts.complete;
    if (!moved) throw new BadRequestException('None of those learners are still active in this class.');
    return { batchId, counts, fromStream: from.name, toStream: target?.name || null };
  }

  /** Recent promotion batches, newest first, with what each did. */
  async batches(tenantId: string) {
    return this.ds.query(
      `SELECT p.batch_id::text AS "batchId", MIN(p.done_at) AS "doneAt", MAX(p.undone_at) AS "undoneAt",
              MIN(fs.name) AS "fromStream", MIN(ts.name) FILTER (WHERE p.action = 'promote') AS "toStream",
              COUNT(*) FILTER (WHERE p.action = 'promote')::int AS promoted,
              COUNT(*) FILTER (WHERE p.action = 'repeat')::int AS repeated,
              COUNT(*) FILTER (WHERE p.action = 'transfer')::int AS transferred,
              COUNT(*) FILTER (WHERE p.action = 'complete')::int AS completed,
              MIN(TRIM(u.first_name || ' ' || COALESCE(u.last_name, ''))) AS "doneBy",
              (MIN(p.done_at) > NOW() - make_interval(days => $2) AND MAX(p.undone_at) IS NULL) AS "canUndo"
         FROM learner_promotions p
         LEFT JOIN streams fs ON fs.id::text = p.from_stream_id::text
         LEFT JOIN streams ts ON ts.id::text = p.to_stream_id::text
         LEFT JOIN users u ON u.id::text = p.done_by::text
        WHERE p.tenant_id::text = $1
        GROUP BY p.batch_id ORDER BY MIN(p.done_at) DESC LIMIT 50`, [tenantId, UNDO_DAYS]).catch(() => []);
  }

  /** Puts every learner in a batch back where they were. Refused after 30 days, or for a learner moved again since. */
  async undo(user: any, batchId: string) {
    const tenantId = user.tenantId;
    const rows = await this.ds.query(
      `SELECT id::text AS id, learner_id::text AS "learnerId", from_grade AS "fromGrade", from_stream_id::text AS "fromStream",
              to_grade AS "toGrade", to_stream_id::text AS "toStream", from_status AS "fromStatus", to_status AS "toStatus",
              done_at AS "doneAt", undone_at AS "undoneAt"
         FROM learner_promotions WHERE tenant_id::text = $1 AND batch_id::text = $2`, [tenantId, batchId]);
    if (!rows.length) throw new BadRequestException('Promotion not found.');
    if (rows.some((r: any) => r.undoneAt)) throw new BadRequestException('This promotion has already been undone.');
    if (new Date(rows[0].doneAt).getTime() < Date.now() - UNDO_DAYS * 86400000) {
      throw new BadRequestException(`A promotion can only be undone within ${UNDO_DAYS} days. Move these learners by editing them instead.`);
    }
    let restored = 0, skipped = 0;
    await this.ds.transaction(async (m) => {
      for (const r of rows) {
        const res = await m.query(
          `UPDATE learners SET grade_level = $1, stream_id = $2, status = $3, is_active = true
            WHERE id::text = $4 AND tenant_id::text = $5
              AND grade_level IS NOT DISTINCT FROM $6 AND stream_id::text IS NOT DISTINCT FROM $7
              AND status IS NOT DISTINCT FROM $8
           RETURNING id`,
          [r.fromGrade, r.fromStream, r.fromStatus, r.learnerId, tenantId, r.toGrade, r.toStream, r.toStatus]);
        res.length ? restored++ : skipped++;
      }
      await m.query(`UPDATE learner_promotions SET undone_at = NOW(), undone_by = $3 WHERE tenant_id::text = $1 AND batch_id::text = $2`,
        [tenantId, batchId, user.id || null]);
    });
    return { restored, skipped };
  }
}

@Controller('academic/promotion')
@SchoolOnly()
@UseGuards(JwtAuthGuard)
export class PromotionController {
  constructor(private svc: PromotionService) {}

  private adminOnly(req: any) {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('Only the HOI, a deputy, the Director of Studies or a school administrator can promote learners.');
    }
  }

  @Get('preview')
  preview(@Request() req: any, @Query('streamId') streamId: string) {
    this.adminOnly(req);
    return this.svc.preview(req.user.tenantId, streamId);
  }

  @Get('classes')
  classes(@Request() req: any) {
    this.adminOnly(req);
    return this.svc.classes(req.user.tenantId);
  }

  @Get('batches')
  batches(@Request() req: any) {
    this.adminOnly(req);
    return this.svc.batches(req.user.tenantId);
  }

  @Post()
  promote(@Request() req: any, @Body() dto: any) {
    this.adminOnly(req);
    return this.svc.promote(req.user, dto);
  }

  @Post(':batchId/undo')
  undo(@Request() req: any, @Param('batchId') batchId: string) {
    this.adminOnly(req);
    return this.svc.undo(req.user, batchId);
  }
}
