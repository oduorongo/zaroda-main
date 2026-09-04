// ============================================================
// Core Claude AI generation engine for Professional Records
// ============================================================
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { isKiswahiliSubject } from './document-render.util';

// Kiswahili is taught IN Kiswahili — every generated field (SLOs, content, questions,
// etc.) should be written in the language, not just about it. English stays for every
// other subject, including when Kiswahili is a medium-of-instruction note elsewhere.
function languageInstruction(subjectName: string): string {
  return isKiswahiliSubject(subjectName)
    ? '\nLANGUAGE: This is a Kiswahili lesson — write EVERY generated field (outcomes, questions, content, activities, vocabulary, etc.) in the KISWAHILI LANGUAGE, not English — including standard openings like "By the end of the lesson..." (use "Kufikia mwisho wa somo, mwanafunzi aweze..." or similar), which must NOT be left in English while the rest is translated. Keep JSON keys in English exactly as specified below; only the values change.\n'
    : '';
}

// The literal opening phrase for a Specific Learning Outcome, in the right language —
// used inside REQUIREMENTS rules that otherwise hardcode English wording the model
// would follow verbatim even on a Kiswahili lesson.
function sloOpeningPhrase(subjectName: string, scope: 'LESSON' | 'week'): string {
  if (isKiswahiliSubject(subjectName)) {
    return scope === 'LESSON' ? 'Kufikia mwisho wa somo, mwanafunzi aweze...' : 'Kufikia mwisho wa wiki, mwanafunzi aweze...';
  }
  return scope === 'LESSON' ? 'By the end of the LESSON, the learner should be able to...' : 'By the end of the week, the learner should be able to...';
}

// Scheme of Work needs a full term of curriculum reasoning — kept on Sonnet.
// Lesson plans/notes/progress are short, formulaic, single-shot generations —
// Haiku is far cheaper and holds up fine on this kind of structured output.
const MODEL_SCHEME = 'claude-sonnet-5';
const MODEL_FAST = 'claude-haiku-4-5-20251001';

export interface SchemeLessonData {
  lessonNumber: number;
  isDouble?: boolean;
  specificLearningOutcomes: string;
  keyInquiryQuestions?: string;
  learningExperiences: string;
}

export interface SchemeWeekData {
  weekNumber: number;
  dates?: string;
  strand: string;
  subStrand: string;
  specificLearningOutcomes: string;
  keyInquiryQuestions?: string;
  learningExperiences: string;
  learningResources?: string;
  assessmentMethods?: string;
  reflectionNotes?: string;
  coreCompetencies?: string[];
  values?: string[];
  pertinentIssues?: string;
  periods?: number;
  remarks?: string;
  // Per-lesson breakdown of this week — one entry per lesson slot (double
  // lessons merged into one entry). Empty for a non-teaching week.
  lessons?: SchemeLessonData[];
}

export interface LessonPlanData {
  strand: string;
  subStrand: string;
  specificLearningOutcomes: string;
  keyInquiryQuestions: string;
  coreCompetencies: string[];
  values: string[];
  pertinentIssues: string;
  linkToOtherSubjects: string;
  introduction: string;
  lessonDevelopment: string;
  conclusion: string;
  assessment: string;
  extendedActivities: string;
  supportActivities: string;
  learningMaterials: string;
  referenceBooks: string;
}

// Mirrors the official KICD Lesson Notes template.
export interface LessonNotesData {
  topic: string;
  subTopic: string;
  slosCovered: string;
  introduction: string;
  teacherContent: string; // "Content" section
  keyVocabulary: string;
  summary: string;
  reviewQuestions: string; // questions with answers
  referenceMaterials: string;
  learnerContent: string;
}

export interface LearnerProgressData {
  learnerId: string;
  performanceLevel: string;
  evidence: string;
  teacherComment: string;
  supportNeeded: boolean;
}

