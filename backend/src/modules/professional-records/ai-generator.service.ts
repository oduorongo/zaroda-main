// ============================================================
// Core Claude AI generation engine for Professional Records
// ============================================================
import { Injectable, BadRequestException, Logger } from '@nestjs/common';

// Scheme of Work needs a full term of curriculum reasoning — kept on Sonnet.
// Lesson plans/notes/progress are short, formulaic, single-shot generations —
// Haiku is far cheaper and holds up fine on this kind of structured output.
const MODEL_SCHEME = 'claude-sonnet-4-20250514';
const MODEL_FAST = 'claude-haiku-4-5-20251001';

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

export interface LessonNotesData {
  topic: string;
  subTopic: string;
  teacherContent: string;
  boardWork: string;
  examples: string;
  activities: string;
  questions: string;
  assessmentEvidence: string;
  expectedResponses: string;
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
  }): Promise<{ weeks: SchemeWeekData[]; title: string; tokens: number }> {
    const band = gradeBand(params.gradeLevel);
    const grade = params.gradeLevel.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const termLabel = params.term.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const cols = new Set(params.columns?.length ? params.columns : ['keyInquiry', 'learningExperiences', 'resources', 'assessment', 'reflection']);
    const wantReflection = cols.has('reflection');
    const wantCorePV = cols.has('corePV');
    const specialWeeks = (params.specialWeeks || []).filter(w => w?.week && w?.label);

    const prompt = `You are a KICD-certified curriculum expert generating a CBC/CBE-aligned Scheme of Work for Kenyan schools.

CONTEXT:
- Subject: ${params.subjectName}
- Grade Level: ${grade}
- Term: ${termLabel}, ${params.academicYear}
- Grade Band: ${band}
- Total Weeks: ${params.totalWeeks}
- Periods per Week: ${params.periodsPerWeek}
- School Context: ${params.schoolContext || 'Mixed day school, Kenya'}
${params.strandFocus?.length ? `- Priority Strands: ${params.strandFocus.join(', ')}` : ''}
${specialWeeks.length ? `- Non-teaching weeks (mid-term breaks, summative assessments, exams — no new curriculum content): ${specialWeeks.map(w => `Week ${w.week} = ${w.label}`).join('; ')}` : ''}

REQUIREMENTS:
1. Follow the KICD ${params.subjectName} syllabus for ${grade} exactly
2. Distribute strands and sub-strands appropriately across ${params.totalWeeks} weeks
3. Each week must have clear, measurable Specific Learning Outcomes (SLOs)
4. Include Key Inquiry Questions that stimulate critical thinking
5. Learning experiences must be learner-centred and activity-based (CBC approach)
6. Assessment methods must align with CBC formative assessment principles
7. Week 1 should include orientation/introduction activities
8. Final week should include revision/consolidation
9. Use authentic Kenyan contexts, examples, and resources
${wantCorePV ? '10. For each week, also select relevant Core Competencies (e.g. Communication & Collaboration, Critical Thinking & Problem Solving, Creativity & Imagination, Citizenship, Digital Literacy, Learning to Learn, Self-Efficacy), Values (e.g. Love, Responsibility, Respect, Unity, Peace, Patriotism, Social Justice, Integrity), and Pertinent & Contemporary Issues (PCIs).' : ''}
${specialWeeks.length ? `11. For every week listed above as non-teaching, set both "strand" and "subStrand" to that week's exact label, set "specificLearningOutcomes" to "N/A — ${specialWeeks.map(w=>w.label).join('/')}", leave "keyInquiryQuestions"/"learningExperiences"/"learningResources"/"assessmentMethods" empty, and do NOT plan any new curriculum content into that week — shift the affected teaching into the remaining weeks instead.` : ''}

Return ONLY valid JSON (no preamble, no markdown fences):
{
  "title": "Scheme of Work — ${params.subjectName} ${grade} ${termLabel} ${params.academicYear}",
  "weeks": [
    {
      "weekNumber": 1,
      "dates": "Jan 6 – Jan 10, 2025",
      "strand": "Strand name from KICD syllabus",
      "subStrand": "Sub-strand name",
      "specificLearningOutcomes": "By the end of the lesson, the learner should be able to...",
      "keyInquiryQuestions": "1. ...\\n2. ...",
      "learningExperiences": "Learners will...",
      "learningResources": "Textbook pg X, charts, realia...",
      "assessmentMethods": "Observation, oral questions, written exercise",
      "periods": ${params.periodsPerWeek},
      "remarks": ""${wantReflection ? ',\n      "reflectionNotes": "Leave as an empty string — filled in by the teacher after delivery"' : ''}${wantCorePV ? ',\n      "coreCompetencies": ["..."],\n      "values": ["..."],\n      "pertinentIssues": "..."' : ''}
    }
  ]
}`;

    const response = await this.callClaude(prompt, 4096, MODEL_SCHEME);
    const parsed = this.parseJson(response.text, 'Scheme of Work');

    if (!parsed.weeks || !Array.isArray(parsed.weeks)) {
      throw new BadRequestException('AI returned invalid scheme structure');
    }

    return { weeks: parsed.weeks, title: parsed.title, tokens: response.tokens };
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

LESSON CONTEXT:
- Subject: ${params.subjectName}
- Grade: ${grade}
- Strand: ${params.strand}
- Sub-Strand: ${params.subStrand}
- Specific Learning Outcomes: ${params.slos}
- Key Inquiry Questions: ${params.keyInquiryQuestions}
- Duration: ${params.durationMinutes} minutes
- Lesson Date: ${params.lessonDate || 'TBD'}
- Resources from Scheme: ${params.learningResources}
- School Context: ${params.schoolContext || 'Mixed day school, Kenya'}

REQUIREMENTS:
1. Follow KICD CBC lesson plan format exactly
2. Introduction (5–10 min): set induction, link to prior learning, pose key inquiry question
3. Lesson Development (main activity, 25–30 min): learner-centred, activity-based
4. Conclusion (5 min): summary, exit activity, link to next lesson
5. Assessment must be formative — observation, oral questions, written tasks
6. Include extended activities for fast learners
7. Include support activities for learners who need help
8. Core Competencies: select relevant ones from: Communication & Collaboration, Critical Thinking & Problem Solving, Creativity & Imagination, Citizenship, Digital Literacy, Learning to Learn, Self-Efficacy
9. Values: select from: Love, Responsibility, Respect, Unity, Peace, Patriotism, Social Justice, Integrity
10. PCIs (Pertinent & Contemporary Issues): select relevant ones

Return ONLY valid JSON:
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

    const response = await this.callClaude(prompt, 2048);
    const parsed = this.parseJson(response.text, 'Lesson Plan');
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

    const prompt = `You are a KICD-certified Kenyan teacher writing detailed lesson notes.

LESSON INFO:
- Subject: ${params.subjectName}, ${grade}
- Strand: ${params.strand} / ${params.subStrand}
- SLOs: ${params.slos}
- Lesson Development Summary: ${params.lessonDevelopment}
${params.additionalContext ? `- Additional Context: ${params.additionalContext}` : ''}

Generate comprehensive lesson notes that a teacher will use during delivery. Include:
1. Teacher content — the actual subject matter to be taught (detailed notes)
2. Board work — what the teacher writes on the board
3. Worked examples — step-by-step solutions or examples
4. Learner activities — what learners do (detailed instructions)
5. Probing questions — questions to check understanding at each stage
6. Expected learner responses
7. Assessment evidence — what to look for to confirm learning

Return ONLY valid JSON:
{
  "topic": "...",
  "subTopic": "...",
  "teacherContent": "...",
  "boardWork": "...",
  "examples": "...",
  "activities": "...",
  "questions": "...",
  "assessmentEvidence": "...",
  "expectedResponses": "..."
}`;

    const response = await this.callClaude(prompt, 2048);
    const parsed = this.parseJson(response.text, 'Lesson Notes');
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

    const response = await this.callClaude(prompt, 2048);
    const parsed = this.parseJson(response.text, 'Learner Progress');

    const mapped = parsed.records.map((r: any, i: number) => ({
      ...r,
      learnerId: params.learners[i]?.id || r.learnerId,
    }));

    return { records: mapped, tokens: response.tokens };
  }

  // ── PRIVATE: Call Claude ───────────────────────────────────
  private async callClaude(prompt: string, maxTokens: number, model: string = MODEL_FAST): Promise<{ text: string; tokens: number }> {
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

      return { text, tokens: response.usage?.output_tokens || 0 };
    } catch (err: any) {
      this.logger.error(`Claude API error: ${err.message}`);
      throw new BadRequestException(`AI generation failed: ${err.message}`);
    }
  }

  private parseJson(raw: string, context: string): any {
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      throw new BadRequestException(`Could not parse AI response for ${context}. Please try again.`);
    }
  }
}
