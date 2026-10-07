// CAT (Continuous Assessment Test) — formative, question-level marks.
// Created and edited only by the subject teacher assigned to the stream + subject
// (teacher_stream_subjects); academic admins get read-only access to every CAT.
// Kept apart from exams/assessment_results: never feeds the mark list or report cards.

import {
  Module, Controller, Get, Post, Patch, Put, Delete, Param, Query, Body, Request, UseGuards, Header,
  BadRequestException, ForbiddenException, NotFoundException, ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AllowRoles, SchoolOnly } from '../../common/decorators/access.decorator';
import { schoolHeadInfo, schoolLetterheadHtml } from '../../common/school-letterhead';
import { percentToLevelCode } from '../pdf/cbc-report.helper';
import { PRINT_FOOTER_CSS, PRINT_FOOTER_HTML, PRINT_PAGE_CSS } from '../../common/print-footer';

const ADMIN_ROLES = ['hoi', 'dhois', 'school_admin', 'tenant_owner', 'super_admin', 'dos'];
const TEACHER_ROLES = ['class_teacher', 'subject_teacher', 'overall_class_teacher'];
const TERMS = ['term_1', 'term_2', 'term_3'];
const SENIOR = ['grade_7', 'grade_8', 'grade_9', 'grade_10', 'grade_11', 'grade_12'];
const LEVEL_CODES = { senior: ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'], junior: ['EE', 'ME', 'AE', 'BE'] };
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

@Controller('cats')
@SchoolOnly()
@UseGuards(JwtAuthGuard)
export class CatController {
  constructor(private readonly ds: DataSource) {}

  private allow(user: any) {
    if (!ADMIN_ROLES.includes(user.role) && !TEACHER_ROLES.includes(user.role)) {
      throw new ForbiddenException('You do not have access to CATs.');
    }
  }

  private assignments(user: any) {
    return this.ds.query(
      `SELECT tss.stream_id::text AS "streamId", s.name AS "streamName", s.grade_level AS "gradeLevel", tss.subject
         FROM teacher_stream_subjects tss JOIN streams s ON s.id::text = tss.stream_id::text
        WHERE tss.tenant_id::text = $1 AND tss.teacher_id::text = $2 AND s.tenant_id::text = $1
        ORDER BY s.name, tss.subject`,
      [user.tenantId, user.id],
    );
  }

  private async load(user: any, id: string) {
    this.allow(user);
    const rows = await this.ds.query(
      `SELECT c.id, c.teacher_id::text AS "teacherId", c.stream_id::text AS "streamId", c.subject, c.title,
              c.term, c.academic_year AS "academicYear", c.cat_date::text AS "catDate",
              s.name AS "streamName", s.grade_level AS "gradeLevel",
              TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS "teacherName"
         FROM cats c
         LEFT JOIN streams s ON s.id::text = c.stream_id::text
         LEFT JOIN users u ON u.id::text = c.teacher_id::text
        WHERE c.id::text = $1 AND c.tenant_id::text = $2 AND c.deleted_at IS NULL AND c.subject IS NOT NULL`,
      [id, user.tenantId],
    ).catch(() => []);
    const cat = rows[0];
    if (!cat) throw new NotFoundException('CAT not found.');
    const canEdit = cat.teacherId === String(user.id);
    if (!canEdit && !ADMIN_ROLES.includes(user.role)) throw new ForbiddenException('This CAT belongs to another teacher.');
    return { ...cat, canEdit };
  }

  private async loadForEdit(user: any, id: string) {
    const cat = await this.load(user, id);
    if (!cat.canEdit) throw new ForbiddenException('Read-only: only the subject teacher who created this CAT can change it.');
    return cat;
  }

  private async scoreCount(catId: string) {
    const r = await this.ds.query(`SELECT COUNT(*)::int AS n FROM cat_scores WHERE cat_id::text = $1`, [catId]);
    return r[0]?.n || 0;
  }

  @Get()
  async list(@Request() req: any, @Query() q: any) {
    const u = req.user;
    this.allow(u);
    const admin = ADMIN_ROLES.includes(u.role);
    const cats = await this.ds.query(
      `SELECT c.id, c.teacher_id::text AS "teacherId", c.stream_id::text AS "streamId", c.subject, c.title,
              c.term, c.cat_date::text AS "catDate", s.name AS "streamName",
              TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS "teacherName",
              (SELECT COUNT(*)::int FROM cat_questions q WHERE q.cat_id = c.id) AS "questionCount",
              (SELECT COALESCE(SUM(max_marks),0)::float FROM cat_questions q WHERE q.cat_id = c.id) AS "maxTotal",
              (SELECT COUNT(DISTINCT learner_id)::int FROM cat_scores sc WHERE sc.cat_id = c.id) AS "learnersMarked"
         FROM cats c
         LEFT JOIN streams s ON s.id::text = c.stream_id::text
         LEFT JOIN users u ON u.id::text = c.teacher_id::text
        WHERE c.tenant_id::text = $1 AND c.deleted_at IS NULL AND c.subject IS NOT NULL
          AND ($2::boolean OR c.teacher_id::text = $3)
          AND ($4::text IS NULL OR c.stream_id::text = $4)
          AND ($5::text IS NULL OR c.term = $5)
        ORDER BY c.cat_date DESC NULLS LAST, c.created_at DESC`,
      [u.tenantId, admin, u.id, q.streamId || null, q.term || null],
    );
    return { cats, assignments: await this.assignments(u), readOnlyAll: admin };
  }

  // Parent view: only their own child's CAT results (linked by guardian email, as elsewhere).
  @AllowRoles('parent')
  @Get('child')
  childReport(@Request() req: any, @Query() q: any) {
    return this.childCats(req.user, q.learnerId, q.term);
  }

  @AllowRoles('parent')
  @Get('child/sheet')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async childSheet(@Request() req: any, @Query() q: any) {
    const r = await this.childCats(req.user, q.learnerId, q.term);
    if (!r.chosen) throw new NotFoundException('No child linked to your account.');
    const senior = SENIOR.includes(r.chosen.gradeLevel);
    const blocks = r.cats.map((c: any) => `
      <h3>${esc(c.subject)} — ${esc(c.title)}${c.catDate ? ` <span class="note">(${esc(c.catDate)})</span>` : ''}</h3>
      <table><thead><tr><th>Strand</th><th>Marks</th><th>Level</th></tr></thead><tbody>
        ${c.strands.map((s: any) => `<tr><td class="nm">${esc(s.name)}</td><td>${s.got} / ${s.max}</td><td><b>${s.level}</b></td></tr>`).join('')}
        <tr class="sr"><td class="nm"><b>Total</b></td><td><b>${c.total} / ${c.max}</b> (${c.pct}%)</td><td><b>${c.level}</b></td></tr>
      </tbody></table>
      <p class="note">Class average: ${c.classAvgPct}% (${percentToLevelCode(Math.round(c.classAvgPct), senior)}).
        ${c.practise.length ? `<b>Practise at home:</b> ${c.practise.map((x: any) => esc(x)).join(', ')}.` : 'Well done — no weak areas in this CAT.'}</p>`).join('');
    const school = await schoolHeadInfo(this.ds, req.user.tenantId);
    return `<!doctype html><html><head><meta charset="utf-8"><title>CAT report</title><style>
      .cs{font-family:Arial,sans-serif;color:#111;padding:10px;font-size:10px;background:#fff}
      .cs table{font-size:inherit;border-collapse:collapse;width:100%;margin-top:4px}.cs th,.cs td{border:1px solid #bbb;padding:2px 4px;text-align:center}
      .cs th{background:#1a2e5a;color:#fff;font-size:10px}.cs td.nm{text-align:left}.cs tr.sr td{background:#fdf6e3}
      .cs .meta{font-size:11px;margin:3px 0}.cs h3{margin:8px 0 2px;font-size:11px}.cs .note{font-size:10px;color:#444;margin:3px 0;font-weight:normal}
      @page{size:A4 portrait;margin:10mm}${PRINT_FOOTER_CSS}${PRINT_PAGE_CSS}
    </style></head><body><div class="cs">
      ${schoolLetterheadHtml(school, `CAT Report · ${r.chosen.name}`)}
      <p class="meta"><b>Learner:</b> ${esc(r.chosen.name)} &nbsp; <b>Adm:</b> ${esc(r.chosen.admissionNumber)} &nbsp; <b>Class:</b> ${esc(r.chosen.streamName)}${q.term ? ` &nbsp; <b>Term:</b> ${esc(String(q.term).replace('term_', 'Term '))}` : ''}</p>
      ${blocks || '<p class="meta">No CAT marks yet.</p>'}
      <p class="note">CATs are continuous (formative) assessments to guide learning; they are not part of the report card.</p>
      ${PRINT_FOOTER_HTML}
    </div></body></html>`;
  }

  private async childCats(user: any, learnerId?: string, term?: string) {
    const email = String(user.email || '').toLowerCase().trim();
    const children = email ? await this.ds.query(
      `SELECT l.id::text AS id, TRIM(l.first_name || ' ' || COALESCE(l.last_name,'')) AS name, l.admission_number AS "admissionNumber",
              l.grade_level AS "gradeLevel", s.name AS "streamName"
         FROM learners l LEFT JOIN streams s ON s.id::text = l.stream_id::text
        WHERE l.tenant_id::text = $1 AND LOWER(l.guardian_email) = $2 ORDER BY l.first_name`,
      [user.tenantId, email]) : [];
    if (learnerId && !children.some((c: any) => c.id === learnerId)) throw new ForbiddenException('This learner is not linked to your account.');
    const chosen = children.find((c: any) => c.id === learnerId) || children[0] || null;
    if (!chosen) return { children: [], chosen: null, cats: [] };
    const senior = SENIOR.includes(chosen.gradeLevel);
    const level = (pct: number) => percentToLevelCode(Math.round(pct), senior);
    const r1 = (n: number) => Math.round(n * 10) / 10;

    const cats = await this.ds.query(
      `SELECT c.id::text AS id, c.title, c.subject, c.term, c.cat_date::text AS "catDate"
         FROM cats c
        WHERE c.tenant_id::text = $1 AND c.deleted_at IS NULL AND c.subject IS NOT NULL
          AND ($3::text IS NULL OR c.term = $3)
          AND EXISTS (SELECT 1 FROM cat_scores x WHERE x.cat_id = c.id AND x.learner_id::text = $2)
        ORDER BY c.cat_date DESC NULLS LAST, c.created_at DESC`,
      [user.tenantId, chosen.id, term || null]);
    if (!cats.length) return { children, chosen, cats: [] };
    const ids = cats.map((c: any) => c.id);
    const [questions, scores] = await Promise.all([
      this.ds.query(`SELECT id::text AS id, cat_id::text AS "catId", number, max_marks::float AS "maxMarks", strand, sub_strand AS "subStrand"
                       FROM cat_questions WHERE cat_id::text = ANY($1) ORDER BY number`, [ids]),
      this.ds.query(`SELECT cat_id::text AS "catId", question_id::text AS "questionId", learner_id::text AS "learnerId", score::float AS score
                       FROM cat_scores WHERE cat_id::text = ANY($1)`, [ids]),
    ]);

    return {
      children, chosen,
      cats: cats.map((c: any) => {
        const qs = questions.filter((q: any) => q.catId === c.id);
        const sc = scores.filter((s: any) => s.catId === c.id);
        const mine = new Map<string, number>(sc.filter((s: any) => s.learnerId === chosen.id).map((s: any) => [s.questionId, s.score]));
        const max = qs.reduce((a: number, q: any) => a + q.maxMarks, 0);
        const total = qs.reduce((a: number, q: any) => a + (mine.get(q.id) ?? 0), 0);
        const satCount = new Set(sc.map((s: any) => s.learnerId)).size;
        const classAvg = satCount ? sc.reduce((a: number, s: any) => a + s.score, 0) / satCount : 0;
        const strands: any[] = [];
        for (const q of qs) {
          const name = q.strand || 'Other';
          let st = strands.find(x => x.name === name);
          if (!st) strands.push(st = { name, got: 0, max: 0 });
          st.got += mine.get(q.id) ?? 0; st.max += q.maxMarks;
        }
        return {
          id: c.id, title: c.title, subject: c.subject, term: c.term, catDate: c.catDate,
          total, max, pct: max ? r1((total / max) * 100) : 0, level: level(max ? (total / max) * 100 : 0),
          classAvgPct: max ? r1((classAvg / max) * 100) : 0,
          strands: strands.map(st => ({ ...st, level: level(st.max ? (st.got / st.max) * 100 : 0) })),
          questions: qs.map((q: any) => ({ number: q.number, maxMarks: q.maxMarks, strand: q.strand, subStrand: q.subStrand, score: mine.get(q.id) ?? null })),
          practise: Array.from(new Set(qs.filter((q: any) => (mine.get(q.id) ?? 0) < q.maxMarks / 2).map((q: any) => q.subStrand || q.strand || `Q${q.number}`))),
        };
      }),
    };
  }

  @Post()
  async create(@Request() req: any, @Body() dto: any) {
    const u = req.user;
    this.allow(u);
    const title = String(dto.title || '').trim();
    if (!title || !dto.streamId || !dto.subject) throw new BadRequestException('Title, stream and subject are required.');
    if (!TERMS.includes(dto.term)) throw new BadRequestException('Pick a term.');
    const mine = await this.assignments(u);
    const a = mine.find((r: any) => r.streamId === String(dto.streamId) && r.subject.toLowerCase() === String(dto.subject).toLowerCase());
    if (!a) throw new ForbiddenException('You can only create a CAT for a subject and stream you are assigned to teach.');
    const rows = await this.ds.query(
      `INSERT INTO cats (tenant_id, teacher_id, stream_id, subject, title, term, academic_year, cat_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [u.tenantId, u.id, a.streamId, a.subject, title, dto.term, dto.academicYear || null, dto.catDate || null],
    );
    return { id: rows[0].id };
  }

  @Get(':id')
  get(@Request() req: any, @Param('id') id: string) {
    return this.detail(req.user, id);
  }

  // Printable mark sheet: per-question marks, per-strand totals + CBC level, overall total.
  @Get(':id/sheet')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async sheet(@Request() req: any, @Param('id') id: string) {
    const { cat, questions, learners, scores } = await this.detail(req.user, id);
    const senior = SENIOR.includes(cat.gradeLevel);
    const score = new Map<string, number>(scores.map((s: any) => [`${s.learnerId}:${s.questionId}`, s.score]));
    const groups: { name: string; qs: any[]; max: number }[] = [];
    for (const q of questions) {
      const name = q.strand || 'No strand';
      let g = groups.find(x => x.name === name);
      if (!g) groups.push(g = { name, qs: [], max: 0 });
      g.qs.push(q); g.max += q.maxMarks;
    }
    const maxTotal = questions.reduce((a: number, q: any) => a + q.maxMarks, 0);
    const sum = (lid: string, qs: any[]) => {
      const v = qs.map(q => score.get(`${lid}:${q.id}`)).filter(x => x !== undefined) as number[];
      return v.length ? v.reduce((a, b) => a + b, 0) : null;
    };
    const lvl = (got: number | null, max: number) => got === null || !max ? '<td>—</td>'
      : `<td><b>${got}</b> <span class="lv">${percentToLevelCode(Math.round((got / max) * 100), senior)}</span></td>`;
    const rows = learners.map((l: any, i: number) => `<tr><td>${i + 1}</td><td class="nm">${esc(l.firstName)} ${esc(l.lastName)}</td><td>${esc(l.admissionNumber)}</td>${
      questions.map((q: any) => `<td>${score.get(`${l.id}:${q.id}`) ?? ''}</td>`).join('')}${
      groups.map(g => lvl(sum(l.id, g.qs), g.max)).join('')}${lvl(sum(l.id, questions), maxTotal)}</tr>`).join('');
    const key = questions.map((q: any) => `<tr><td>Q${q.number}</td><td>${q.maxMarks}</td><td>${esc(q.strand)}</td><td>${esc(q.subStrand)}</td></tr>`).join('');
    const school = await schoolHeadInfo(this.ds, req.user.tenantId);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(cat.title)}</title><style>
      .cs{font-family:Arial,sans-serif;color:#111;padding:10px;font-size:10px;background:#fff}
      .cs table{font-size:inherit;border-collapse:collapse;width:100%;margin-top:8px}.cs th,.cs td{border:1px solid #bbb;padding:2px 3px;text-align:center}
      .cs th{background:#1a2e5a;color:#fff;font-size:10px}.cs th.st{background:#d4af37;color:#111}.cs td.nm{text-align:left;white-space:nowrap}
      .cs .lv{font-size:9px;font-weight:bold;color:#1a2e5a}.cs .meta{font-size:11px;margin:3px 0}.cs h3{margin:8px 0 2px;font-size:11px}
      @page{size:A4 landscape;margin:10mm}${PRINT_FOOTER_CSS}${PRINT_PAGE_CSS}
    </style></head><body><div class="cs">
      ${schoolLetterheadHtml(school, `CAT Mark Sheet · ${cat.title}`)}
      <p class="meta"><b>Class:</b> ${esc(cat.streamName)} &nbsp; <b>Learning area:</b> ${esc(cat.subject)} &nbsp; <b>Term:</b> ${esc(String(cat.term).replace('term_', 'Term '))}${
        cat.catDate ? ` &nbsp; <b>Date:</b> ${esc(cat.catDate)}` : ''} &nbsp; <b>Teacher:</b> ${esc(cat.teacherName)}</p>
      <table><thead><tr><th>#</th><th>Learner</th><th>Adm</th>${questions.map((q: any) => `<th>Q${q.number}<br>/${q.maxMarks}</th>`).join('')}${
        groups.map(g => `<th class="st">${esc(g.name)}<br>/${g.max}</th>`).join('')}<th class="st">Total<br>/${maxTotal}</th></tr></thead><tbody>${rows}</tbody></table>
      <h3>Question key</h3><table style="width:auto"><thead><tr><th>Q</th><th>Max</th><th>Strand</th><th>Sub-strand</th></tr></thead><tbody>${key}</tbody></table>
      ${PRINT_FOOTER_HTML}
    </div></body></html>`;
  }

  // Item analysis over learners who sat (≥1 mark); a blank question counts as 0 for them.
  @Get(':id/analysis')
  async analysis(@Request() req: any, @Param('id') id: string) {
    const { cat, ...rest } = await this.analyse(req.user, id);
    return rest;
  }

  @Get(':id/analysis/sheet')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async analysisSheet(@Request() req: any, @Param('id') id: string) {
    const a = await this.analyse(req.user, id);
    const { cat } = a;
    const counts = (c: Record<string, number>) => a.levelCodes.map((k: string) => `<td>${c[k] || 0}</td>`).join('');
    const lvHead = a.levelCodes.map((k: string) => `<th class="st">${k}</th>`).join('');
    const qRows = a.questions.map((q: any) => `<tr${q.flagged ? ' class="fl"' : ''}><td>${q.flagged ? '⚠ ' : ''}Q${q.number}</td><td class="nm">${esc([q.strand, q.subStrand].filter(Boolean).join(' › ') || '—')}</td><td>${q.maxMarks}</td><td>${q.avg} (${q.avgPct}%)</td><td>${q.fullPct}%</td><td>${q.partialPct}%</td><td>${q.zeroPct}%</td><td><b>${q.belowHalfPct}%</b></td></tr>`).join('');
    const sRows = a.strands.map((s: any) => [
      `<tr class="sr"><td class="nm"><b>${esc(s.name)}</b></td><td>${s.max}</td><td>${s.avg}</td><td>${s.avgPct}%</td><td><b>${s.level || '—'}</b></td><td>${s.flagged || '—'}</td>${counts(s.levelCounts)}</tr>`,
      ...s.subStrands.map((x: any) => `<tr><td class="nm" style="padding-left:14px">${esc(x.name)}</td><td>${x.max}</td><td>${x.avg}</td><td>${x.avgPct}%</td><td>${x.level || '—'}</td><td>${x.flagged || '—'}</td>${counts(x.levelCounts)}</tr>`),
    ].join('')).join('');
    const lRows = a.learners.map((l: any, i: number) => `<tr><td>${i + 1}</td><td class="nm">${esc(l.name)}</td><td>${esc(l.admissionNumber)}</td><td>${l.total} / ${a.maxTotal}</td><td><b>${l.level}</b></td><td class="nm">${l.missed.map((m: any) => `Q${m.number}${m.subStrand ? ` · ${esc(m.subStrand)}` : ''}: ${m.score === null ? 'not marked' : `${m.score}/${m.maxMarks}`}`).join('; ') || 'None'}</td></tr>`).join('');
    const school = await schoolHeadInfo(this.ds, req.user.tenantId);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(cat.title)} — item analysis</title><style>
      .cs{font-family:Arial,sans-serif;color:#111;padding:10px;font-size:10px;background:#fff}
      .cs table{font-size:inherit;border-collapse:collapse;width:100%;margin-top:6px}.cs th,.cs td{border:1px solid #bbb;padding:2px 3px;text-align:center}
      .cs th{background:#1a2e5a;color:#fff;font-size:10px}.cs th.st{background:#d4af37;color:#111}.cs td.nm{text-align:left}
      .cs tr.fl td{background:#fee2e2;color:#991b1b}.cs tr.sr td{background:#fdf6e3}.cs .meta{font-size:11px;margin:3px 0}
      .cs h3{margin:8px 0 2px;font-size:11px}.cs .note{font-size:10px;color:#555;margin:2px 0}
      @page{size:A4 landscape;margin:10mm}${PRINT_FOOTER_CSS}${PRINT_PAGE_CSS}
    </style></head><body><div class="cs">
      ${schoolLetterheadHtml(school, `CAT Item Analysis · ${cat.title}`)}
      <p class="meta"><b>Class:</b> ${esc(cat.streamName)} &nbsp; <b>Learning area:</b> ${esc(cat.subject)} &nbsp; <b>Term:</b> ${esc(String(cat.term).replace('term_', 'Term '))}${cat.catDate ? ` &nbsp; <b>Date:</b> ${esc(cat.catDate)}` : ''} &nbsp; <b>Teacher:</b> ${esc(cat.teacherName)}</p>
      <p class="meta"><b>Learners sat:</b> ${a.sat} / ${a.enrolled} &nbsp; <b>Class average:</b> ${a.classAvg} / ${a.maxTotal} (${a.classAvgPct}%, ${a.classLevel || '—'}) &nbsp; <b>Flagged questions:</b> ${a.questions.filter((q: any) => q.flagged).length}</p>
      <h3>Learners per level (CAT total)</h3><table style="width:auto"><thead><tr>${lvHead}</tr></thead><tbody><tr>${counts(a.levelCounts)}</tr></tbody></table>
      <h3>Per question</h3><p class="note">Shaded red: more than half the learners scored below half the marks.</p>
      <table><thead><tr><th>Q</th><th>Strand › Sub-strand</th><th>Max</th><th>Class avg</th><th>Full</th><th>Partial</th><th>Zero</th><th>Below half</th></tr></thead><tbody>${qRows}</tbody></table>
      <h3>Strand performance</h3>
      <table><thead><tr><th>Strand / sub-strand</th><th>Max</th><th>Class avg</th><th>Avg %</th><th>Level</th><th>Flagged</th>${lvHead}</tr></thead><tbody>${sRows}</tbody></table>
      <h3>Learner drill-down</h3><p class="note">Questions where the learner scored less than half the marks (score / out of). "Not marked" = no mark entered for that question.</p>
      <table><thead><tr><th>#</th><th>Learner</th><th>Adm</th><th>Total</th><th>Level</th><th>Questions scored below half</th></tr></thead><tbody>${lRows}</tbody></table>
      ${PRINT_FOOTER_HTML}
    </div></body></html>`;
  }

  private async analyse(user: any, id: string) {
    const { cat, questions, learners, scores } = await this.detail(user, id);
    const senior = SENIOR.includes(cat.gradeLevel);
    const level = (pct: number) => percentToLevelCode(Math.round(pct), senior);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const score = new Map<string, number>(scores.map((s: any) => [`${s.learnerId}:${s.questionId}`, s.score]));
    const sat = learners.filter((l: any) => questions.some((q: any) => score.has(`${l.id}:${q.id}`)));
    const n = sat.length;
    const got = (l: any, q: any) => score.get(`${l.id}:${q.id}`) ?? 0;
    const pctOf = (count: number) => (n ? r1((count / n) * 100) : 0);

    const qStats = questions.map((q: any) => {
      const vals = sat.map((l: any) => got(l, q));
      const avg = n ? vals.reduce((a: number, v: number) => a + v, 0) / n : 0;
      const belowHalf = pctOf(vals.filter((v: number) => v < q.maxMarks / 2).length);
      return {
        id: q.id, number: q.number, maxMarks: q.maxMarks, strand: q.strand, subStrand: q.subStrand,
        fullPct: pctOf(vals.filter((v: number) => v >= q.maxMarks).length),
        partialPct: pctOf(vals.filter((v: number) => v > 0 && v < q.maxMarks).length),
        zeroPct: pctOf(vals.filter((v: number) => v === 0).length),
        avg: r1(avg), avgPct: q.maxMarks ? r1((avg / q.maxMarks) * 100) : 0,
        belowHalfPct: belowHalf, flagged: n > 0 && belowHalf > 50,
      };
    });

    const levelCodes = senior ? LEVEL_CODES.senior : LEVEL_CODES.junior;
    const tally = (pcts: number[]) => pcts.reduce((c: Record<string, number>, p) => { const k = level(p); c[k] = (c[k] || 0) + 1; return c; }, {});
    const roll = (qs: any[]) => {
      const max = qs.reduce((a, q) => a + q.maxMarks, 0);
      const sums = sat.map((l: any) => qs.reduce((b, q) => b + got(l, q), 0));
      const avg = n ? sums.reduce((a: number, v: number) => a + v, 0) / n : 0;
      const avgPct = max ? r1((avg / max) * 100) : 0;
      return {
        max, avg: r1(avg), avgPct, level: n ? level(avgPct) : null, flagged: qs.filter(q => q.flagged).length,
        levelCounts: max ? tally(sums.map((v: number) => (v / max) * 100)) : {},
      };
    };
    const strands: any[] = [];
    for (const q of qStats) {
      const name = q.strand || 'No strand';
      let s = strands.find(x => x.name === name);
      if (!s) strands.push(s = { name, qs: [], subs: [] as any[] });
      s.qs.push(q);
      const subName = q.subStrand || '—';
      let sub = s.subs.find((x: any) => x.name === subName);
      if (!sub) s.subs.push(sub = { name: subName, qs: [] });
      sub.qs.push(q);
    }

    const maxTotal = questions.reduce((a: number, q: any) => a + q.maxMarks, 0);
    const learnerRows = sat.map((l: any) => {
      const total = questions.reduce((a: number, q: any) => a + got(l, q), 0);
      const pct = maxTotal ? (total / maxTotal) * 100 : 0;
      return {
        id: l.id, name: `${l.firstName} ${l.lastName}`.trim(), admissionNumber: l.admissionNumber,
        total, pct: r1(pct), level: level(pct),
        missed: questions.filter((q: any) => got(l, q) < q.maxMarks / 2)
          .map((q: any) => ({ number: q.number, subStrand: q.subStrand || q.strand || null, score: score.get(`${l.id}:${q.id}`) ?? null, maxMarks: q.maxMarks })),
      };
    }).sort((a: any, b: any) => b.total - a.total);
    const classAvg = n ? learnerRows.reduce((a: number, l: any) => a + l.total, 0) / n : 0;

    return {
      cat, sat: n, enrolled: learners.length, maxTotal, levelCodes,
      levelCounts: maxTotal ? tally(learnerRows.map((l: any) => (l.total / maxTotal) * 100)) : {},
      classAvg: r1(classAvg), classAvgPct: maxTotal ? r1((classAvg / maxTotal) * 100) : 0,
      classLevel: n ? level(maxTotal ? (classAvg / maxTotal) * 100 : 0) : null,
      questions: qStats,
      strands: strands.map(s => ({ name: s.name, ...roll(s.qs), subStrands: s.subs.map((x: any) => ({ name: x.name, ...roll(x.qs) })) })),
      learners: learnerRows,
    };
  }

  private async detail(user: any, id: string) {
    const cat = await this.load(user, id);
    const [questions, learners, scores] = await Promise.all([
      this.ds.query(
        `SELECT id, number, max_marks::float AS "maxMarks", strand, sub_strand AS "subStrand", substrand_id AS "substrandId"
           FROM cat_questions WHERE cat_id::text = $1 ORDER BY number`, [id]),
      this.ds.query(
        `SELECT id, first_name AS "firstName", last_name AS "lastName", admission_number AS "admissionNumber"
           FROM learners WHERE tenant_id::text = $1 AND stream_id::text = $2 AND is_active = true
          ORDER BY first_name, last_name`, [user.tenantId, cat.streamId]),
      this.ds.query(
        `SELECT question_id AS "questionId", learner_id AS "learnerId", score::float AS score
           FROM cat_scores WHERE cat_id::text = $1`, [id]),
    ]);
    return { cat, questions, learners, scores, locked: scores.length > 0 };
  }

  @Patch(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.loadForEdit(req.user, id);
    const title = dto.title != null ? String(dto.title).trim() : null;
    if (title === '') throw new BadRequestException('Title cannot be empty.');
    await this.ds.query(
      `UPDATE cats SET title = COALESCE($2, title), cat_date = COALESCE($3::date, cat_date), updated_at = NOW()
        WHERE id::text = $1`,
      [id, title, dto.catDate || null],
    );
    return { message: 'CAT updated' };
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.loadForEdit(req.user, id);
    await this.ds.query(`UPDATE cats SET deleted_at = NOW() WHERE id::text = $1`, [id]);
    return { message: 'CAT deleted' };
  }

  // Replaces the question set. Once marks exist only strand labels may change —
  // adding, removing or re-scoring questions would silently change learners' totals.
  @Put(':id/questions')
  async saveQuestions(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    const u = req.user;
    await this.loadForEdit(u, id);
    const qs: any[] = Array.isArray(dto.questions) ? dto.questions : [];
    if (!qs.length) throw new BadRequestException('Add at least one question.');
    const numbers = new Set<number>();
    for (const q of qs) {
      const n = Number(q.number), m = Number(q.maxMarks);
      if (!Number.isInteger(n) || n < 1) throw new BadRequestException('Question numbers must be whole numbers from 1.');
      if (numbers.has(n)) throw new BadRequestException(`Question ${n} appears twice.`);
      if (!(m > 0) || m > 1000) throw new BadRequestException(`Question ${n} needs max marks above 0.`);
      numbers.add(n);
    }
    const label = (v: any) => (v != null && String(v).trim() ? String(v).trim().slice(0, 200) : null);

    if (await this.scoreCount(id)) {
      const existing = await this.ds.query(
        `SELECT id, number, max_marks::float AS "maxMarks" FROM cat_questions WHERE cat_id::text = $1`, [id]);
      const same = existing.length === qs.length && qs.every(q =>
        existing.some((e: any) => e.number === Number(q.number) && e.maxMarks === Number(q.maxMarks)));
      if (!same) throw new ConflictException('Marks are already entered for this CAT, so questions and max marks are locked. Clear the marks first to change them.');
      for (const q of qs) {
        await this.ds.query(
          `UPDATE cat_questions SET strand = $3, sub_strand = $4, substrand_id = $5 WHERE cat_id::text = $1 AND number = $2`,
          [id, Number(q.number), label(q.strand), label(q.subStrand), q.substrandId || null]);
      }
      return { message: 'Strands updated' };
    }

    await this.ds.transaction(async (m) => {
      await m.query(`DELETE FROM cat_questions WHERE cat_id::text = $1`, [id]);
      for (const q of qs) {
        await m.query(
          `INSERT INTO cat_questions (tenant_id, cat_id, number, max_marks, strand, sub_strand, substrand_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [u.tenantId, id, Number(q.number), Number(q.maxMarks), label(q.strand), label(q.subStrand), q.substrandId || null]);
      }
      await m.query(`UPDATE cats SET updated_at = NOW() WHERE id::text = $1`, [id]);
    });
    return { message: 'Questions saved' };
  }

  // Grid save: [{ learnerId, questionId, score }]; a blank score clears that cell.
  @Put(':id/scores')
  async saveScores(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    const u = req.user;
    const cat = await this.loadForEdit(u, id);
    const cells: any[] = Array.isArray(dto.scores) ? dto.scores : [];
    const questions = await this.ds.query(
      `SELECT id::text AS id, number, max_marks::float AS "maxMarks" FROM cat_questions WHERE cat_id::text = $1`, [id]);
    const qById = new Map<string, any>(questions.map((q: any) => [q.id, q]));
    const learnerRows = await this.ds.query(
      `SELECT id::text AS id FROM learners WHERE tenant_id::text = $1 AND stream_id::text = $2`, [u.tenantId, cat.streamId]);
    const learnerIds = new Set(learnerRows.map((r: any) => r.id));

    await this.ds.transaction(async (m) => {
      for (const c of cells) {
        const q = qById.get(String(c.questionId));
        if (!q) throw new BadRequestException('Unknown question in this CAT.');
        if (!learnerIds.has(String(c.learnerId))) throw new BadRequestException('Learner is not in this stream.');
        if (c.score === null || c.score === undefined || c.score === '') {
          await m.query(`DELETE FROM cat_scores WHERE question_id::text = $1 AND learner_id::text = $2`, [q.id, c.learnerId]);
          continue;
        }
        const s = Number(c.score);
        if (isNaN(s) || s < 0 || s > q.maxMarks) throw new BadRequestException(`Q${q.number}: score must be between 0 and ${q.maxMarks}.`);
        await m.query(
          `INSERT INTO cat_scores (tenant_id, cat_id, question_id, learner_id, score) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (question_id, learner_id) DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()`,
          [u.tenantId, id, q.id, c.learnerId, s]);
      }
    });
    return { message: 'Marks saved' };
  }

  @Delete(':id/scores')
  async clearScores(@Request() req: any, @Param('id') id: string) {
    await this.loadForEdit(req.user, id);
    await this.ds.query(`DELETE FROM cat_scores WHERE cat_id::text = $1`, [id]);
    return { message: 'Marks cleared — questions are unlocked' };
  }
}

@Module({ controllers: [CatController] })
export class CatModule {}
