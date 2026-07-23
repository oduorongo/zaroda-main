// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// PDF DATA BUILDERS
// Each method fetches from the database and shapes the data
// that the PDF template functions expect.
// ============================================================

// src/modules/pdf/pdf-data.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import {
  averagePoints, meanGradeBand, coreCompetenciesAchieved,
  cbcTeacherComment, cbcHoiComment, percentToPoints, isSeniorGrade,
} from './cbc-report.helper';

@Injectable()
export class PdfDataService {
  constructor(
    @InjectRepository(Learner)       private learnerRepo:    Repository<Learner>,
    @InjectRepository(School)        private schoolRepo:     Repository<School>,
    @InjectRepository(Tenant)        private tenantRepo:     Repository<Tenant>,
    @InjectRepository(User)          private userRepo:       Repository<User>,
    @InjectRepository(Stream)        private streamRepo:     Repository<Stream>,
    @InjectRepository(AssessmentResult) private resultRepo:  Repository<AssessmentResult>,
    @InjectRepository(BehaviourRecord)  private behaviourRepo: Repository<BehaviourRecord>,
    @InjectRepository(LearnerFeeAccount) private feeAccRepo: Repository<LearnerFeeAccount>,
    @InjectRepository(Invoice)       private invoiceRepo:    Repository<Invoice>,
    @InjectRepository(Receipt)       private receiptRepo:    Repository<Receipt>,
    @InjectRepository(BaseChampionship) private champRepo:   Repository<BaseChampionship>,
    @InjectRepository(BaseAthlete)   private athleteRepo:    Repository<BaseAthlete>,
    @InjectRepository(SchemeOfWork)  private schemeRepo:     Repository<SchemeOfWork>,
    @InjectRepository(StaffPayroll)  private payrollRepo:    Repository<StaffPayroll>,
    @InjectRepository(LessonPlan)    private planRepo:       Repository<LessonPlan>,
    @InjectRepository(Attendance)    private attendanceRepo: Repository<Attendance>,
    private dataSource: DataSource,
  ) {}