// Kenya CBC grade band helper
function gradeBand(gradeLevel: string): 'lower_primary' | 'upper_primary' | 'junior' | 'senior' {
  if (['playgroup', 'pp1', 'pp2', 'grade_1', 'grade_2', 'grade_3'].includes(gradeLevel)) return 'lower_primary';
  if (['grade_4', 'grade_5', 'grade_6'].includes(gradeLevel)) return 'upper_primary';
  if (['grade_7', 'grade_8', 'grade_9'].includes(gradeLevel)) return 'junior';
  return 'senior';
}

function performanceLevelScale(gradeLevel: string): string {
  const senior = ['grade_7', 'grade_8', 'grade_9', 'grade_10', 'grade_11', 'grade_12'];
  return senior.includes(gradeLevel)
    ? 'EE1 (Exceeding Expectation 1) | EE2 | ME1 (Meeting Expectation 1) | ME2 | AE1 (Approaching Expectation 1) | AE2 | BE1 (Below Expectation 1) | BE2'
    : 'EE (Exceeding Expectation) | ME (Meeting Expectation) | AE (Approaching Expectation) | BE (Below Expectation)';
}

@Injectable()
export class AiGeneratorService {
  private readonly logger = new Logger(AiGeneratorService.name);

  // Lazily resolved via an indirect require, matching the rest of this codebase's pattern
  // (see stubs.module.ts's aiGenerate helper), so the build never depends on the package
  // being installed/typed, and AI only runs when ANTHROPIC_API_KEY is set anyway.
  private getClient(): any {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new BadRequestException('AI generation is not configured (set ANTHROPIC_API_KEY).');
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const req: any = eval('require');
    const Anthropic = req('@anthropic-ai/sdk').default || req('@anthropic-ai/sdk');
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // ── GENERATE SCHEME OF WORK ────────────────────────────────
  async generateSchemeOfWork(params: {
    subjectName: string;
    gradeLevel: string;
    term: string;
    academicYear: string;
    totalWeeks: number;
    periodsPerWeek: number;
    schoolContext?: string;
    strandFocus?: string[];
    columns?: string[];
    specialWeeks?: { week: number; label: string }[];
    // 1-indexed lesson-slot positions (within a week's lesson sequence, not raw
    // period numbers) that run as a double lesson — each one merges 2 periods
    // into a single lesson/column, so lessonsPerWeek = periodsPerWeek - count.
    doubleLessonSlots?: number[];
  }): Promise<{ weeks: SchemeWeekData[]; title: string; tokens: number; lessonsPerWeek: number }> {
    const band = gradeBand(params.gradeLevel);
    const grade = params.gradeLevel.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const termLabel = params.term.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const cols = new Set(params.columns?.length ? params.columns : ['keyInquiry', 'learningExperiences', 'resources', 'assessment', 'reflection']);
    const wantReflection = cols.has('reflection');
    // Core Competencies belong on the Lesson Plan, not the Scheme of Work — this
    // toggle now only covers Values and PCIs at the scheme level.
    const wantValuesPCI = cols.has('corePV');
    const specialWeeks = (params.specialWeeks || []).filter(w => w?.week && w?.label);
    const title = `Scheme of Work — ${params.subjectName} ${grade} ${termLabel} ${params.academicYear}`;

    const doubleSlots = Array.from(new Set((params.doubleLessonSlots || []).filter(n => n >= 1 && n <= params.periodsPerWeek)));
    const lessonsPerWeek = Math.max(1, params.periodsPerWeek - doubleSlots.length);

    // A single request asking for all weeks at once reliably gets truncated mid-JSON
    // once totalWeeks climbs past ~8-10 with the optional columns on, regardless of
    // how large a max_tokens budget we ask for. Generating in small week-range chunks
    // keeps each response short enough to always finish, at the cost of a few extra
    // (cheap, Sonnet) calls — the wallet only charges once per scheme either way.
    // Smaller than before (was 5, then 3) because each week's JSON is now heavier — it
    // carries a per-lesson breakdown (up to periodsPerWeek entries) in addition to the
    // week-level summary.
    const CHUNK_SIZE = 2;
    const weeks: SchemeWeekData[] = [];
    let totalTokens = 0;

    for (let start = 1; start <= params.totalWeeks; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, params.totalWeeks);
      const chunkSpecialWeeks = specialWeeks.filter(w => w.week >= start && w.week <= end);
      const priorContext = weeks.length
        ? `\nSTRANDS/SUB-STRANDS ALREADY COVERED IN EARLIER WEEKS (do not repeat, continue the sequence):\n${weeks.map(w => `Week ${w.weekNumber}: ${w.strand} — ${w.subStrand}`).join('\n')}\n`
        : '';

      const prompt = `You are a KICD-certified curriculum expert generating a CBC/CBE-aligned Scheme of Work for Kenyan schools.
${languageInstruction(params.subjectName)}
CONTEXT:
- Subject: ${params.subjectName}
- Grade Level: ${grade}
- Term: ${termLabel}, ${params.academicYear}
- Grade Band: ${band}
- Total Weeks in Term: ${params.totalWeeks} (you are generating ONLY weeks ${start}-${end} of this term right now)
- Periods per Week: ${params.periodsPerWeek} (${lessonsPerWeek} lesson slot(s) per teaching week${doubleSlots.length ? `, with lesson slot(s) ${doubleSlots.join(', ')} run as a double lesson (2 periods combined into one lesson)` : ''})
- School Context: ${params.schoolContext || 'Mixed day school, Kenya'}
${params.strandFocus?.length ? `- Priority Strands: ${params.strandFocus.join(', ')}` : ''}
${chunkSpecialWeeks.length ? `- Non-teaching weeks in this range (mid-term breaks, summative assessments, exams — no new curriculum content): ${chunkSpecialWeeks.map(w => `Week ${w.week} = ${w.label}`).join('; ')}` : ''}
${priorContext}
REQUIREMENTS — keep every field concise (approximate word limits below), not padded, so the whole
response stays short:
1. Follow the KICD ${params.subjectName} syllabus for ${grade} exactly
2. Continue distributing strands and sub-strands appropriately — do not repeat what earlier weeks already covered
3. Each week's specificLearningOutcomes: clear, measurable, week-level summary, opening with
   "${sloOpeningPhrase(params.subjectName, 'week')}", and covering all three learning domains —
   Knowledge, Skill, and Attitude (max ~40 words)
4. keyInquiryQuestions: 1-2 short questions (max ~30 words)
5. learningExperiences: week-level summary of activities (max ~40 words)
6. learningResources / assessmentMethods: short lists, not paragraphs (max ~20 words each). Describe
   resource TYPES generically (e.g. "Grade ${grade} coursebook, wall charts, realia, digital aids") —
   never cite a specific textbook title or page number, since you cannot verify one and will get it wrong.
${start === 1 ? '7. Week 1 should include orientation/introduction activities' : ''}
${end === params.totalWeeks ? '8. The final week should include revision/consolidation' : ''}
9. Use authentic Kenyan contexts, examples, and resources
${wantValuesPCI ? '10. For each week, also select relevant Values (e.g. Love, Responsibility, Respect, Unity, Peace, Patriotism, Social Justice, Integrity) and Pertinent & Contemporary Issues (PCIs, max ~15 words). Do NOT include Core Competencies here — those belong on the Lesson Plan only.' : ''}
${chunkSpecialWeeks.length ? `11. For every week listed above as non-teaching, set both "strand" and "subStrand" to that week's exact label, set "specificLearningOutcomes" to "N/A — ${chunkSpecialWeeks.map(w=>w.label).join('/')}", leave "keyInquiryQuestions"/"learningExperiences"/"learningResources"/"assessmentMethods" empty, set "lessons" to an empty array, and do NOT plan any new curriculum content into that week — shift the affected teaching into the remaining weeks instead.` : ''}
12. For every TEACHING week (not a non-teaching week listed above), also break the week down into exactly ${lessonsPerWeek} entries in a "lessons" array — one per lesson slot, in order. ${doubleSlots.length ? `Lesson slot(s) ${doubleSlots.join(', ')} must have "isDouble": true and cover proportionally more content (2 periods' worth); all others "isDouble": false.` : 'None of them are double lessons.'} Each lesson's specificLearningOutcomes (max ~25 words, covering Knowledge, Skill, and Attitude) / keyInquiryQuestions (max ~20 words) / learningExperiences (max ~30 words) should be that single lesson's actual content (progressing across the week), not a repeat of the week-level summary.

Generate ONLY weeks ${start} through ${end} (that's ${end - start + 1} week object(s) — no more, no fewer).

Return ONLY valid JSON (no preamble, no markdown fences):
{
  "weeks": [
    {
      "weekNumber": ${start},
      "strand": "Strand name from KICD syllabus",
      "subStrand": "Sub-strand name",
      "specificLearningOutcomes": "${sloOpeningPhrase(params.subjectName, 'week')} ...",
      "keyInquiryQuestions": "1. ...\\n2. ...",
      "learningExperiences": "Week-level summary of learner activities...",
      "learningResources": "Coursebook, charts, realia, digital aids — no page numbers...",
      "assessmentMethods": "Observation, oral questions, written exercise",
      "periods": ${params.periodsPerWeek},
      "remarks": ""${wantReflection ? ',\n      "reflectionNotes": "Leave as an empty string — filled in by the teacher after delivery"' : ''}${wantValuesPCI ? ',\n      "values": ["..."],\n      "pertinentIssues": "..."' : ''},
      "lessons": [
        { "lessonNumber": 1, "isDouble": false, "specificLearningOutcomes": "${sloOpeningPhrase(params.subjectName, 'LESSON')} ...", "keyInquiryQuestions": "...", "learningExperiences": "What learners actually do in this specific lesson..." }
      ]
    }
  ]
}`;

      const response = await this.callClaude(prompt, 8192, MODEL_SCHEME);
      const parsed = this.parseJson(response.text, `Scheme of Work (weeks ${start}-${end})`, response.truncated);
      if (!parsed.weeks || !Array.isArray(parsed.weeks)) {
        throw new BadRequestException(`AI returned invalid scheme structure for weeks ${start}-${end}`);
      }

      // The model sometimes drops the "lessons" breakdown on an ordinary teaching week
      // despite the instruction — synthesize one from the week-level summary rather than
      // let that week silently lose its per-lesson rows (or, worse, get misread as a
      // non-teaching week downstream, since that's detected by an empty lessons array).
      for (const week of parsed.weeks) {
        const isNonTeaching = /^n\/a\b/i.test(String(week.specificLearningOutcomes || '').trim());
        if (!isNonTeaching && (!Array.isArray(week.lessons) || week.lessons.length === 0)) {
          week.lessons = Array.from({ length: lessonsPerWeek }, (_, i) => ({
            lessonNumber: i + 1,
            isDouble: doubleSlots.includes(i + 1),
            specificLearningOutcomes: week.specificLearningOutcomes,
            keyInquiryQuestions: week.keyInquiryQuestions,
            learningExperiences: week.learningExperiences,
          }));
        }
      }

      weeks.push(...parsed.weeks);
      totalTokens += response.tokens;
    }

    return { weeks, title, tokens: totalTokens, lessonsPerWeek };
  }

  // ── GENERATE LESSON PLAN ───────────────────────────────────
  async generateLessonPlan(params: {
    subjectName: string;
    gradeLevel: string;
    strand: string;
    subStrand: string;
    slos: string;
    keyInquiryQuestions: string;
    learningExperiences: string;
    learningResources: string;
    durationMinutes: number;
    lessonDate?: string;
    schoolContext?: string;
  }): Promise<LessonPlanData & { tokens: number }> {
    const grade = params.gradeLevel.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const prompt = `You are a KICD-certified Kenyan teacher generating a detailed CBC/CBE lesson plan.
${languageInstruction(params.subjectName)}
LESSON CONTEXT:
- Subject: ${params.subjectName}
- Grade: ${grade}
- Strand: ${params.strand}
- Sub-Strand: ${params.subStrand}
- Specific Learning Outcomes (source context — reword to fit this single lesson, see rule 1 below): ${params.slos}
- Key Inquiry Questions: ${params.keyInquiryQuestions}
- Duration: ${params.durationMinutes} minutes
- Lesson Date: ${params.lessonDate || 'TBD'}
- Resources from Scheme: ${params.learningResources}
- School Context: ${params.schoolContext || 'Mixed day school, Kenya'}

This is ONE single lesson (${params.durationMinutes} minutes), not a week — even if the source context
above reads like a week-level summary, scope everything below to what happens in this one sitting.

REQUIREMENTS — keep every field concise and usable, not padded (approximate word limits below), so the
whole response stays short:
1. specificLearningOutcomes MUST open with "${sloOpeningPhrase(params.subjectName, 'LESSON')}" (in whichever
   language this lesson is being written in — see LANGUAGE above) — never "by the end of the week/term".
   Cover all three learning domains — Knowledge, Skill, and Attitude. Narrow the source SLOs to only
   what fits in this one lesson's duration.
2. Follow KICD CBC lesson plan format exactly
3. Introduction (5–10 min): induction + link to prior learning + key inquiry question (max ~80 words)
4. Lesson Development (main activity, 25–30 min): learner-centred, activity-based (max ~200 words)
5. Conclusion (5 min): summary, exit activity, link to next lesson (max ~60 words)
6. Assessment must be formative — observation, oral questions, written tasks (max ~60 words)
7. Extended activities for fast learners (max ~40 words)
8. Support activities for learners who need help (max ~40 words)
9. Core Competencies: select relevant ones from: Communication & Collaboration, Critical Thinking & Problem Solving, Creativity & Imagination, Citizenship, Digital Literacy, Learning to Learn, Self-Efficacy
10. Values: select from: Love, Responsibility, Respect, Unity, Peace, Patriotism, Social Justice, Integrity
11. PCIs (Pertinent & Contemporary Issues): select relevant ones (max ~20 words)
12. learningMaterials/referenceBooks: short lists, not paragraphs (max ~30 words each). Name resource
    TYPES or general titles only — never cite a specific page number, since you cannot verify one and
    will get it wrong.

Return ONLY valid JSON, no markdown fences, every field a plain string/array kept within the limits above:
{
  "strand": "...",
  "subStrand": "...",
  "specificLearningOutcomes": "...",
  "keyInquiryQuestions": "...",
  "coreCompetencies": ["..."],
  "values": ["..."],
  "pertinentIssues": "...",
  "linkToOtherSubjects": "...",
  "introduction": "...",
  "lessonDevelopment": "...",
  "conclusion": "...",
  "assessment": "...",
  "extendedActivities": "...",
  "supportActivities": "...",
  "learningMaterials": "...",
  "referenceBooks": "..."
}`;

    const response = await this.callClaude(prompt, 8192);
    const parsed = this.parseJson(response.text, 'Lesson Plan', response.truncated);
    return { ...parsed, tokens: response.tokens };
  }

  // ── GENERATE LESSON NOTES ──────────────────────────────────
  async generateLessonNotes(params: {
    subjectName: string;
    gradeLevel: string;
    strand: string;
    subStrand: string;
    slos: string;
    lessonDevelopment: string;
    assessment: string;
    additionalContext?: string;
  }): Promise<LessonNotesData & { tokens: number }> {
    const grade = params.gradeLevel.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const prompt = `You are a KICD-certified Kenyan teacher writing lesson notes in the official KICD
Lesson Notes format.
${languageInstruction(params.subjectName)}
LESSON INFO:
- Subject: ${params.subjectName}, ${grade}
- Strand: ${params.strand} / ${params.subStrand}
- SLOs: ${params.slos}
- Lesson Development Summary: ${params.lessonDevelopment}
${params.additionalContext ? `- Additional Context: ${params.additionalContext}` : ''}

Generate concise, usable lesson notes a teacher can read straight off the page during delivery — thorough
enough to teach from, but not padded. Fill these KICD template sections, keeping to the approximate word
limits below so the response stays short:
1. SLOs covered — restate the SLOs actually addressed (max ~50 words)
2. Introduction — concept framing / link to previous learning (max ~60 words)
3. Content — explanations, definitions, worked examples, organised by SLO (max ~300 words)
4. Key vocabulary — new terms and their meanings, one per line (max ~80 words)
5. Summary — consolidation of the main points (max ~60 words)
6. Review questions with answers — 3-4 short Q&A pairs, format "Q: ...\\nA: ..." per pair (max ~100 words)
7. References — general book titles/course materials or digital sources, one per line, or "Not specified"
   if none (max ~30 words). Never invent a specific page number — you cannot verify one and will get it wrong.
8. Learner content — the CONTENT section rewritten as a simple, plain-language handout a learner reads
   themselves (short sentences, no teacher-only instructions, define any hard terms) (max ~200 words)

Return ONLY valid JSON, no markdown fences, every field a plain string kept within the limits above:
{
  "topic": "...",
  "subTopic": "...",
  "slosCovered": "...",
  "introduction": "...",
  "teacherContent": "...",
  "keyVocabulary": "...",
  "summary": "...",
  "reviewQuestions": "...",
  "referenceMaterials": "...",
  "learnerContent": "..."
}`;

    const response = await this.callClaude(prompt, 8192);
    const parsed = this.parseJson(response.text, 'Lesson Notes', response.truncated);
    return { ...parsed, tokens: response.tokens };
  }

  // ── GENERATE LEARNER PROGRESS RECORDS ─────────────────────
  async generateLearnerProgressRecords(params: {
    learners: { id: string; firstName: string; lastName: string; gender: string }[];
    subjectName: string;
    gradeLevel: string;
    strand: string;
    subStrand: string;
    sloAssessed: string;
    assessmentContext: string;
  }): Promise<{ records: LearnerProgressData[]; tokens: number }> {
    const grade = params.gradeLevel.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const perfLevels = performanceLevelScale(params.gradeLevel);

    const learnerList = params.learners
      .map((l, i) => `${i + 1}. ${l.firstName} ${l.lastName} (${l.gender})`)
      .join('\n');

    const prompt = `You are a CBC-trained Kenyan teacher recording learner progress.
${languageInstruction(params.subjectName)}
ASSESSMENT CONTEXT:
- Subject: ${params.subjectName}, ${grade}
- Strand: ${params.strand}
- Sub-Strand: ${params.subStrand}
- SLO Assessed: ${params.sloAssessed}
- Observation Context: ${params.assessmentContext}

PERFORMANCE LEVELS: ${perfLevels}

LEARNERS:
${learnerList}

For each learner, assign a realistic, varied performance level and write brief evidence (one sentence)
of what the learner did that shows this level. Be realistic — not everyone exceeds expectation.

Return ONLY valid JSON:
{
  "records": [
    {
      "learnerId": "use position number as placeholder e.g. 1",
      "performanceLevel": "EE|ME|AE|BE (or numbered variant for G7-12)",
      "evidence": "One-sentence observation of what this learner did",
      "teacherComment": "Brief actionable comment (max 15 words)",
      "supportNeeded": false
    }
  ]
}`;

    // One record per learner — a large class needs proportionally more room.
    const maxTokens = Math.min(8192, 1024 + params.learners.length * 150);
    const response = await this.callClaude(prompt, maxTokens);
    const parsed = this.parseJson(response.text, 'Learner Progress', response.truncated);

    const mapped = parsed.records.map((r: any, i: number) => ({
      ...r,
      learnerId: params.learners[i]?.id || r.learnerId,
    }));

    return { records: mapped, tokens: response.tokens };
  }

  // ── PRIVATE: Call Claude ───────────────────────────────────
  private async callClaude(prompt: string, maxTokens: number, model: string = MODEL_FAST): Promise<{ text: string; tokens: number; truncated: boolean }> {
    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');

      return { text, tokens: response.usage?.output_tokens || 0, truncated: response.stop_reason === 'max_tokens' };
    } catch (err: any) {
      this.logger.error(`Claude API error: ${err.message}`);
      throw new BadRequestException(`AI generation failed: ${err.message}`);
    }
  }

  private parseJson(raw: string, context: string, truncated = false): any {
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      if (truncated) {
        throw new BadRequestException(
          `The AI response for ${context} was cut off before it finished (too long for the request). ` +
          `Try fewer weeks, fewer columns, or try again.`,
        );
      }
      throw new BadRequestException(`Could not parse AI response for ${context}. Please try again.`);
    }
  }
}