  // ── Load school logo as base64 ────────────────────────────
  private async getLogoBase64(schoolId: string): Promise<string | undefined> {
    try {
      const logoPath = path.join(process.cwd(), 'uploads', 'logos', `${schoolId}.png`);
      if (fs.existsSync(logoPath)) {
        const buf = fs.readFileSync(logoPath);
        return `data:image/png;base64,${buf.toString('base64')}`;
      }
    } catch { /* no logo */ }
    return undefined;
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD REPORT CARD DATA
  // ═══════════════════════════════════════════════════════════
  async buildReportCardData(tenantId: string, learnerId: string, term: string, academicYear: string) {
    const learner = await this.learnerRepo.findOne({
      where: { id: learnerId, tenantId },
      relations: ['stream', 'stream.classTeacher'],
    });
    if (!learner) throw new NotFoundException('Learner not found');

    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    if (!school) throw new NotFoundException('School not found');

    // Prefer the badge uploaded in Settings (stored as a data URL in settings JSONB);
    // fall back to a logo file if present.
    const logo = (school as any).settings?.badgeBase64 || await this.getLogoBase64(school.id);

    // Assessment results for this term (subject is a plain string column, not a relation).
    // Match the mark list's behaviour: filter by term, and by academic year only when the
    // stored rows actually carry that year — otherwise a year-string mismatch (e.g. "2026"
    // vs "2025/2026" or null) would wrongly drop every mark and leave the card blank.
    let allResults = await this.resultRepo.find({
      where: { tenantId, learnerId, term, academicYear },
      order: { subject: 'ASC' },
    });
    if (!allResults.length) {
      allResults = await this.resultRepo.find({
        where: { tenantId, learnerId, term },
        order: { subject: 'ASC' },
      });
    }
    // Prefer the End-Term mark for each subject (the report card is the end-term report).
    // Sort end_term first so the per-subject de-dup below keeps it over any CAT.
    allResults.sort((a, b) => {
      const rank = (e: any) => (String(e.examType || '').toLowerCase() === 'end_term' ? 0 : 1);
      const r = rank(a) - rank(b);
      return r !== 0 ? r : String(a.subject || '').localeCompare(String(b.subject || ''));
    });

    // Learning areas offered in this class = the assessment rubric for the learner's grade.
    // The report card must show ONLY these areas — no stray subjects, no duplicates.
    const rubricRows = await this.dataSource.query(
      `SELECT DISTINCT learning_area AS area
         FROM assessment_templates
        WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)`,
      [learner.gradeLevel || '', tenantId],
    ).catch(() => []);
    // Normalise + tolerant matching so variant spellings still match the rubric:
    // "Intergrated Science" vs "Integrated Science", "Mathematics" vs "Mathematical
    // Activities", "Creative Arts" vs "Creative Arts and Sports", "C.R.E" vs "CRE".
    const norm = (x: string) => String(x || '').toLowerCase().replace(/[^a-z]/g, '');
    const stop = new Set(['and', 'the', 'of', 'a', 'activities', 'studies', 'language']);
    const toks = (x: string) => String(x || '').toLowerCase().split(/[^a-z]+/).filter(w => w && !stop.has(w));
    const lev = (a: string, b: string): number => {
      if (a === b) return 0;
      if (!a || !b) return Math.max(a.length, b.length);
      let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
      for (let i = 0; i < a.length; i++) {
        const cur = [i + 1];
        for (let j = 0; j < b.length; j++) cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (a[i] === b[j] ? 0 : 1)));
        prev = cur;
      }
      return prev[b.length];
    };
    const areaMatch = (a: string, b: string) => {
      const na = norm(a), nb = norm(b);
      if (!na || !nb) return false;
      if (na === nb || na.includes(nb) || nb.includes(na)) return true;
      const ta = toks(a), tb = toks(b);
      for (const w of ta) if (tb.includes(w)) return true;
      for (const wa of ta) for (const wb of tb) if (wa.length >= 6 && wb.length >= 6 && wa.slice(0, 6) === wb.slice(0, 6)) return true;
      return lev(na, nb) <= Math.max(2, Math.round(0.15 * Math.max(na.length, nb.length)));
    };
    let rubricAreas: string[] = rubricRows.map((r: any) => String(r.area)).filter(Boolean);
    // Senior School (Grades 10–12): the report card mirrors the class mark list exactly —
    // its learning areas are the 4 core areas plus every elective offered in the learner's
    // stream (the SAME union the mark list builds its columns from), regardless of which
    // marks have been entered yet. We also fold in this learner's own electives and any area
    // they already have a mark in, so nothing is missed.
    const SENIOR_CORE = ['English', 'Kiswahili', 'Core Mathematics', 'Community Service Learning'];
    if (/grade_(10|11|12)/.test(learner.gradeLevel || '')) {
      // Electives across every learner in this learner's stream (mark-list column source).
      const streamElectiveRows = learner.streamId
        ? await this.dataSource.query(
            `SELECT electives FROM learners WHERE stream_id::text = $1 AND tenant_id::text = $2`,
            [String(learner.streamId), tenantId],
          ).catch(() => [])
        : [];
      const streamElectives: string[] = [];
      for (const row of streamElectiveRows) {
        const es = Array.isArray(row.electives) ? row.electives : [];
        es.forEach((e: string) => e && streamElectives.push(e));
      }
      const ownElectives = Array.isArray((learner as any).electives) ? (learner as any).electives : [];
      const markedAreas  = allResults.map(r => String(r.subject || '')).filter(Boolean);
      const extras = Array.from(new Set([...streamElectives, ...ownElectives, ...markedAreas].filter(Boolean)))
        .filter(a => !SENIOR_CORE.some(c => norm(c) === norm(a)));
      rubricAreas = [...SENIOR_CORE, ...extras];
    }
    const inRubric = (subject: string) =>
      rubricAreas.length === 0 || rubricAreas.some(area => areaMatch(area, subject));

    // Keep only results whose subject matches a rubric area (tolerant); de-duplicate by subject.
    const seen = new Set<string>();
    const results = allResults.filter(r => {
      const key = norm(r.subject);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return inRubric(r.subject);
    });

    // Attendance for this term
    const attendance = await this.dataSource.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'present') AS present,
        COUNT(*) AS total
      FROM attendance
      WHERE tenant_id = $1 AND learner_id = $2
        AND academic_year = $3 AND term = $4
    `, [tenantId, learnerId, academicYear, term]);

    // Behaviour record
    const behaviour = await this.behaviourRepo.findOne({
      where: { tenantId, learnerId, academicYear, term },
    });

    // HOI
    const hoi = await this.userRepo.findOne({
      where: { tenantId, role: 'hoi' as any },
    });

    // Determine overall level (most common level across subjects)
    const levels     = results.map(r => r.level).filter(Boolean);
    const levelCount = levels.reduce((acc: any, l) => ({ ...acc, [l]: (acc[l]||0)+1 }), {});
    const overallLevel = Object.entries(levelCount).sort(([,a],[,b]) => (b as number)-(a as number))[0]?.[0] || 'ME';

    // Detect senior vs junior
    const seniorGrades = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'];
    const isSenior     = seniorGrades.includes(learner.gradeLevel || '');

    // CBC points + competencies (helper handles 8/4-level + senior points)
    const resultForCalc = results.map(r => ({
      subject: r.subject || '',
      level:   r.level || 'ME',
      percent: (r as any).percent ?? null,
    }));
    const avgPoints   = isSenior ? averagePoints(resultForCalc) : null;
    const meanBand    = isSenior ? meanGradeBand(avgPoints) : '';
    const competencies = coreCompetenciesAchieved(resultForCalc);
    const autoTeacher  = cbcTeacherComment({ firstName: learner.firstName, overallLevel, results: resultForCalc });
    const autoHoi      = cbcHoiComment(learner.firstName, overallLevel);

    // ── Build the complete learning-area list for the CBC form ──────
    // Every area offered in this grade appears (even with no score yet), with the
    // saved score, a CBC grade, the rating (EE/ME/AE/BE), and the teacher comment.
    const ratingFromLevel = (lvl: string): string => {
      const l = (lvl || '').toUpperCase();
      if (l.startsWith('EE')) return 'EE';
      if (l.startsWith('ME')) return 'ME';
      if (l.startsWith('AE')) return 'AE';
      if (l.startsWith('BE')) return 'BE';
      return '';
    };
    const findResult = (area: string) => results.find(r => areaMatch(area, r.subject));
    // Lower bands (Playgroup–Grade 6) use the 4-level scale; report the average level too.
    const isLowerBand = ['playgroup','pp1','pp2','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6']
      .includes(learner.gradeLevel || '');
    // 4-level code ↔ points (EE=4 … BE=1) for averaging a performance level.
    const lvl4ToPoints = (lvl: string): number | null => {
      const l = (lvl || '').toUpperCase();
      if (l.startsWith('EE')) return 4;
      if (l.startsWith('ME')) return 3;
      if (l.startsWith('AE')) return 2;
      if (l.startsWith('BE')) return 1;
      return null;
    };
    const pointsToLvl4 = (p: number): string => (p >= 3.5 ? 'EE' : p >= 2.5 ? 'ME' : p >= 1.5 ? 'AE' : 'BE');

    const areaRows = (rubricAreas.length ? rubricAreas : []).map((area, i) => {
      const r: any = findResult(area);
      const score   = r?.rawScore ?? r?.percent ?? null;   // raw mark (display "Score")
      const percent = r?.percent ?? null;                  // % score
      const level   = r?.level || '';
      return {
        index:   i + 1,
        area,
        score:   score   != null ? Math.round(Number(score))   : null,
        percent: percent != null ? Math.round(Number(percent)) : null,
        grade:   level || '',
        rating:  ratingFromLevel(level),
        comment: r?.teacherComment || '',
      };
    });
    const scored     = areaRows.filter(a => a.score != null);
    const totalScore = scored.reduce((n, a) => n + (a.score as number), 0);
    const avgScore   = scored.length ? Math.round(totalScore / scored.length) : null;
    // Average % across scored areas.
    const pctScored  = areaRows.filter(a => a.percent != null);
    const avgPercent = pctScored.length ? Math.round(pctScored.reduce((n, a) => n + (a.percent as number), 0) / pctScored.length) : null;
    // Average performance level (Playgroup–Grade 6): mean of the 4-level points → level code.
    const lvlPts     = areaRows.map(a => lvl4ToPoints(a.grade)).filter((p): p is number => p != null);
    const avgLevel   = (isLowerBand && lvlPts.length)
      ? pointsToLvl4(lvlPts.reduce((n, p) => n + p, 0) / lvlPts.length)
      : '';

    return {
      school: {
        name:       school.name,
        address:    school.address || '',
        knecCode:   school.knecCode || '',
        county:     (school as any).county || '',
        subCounty:  (school as any).subCounty || '',
        principal:  hoi ? `${hoi.firstName} ${hoi.lastName}` : '',
        logoBase64: logo,
      },
      brand: {
        primary:     (school as any).settings?.brandPrimary     || undefined,
        primaryDeep: (school as any).settings?.brandPrimaryDeep || undefined,
        accent:      (school as any).settings?.brandAccent      || undefined,
      },
      learner: {
        firstName:       learner.firstName,
        lastName:        learner.lastName,
        admissionNumber: learner.admissionNumber,
        gradeLevel:      learner.gradeLevel || '',
        streamName:      learner.stream?.name || '',
        gender:          learner.gender || '',
        dob:             learner.dateOfBirth?.toLocaleDateString('en-KE') || '',
        guardianName:    (learner as any).guardianName || '',
        guardianContact: (learner as any).guardianPhone || (learner as any).guardianContact || '',
      },
      // Full CBC learning-area table (every area for the grade, scored or not).
      areaRows,
      totals: { totalScore, avgScore, avgPercent, avgLevel, overallRating: ratingFromLevel(overallLevel) },
      academic: {
        year:          academicYear,
        term,
        classTeacher: learner.stream?.classTeacher
          ? `${learner.stream.classTeacher.firstName} ${learner.stream.classTeacher.lastName}`
          : '',
        totalLearners: learner.stream?.learnersCount || 0,
      },
      results: results.map(r => ({
        subject:         r.subject || '',
        strand:          r.strand        || '',
        level:           r.level         || 'ME',
        teacherComment:  r.teacherComment || '',
      })),
      summary: {
        overallLevel,
        teacherComment: results[0]?.classTeacherComment || autoTeacher,
        hoiComment:     autoHoi,
        attendance: {
          present: parseInt(attendance[0]?.present || '0'),
          total:   parseInt(attendance[0]?.total   || '0'),
        },
        averagePoints: avgPoints,
        meanGrade:     meanBand,
        coreCompetencies: competencies,
      },
      behaviour: behaviour ? {
        socialSkills:    behaviour.socialSkills,
        selfManagement:  behaviour.selfManagement,
        responsibility:  behaviour.responsibility,
        respectForOthers:behaviour.respectForOthers,
        punctuality:     behaviour.punctuality,
        participation:   behaviour.participation,
      } : undefined,
      isSenior,
    };
  }

  /**
   * Build report-card data for EVERY learner in a stream (for bulk printing).
   * Reuses buildReportCardData so each card is identical to the single-print version.
   */
  async buildBulkReportCardData(tenantId: string, streamId: string, term: string, academicYear: string) {
    const learners = await this.learnerRepo.find({
      where: { tenantId, streamId, ...(this.learnerRepo.metadata.findColumnWithPropertyName('isActive') ? { isActive: true } : {}) } as any,
      order: { firstName: 'ASC' },
    });
    const cards = [];
    for (const l of learners) {
      try {
        cards.push(await this.buildReportCardData(tenantId, l.id, term, academicYear));
      } catch {
        // Skip a learner whose data can't be built rather than failing the whole batch
      }
    }
    return cards;
  }

  async buildMarkListData(tenantId: string, streamId: string, term: string, examType: string, academicYear: string) {
    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo   = (school as any)?.settings?.badgeBase64 || await this.getLogoBase64(school?.id || '');

    const stream = await this.dataSource.query(
      `SELECT id, name, grade_level AS "gradeLevel" FROM streams WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
      [streamId, tenantId],
    ).catch(() => []);
    const gradeLevel = stream[0]?.gradeLevel || '';

    const rubricRows = await this.dataSource.query(
      `SELECT DISTINCT learning_area AS area FROM assessment_templates
        WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)
        ORDER BY learning_area`,
      [gradeLevel, tenantId],
    ).catch(() => []);
    let subjects: string[] = Array.from(new Set(rubricRows.map((r: any) => r.area).filter(Boolean)))
      .filter((a: string) => !/indigenous|indeg/i.test(a));

    // Senior School (Grades 10–12): columns = 4 core areas + every elective taken by
    // any learner in this class (each learner has their own elective choice).
    if (/grade_(10|11|12)/.test(gradeLevel)) {
      const seniorCore = ['English', 'Kiswahili', 'Core Mathematics', 'Community Service Learning'];
      const learnerRows = await this.dataSource.query(
        `SELECT electives FROM learners WHERE stream_id::text = $1 AND tenant_id::text = $2`,
        [streamId, tenantId],
      ).catch(() => []);
      const electiveSet = new Set<string>();
      for (const lr of learnerRows) {
        const es = Array.isArray(lr.electives) ? lr.electives : [];
        es.forEach((e: string) => e && electiveSet.add(e));
      }
      subjects = [...seniorCore, ...Array.from(electiveSet)];
    }

    const marks = await this.dataSource.query(
      `SELECT ar.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", ar.subject, ar.raw_score AS "rawScore",
              ar.max_score AS "maxScore", ar.percent
         FROM assessment_results ar
         JOIN learners l ON l.id = ar.learner_id
        WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2
          AND ar.term = $3 AND ($4 = '' OR ar.exam_type = $4)`,
      [tenantId, streamId, term, examType || ''],
    ).catch(() => []);

    // Authoritative learning-area set = the seeded rubric (already in `subjects`). Do NOT append
    // stray subject names from marks — the mark list (screen) and PDF must show the SAME columns,
    // and the average must divide by this full set so a missing mark counts as a gap.
    const areaByKey = new Map(subjects.map(s => [s.toLowerCase().trim(), s]));

    const byLearner: Record<string, any> = {};
    const isJsSenior = isSeniorGrade(gradeLevel) || /grade_(7|8|9|1[0-2])/.test(gradeLevel);
    const isLowerBand = ['playgroup','pp1','pp2','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6'].includes(gradeLevel);
    const pctToLvl4 = (p: number): string => (p >= 76 ? 'EE' : p >= 51 ? 'ME' : p >= 26 ? 'AE' : 'BE');
    // Points scale stays grade-appropriate: 1-8 for senior, 1-4 for lower bands.
    const pointsFor = (pct: number): number =>
      isJsSenior ? percentToPoints(pct) : (pct >= 76 ? 4 : pct >= 51 ? 3 : pct >= 26 ? 2 : 1);

    // Paper 1 & 2 combined totals (e.g. 40 + 60 = 100) configured via the Enter Marks "out
    // of" fields or the Paper 1 & 2 Setup page — the AUTHORITATIVE denominator for a
    // multi-paper subject, so a learner missing one paper is averaged against the FULL
    // total instead of just the paper(s) they have.
    const paperCfgRows = await this.dataSource.query(
      `SELECT learning_area AS "learningArea", paper_count AS "paperCount",
              paper1_max AS "paper1Max", paper2_max AS "paper2Max", tenant_id AS "tenantId"
         FROM subject_paper_config
        WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)`,
      [gradeLevel, tenantId],
    ).catch(() => []);
    const subjectCombinedMax: Record<string, number> = {};
    for (const r of paperCfgRows.filter((r: any) => !r.tenantId).concat(paperCfgRows.filter((r: any) => r.tenantId))) {
      const key = String(r.learningArea).toLowerCase();
      if (r.paperCount >= 2 && r.paper1Max && r.paper2Max) subjectCombinedMax[key] = Number(r.paper1Max) + Number(r.paper2Max);
      else delete subjectCombinedMax[key];
    }

    // A subject with Paper 1 & Paper 2 has TWO rows for the same learner (different `paper`
    // marker) — sum their raw/max before computing the combined percent, so it shows as one
    // mark-list column, matching the screen mark list's aggregation. If the subject has a
    // configured combined total, that total is the denominator regardless of which papers
    // this learner actually has scores for.
    const combos: Record<string, Record<string, { rawSum: number; maxSum: number; any: boolean }>> = {};
    for (const m of marks) {
      const key = String(m.subject || '').toLowerCase().trim();
      const col = areaByKey.get(key);
      if (!col) continue;
      const configuredMax = subjectCombinedMax[key];
      const acc = (combos[m.learnerId] ||= {});
      const c = (acc[col] ||= { rawSum: 0, maxSum: configuredMax || 0, any: false });
      if (m.rawScore != null) {
        c.rawSum += Number(m.rawScore); c.any = true;
        if (!configuredMax && m.maxScore != null) c.maxSum += Number(m.maxScore);
      }
    }

    for (const m of marks) {
      const key = String(m.subject || '').toLowerCase().trim();
      const col = areaByKey.get(key);
      if (!col) continue;
      if (!byLearner[m.learnerId]) {
        byLearner[m.learnerId] = {
          learnerId: m.learnerId, name: `${m.firstName} ${m.lastName}`.trim(),
          admissionNumber: m.admissionNumber, scores: {}, points: {}, levels: {}, total: 0, count: 0,
        };
      }
      if (col in byLearner[m.learnerId].scores) continue; // already combined below
      const combo = combos[m.learnerId][col];
      const percent = combo.any ? Math.round((combo.rawSum / combo.maxSum) * 100) : null;
      byLearner[m.learnerId].scores[col] = combo.any ? combo.rawSum : null;
      if (percent != null) {
        byLearner[m.learnerId].points[col] = pointsFor(percent);
        byLearner[m.learnerId].levels[col] = pctToLvl4(percent);
        byLearner[m.learnerId].total += percent; byLearner[m.learnerId].count++;
      }
    }
    // Denominator = full number of learning areas in the class (missing marks count as a gap),
    // so screen and PDF averages match exactly.
    const areaCount = subjects.length || 1;
    // Uniform summary across ALL classes: Total % (average over all areas), Total Points
    // (sum of per-area performance points), and Level (from the average %). No points-average.
    const learners = Object.values(byLearner).map((e: any) => {
      const totalPoints = Object.values(e.points).reduce((n: number, p: any) => n + Number(p), 0);
      const avgPercent  = Math.round(e.total / areaCount);
      const level       = e.count ? pctToLvl4(avgPercent) : '';
      return { ...e, average: avgPercent, totalPoints, avgLevel: level };
    }).sort((a: any, b: any) => {
      // Rank basis is uniform: total % first, then total points, then level, then name.
      if (b.average !== a.average) return b.average - a.average;
      if ((b.totalPoints || 0) !== (a.totalPoints || 0)) return (b.totalPoints || 0) - (a.totalPoints || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    learners.forEach((e: any, i: number) => (e.rank = i + 1));

    return {
      school: { name: school?.name || '', knecCode: (school as any)?.knecCode || '', logoBase64: logo,
        brand: { primary: (school as any)?.settings?.brandPrimary, accent: (school as any)?.settings?.brandAccent } },
      stream: stream[0]?.name || 'Class', gradeLevel, term, examType, academicYear,
      subjects, learners, isJsSenior, isLowerBand,
      maxPoints: subjects.length * (isJsSenior ? 8 : 4),
    };
  }

  async buildInvoiceData(tenantId: string, invoiceId: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, tenantId },
      relations: ['learner', 'learner.stream', 'items'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const school  = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo    = (school as any)?.settings?.badgeBase64 || await this.getLogoBase64(school?.id || '');
    const feeAcc  = await this.feeAccRepo.findOne({
      where: { tenantId, learnerId: invoice.learnerId },
    });

    const totalPaid = invoice.amountPaid || 0;
    const balance   = (invoice.totalAmount || 0) - totalPaid;

    let status: 'unpaid'|'partial'|'paid'|'overpaid' = 'unpaid';
    if (totalPaid >= invoice.totalAmount) status = balance < 0 ? 'overpaid' : 'paid';
    else if (totalPaid > 0) status = 'partial';

    return {
      school: {
        name:     school?.name    || '',
        address:  school?.address || '',
        phone:    school?.phone   || '',
        paybill:  school?.mpesaPaybill || '',
        logoBase64: logo,
      },
      learner: {
        firstName:       invoice.learner?.firstName || '',
        lastName:        invoice.learner?.lastName  || '',
        admissionNumber: invoice.learner?.admissionNumber || '',
        streamName:      invoice.learner?.stream?.name   || '',
        gradeLevel:      invoice.learner?.gradeLevel     || '',
      },
      invoice: {
        number:       invoice.invoiceNumber,
        issuedDate:   invoice.issuedDate?.toLocaleDateString('en-KE') || '',
        dueDate:      invoice.dueDate?.toLocaleDateString('en-KE') || '',
        academicYear: invoice.academicYear,
        term:         invoice.term,
      },
      lineItems: (invoice.items || []).map((item: any) => ({
        description: item.description,
        amount:      item.amount,
      })),
      totals: {
        subtotal:          invoice.subtotal         || invoice.totalAmount,
        discount:          invoice.discountAmount   || 0,
        scholarshipCredit: invoice.scholarshipCredit|| 0,
        totalDue:          invoice.totalAmount,
        totalPaid,
        balance,
      },
      guardian: {
        name:  invoice.learner?.guardianName  || '',
        phone: invoice.learner?.guardianPhone || '',
        email: invoice.learner?.guardianEmail || '',
      },
      status,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD RECEIPT DATA
  // ═══════════════════════════════════════════════════════════
  async buildReceiptData(tenantId: string, receiptNumber: string) {
    const receipt = await this.receiptRepo.findOne({
      where: { receiptNumber, tenantId },
      relations: ['learner', 'learner.stream', 'recordedBy'],
    });
    if (!receipt) throw new NotFoundException('Receipt not found');

    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo   = await this.getLogoBase64(school?.id || '');

    const feeAcc = await this.feeAccRepo.findOne({
      where: { tenantId, learnerId: receipt.learnerId },
    });

    return {
      school: {
        name:     school?.name || '',
        address:  school?.address || '',
        logoBase64: logo,
      },
      learner: {
        firstName:       receipt.learner?.firstName || '',
        lastName:        receipt.learner?.lastName  || '',
        admissionNumber: receipt.learner?.admissionNumber || '',
        streamName:      receipt.learner?.stream?.name || '',
      },
      receipt: {
        number:      receipt.receiptNumber,
        date:        receipt.createdAt?.toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' }) || '',
        amount:      receipt.amount,
        method:      receipt.paymentMethod || 'M-Pesa',
        reference:   receipt.mpesaRef || receipt.bankRef || '',
        term:        receipt.term,
        academicYear:receipt.academicYear,
      },
      balance:    feeAcc?.outstandingBalance || 0,
      receivedBy: receipt.recordedBy
        ? `${receipt.recordedBy.firstName} ${receipt.recordedBy.lastName}`
        : 'Bursar',
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD BIB SHEET DATA
  // ═══════════════════════════════════════════════════════════
  async buildBibSheetData(championshipId: string, schoolId?: string) {
    const champ = await this.champRepo.findOne({ where: { id: championshipId } });
    if (!champ) throw new NotFoundException('Championship not found');

    const qb = this.athleteRepo
      .createQueryBuilder('a')
      .where('a.championship_id = :cid', { cid: championshipId })
      .orderBy('a.bib_number', 'ASC');

    if (schoolId) qb.andWhere('a.school_id = :sid', { sid: schoolId });

    const athletes = await qb.getMany();

    let schoolFilter: string | undefined;
    if (schoolId) {
      schoolFilter = athletes[0]?.schoolName;
    }

    return {
      championship: {
        name:         champ.name,
        level:        champ.level,
        venue:        champ.venue        || '',
        startDate:    champ.startDate?.toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) || '',
        academicYear: champ.academicYear || '',
      },
      athletes: athletes.map(a => ({
        bibNumber:  a.bibNumber   || '',
        firstName:  a.firstName,
        lastName:   a.lastName,
        schoolName: a.schoolName,
        events:     a.events      || [],
        gender:     a.gender      || '',
        gradeLevel: a.gradeLevel  || '',
      })),
      schoolFilter,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD SCHEME OF WORK DATA
  // ═══════════════════════════════════════════════════════════
  async buildSchemeData(tenantId: string, schemeId: string) {
    const scheme = await this.schemeRepo.findOne({
      where: { id: schemeId, tenantId },
      relations: ['teacher', 'school', 'weeks'],
    });
    if (!scheme) throw new NotFoundException('Scheme not found');

    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo   = await this.getLogoBase64(school?.id || '');

    return {
      school: {
        name:       school?.name || '',
        logoBase64: logo,
      },
      teacher: {
        firstName: scheme.teacher?.firstName || '',
        lastName:  scheme.teacher?.lastName  || '',
        tscNumber: scheme.teacher?.tscNumber || '',
      },
      scheme: {
        title:        scheme.title,
        subject:      scheme.subject,
        grade:        scheme.grade?.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase()) || '',
        term:         scheme.term,
        academicYear: scheme.academicYear,
      },
      weeks: (scheme.weeks || []).map((w: any) => ({
        weekNumber:               w.weekNumber,
        dates:                    w.dates || '',
        strand:                   w.strand || '',
        subStrand:                w.subStrand || '',
        specificLearningOutcomes: w.specificLearningOutcomes || '',
        keyInquiryQuestions:      w.keyInquiryQuestions || '',
        learningExperiences:      w.learningExperiences || '',
        learningResources:        w.learningResources || '',
        assessmentMethods:        w.assessmentMethods || '',
        periods:                  w.periods || 0,
        remarks:                  w.remarks || '',
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD PAYSLIP DATA
  // ═══════════════════════════════════════════════════════════
  async buildPayslipData(tenantId: string, staffId: string, periodId: string) {
    const payroll = await this.payrollRepo.findOne({
      where: { id: periodId, tenantId, staffId },
      relations: ['staff'],
    });
    if (!payroll) throw new NotFoundException('Payroll record not found');

    const school = await this.schoolRepo.findOne({ where: { tenantId } });
    const logo   = await this.getLogoBase64(school?.id || '');

    const g = payroll.grossPay      || 0;
    const d = payroll.totalDeductions || 0;

    return {
      school: {
        name:       school?.name    || '',
        address:    school?.address || '',
        logoBase64: logo,
      },
      staff: {
        firstName:   payroll.staff?.firstName  || '',
        lastName:    payroll.staff?.lastName   || '',
        tscNumber:   payroll.staff?.tscNumber  || '',
        designation: payroll.staff?.designation|| '',
        bankAccount: payroll.staff?.bankAccount|| '',
      },
      period: {
        month: payroll.payMonth,
        year:  payroll.payYear,
      },
      earnings: {
        basicSalary:    payroll.basicSalary      || 0,
        houseAllowance: payroll.houseAllowance   || 0,
        transportAllow: payroll.transportAllow   || 0,
        medicalAllow:   payroll.medicalAllow     || 0,
        otherAllowances:payroll.otherAllowances  || 0,
        grossPay:       g,
      },
      deductions: {
        paye:            payroll.paye            || 0,
        nhif:            payroll.nhif            || 0,
        nssf:            payroll.nssf            || 0,
        housingLevy:     payroll.housingLevy     || 0,
        loanDeductions:  payroll.loanDeductions  || 0,
        saccoDeductions: payroll.saccoDeductions || 0,
        otherDeductions: payroll.otherDeductions || 0,
        totalDeductions: d,
      },
      netPay: g - d,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD TEACHER FOLDER PDFS (multiple docs, merged)
  // ═══════════════════════════════════════════════════════════
  async buildTeacherFolderPdfs(
    tenantId: string,
    teacherId: string,
    dto: { documentIds: string[]; documentTypes: string[] },
  ): Promise<Buffer[]> {
    const pdfs: Buffer[] = [];
    // This is called by the PDF controller to gather all documents
    // for a teacher's submission folder before merging
    // Returns array of PDF buffers in document order
    return pdfs; // Populated by PdfService.buildTeacherFolderPdfs
  }
}
