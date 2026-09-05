import {
  IsNotEmpty, IsOptional, IsString, IsEnum,
  IsUUID, IsNumber, IsArray, IsBoolean,
} from 'class-validator';

export class GenerateSchemeDto {
  // Required for a school-tenant teacher (picked from real streams/subject_catalogue
  // rows); omitted for an individual account, which instead sends `streamName` and
  // finds-or-creates its own stream/subject by name — see SchemeService.generate().
  @IsOptional() @IsUUID()   streamId?: string;
  @IsOptional() @IsUUID()   subjectId?: string;
  @IsOptional() @IsString() streamName?: string;
  @IsNotEmpty() @IsString() subjectName: string;
  @IsNotEmpty() @IsString() gradeLevel: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsEnum(['term_1', 'term_2', 'term_3']) term: string;
  @IsOptional() @IsNumber() totalWeeks?: number;
  @IsOptional() @IsNumber() periodsPerWeek?: number;
  // 1-indexed lesson-slot positions (within the week's lesson sequence) that run as
  // a double lesson — each merges 2 periods into a single lesson/column.
  @IsOptional() @IsArray()  doubleLessonSlots?: number[];
  @IsOptional() @IsString() schoolContext?: string;
  @IsOptional() @IsArray()  strandFocus?: string[];

  // Document header fields — printed on the generated scheme, not used for AI generation.
  // schoolName is mandatory (even for individual accounts with no school tenant) — it's
  // stamped as a watermark on the rendered document specifically so a teacher can't
  // generate an unattributed scheme and hand it to a teacher at another school.
  @IsNotEmpty() @IsString() schoolName: string;
  @IsOptional() @IsString() teacherName?: string;
  @IsOptional() @IsString() tscNumber?: string;
  @IsOptional() @IsString() signOffLine?: string;
  @IsOptional() @IsString() curriculumEdition?: string;
  @IsOptional() @IsNumber() startWeek?: number;
  @IsOptional() @IsArray()  columns?: string[];
  @IsOptional() @IsString() defaultFont?: string;

  // Weeks that aren't ordinary teaching weeks — mid-term breaks, summative
  // assessment weeks, exam weeks — so the AI can plan pacing around them
  // instead of scheduling curriculum content into them.
  @IsOptional() @IsArray()  specialWeeks?: { week: number; label: string }[];
}

export class GenerateLessonPlanDto {
  @IsNotEmpty() @IsUUID()   schemeId: string;
  @IsNotEmpty() @IsUUID()   schemeWeekId: string;
  // Which lesson within the week (1-indexed, matches SchemeWeek.lessons[].lessonNumber).
  // Optional only for legacy weeks with no per-lesson breakdown, where it's ignored.
  @IsOptional() @IsNumber() lessonSlot?: number;
  @IsOptional() @IsString() lessonDate?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
}

export class GenerateLessonNotesDto {
  // Either lessonPlanId (notes for an existing plan), or schemeId+schemeWeekId
  // (generate notes straight from a scheme week, skipping the lesson plan step) —
  // exactly one path is required, enforced in RecordsService.generateNotes().
  @IsOptional() @IsUUID()   lessonPlanId?: string;
  @IsOptional() @IsUUID()   schemeId?: string;
  @IsOptional() @IsUUID()   schemeWeekId?: string;
  // Which lesson within the week — only used on the schemeId+schemeWeekId path.
  @IsOptional() @IsNumber() lessonSlot?: number;
  @IsOptional() @IsString() additionalContext?: string;
}

export class RecordWorkCoveredDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsUUID()   subjectId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: string;
  @IsNotEmpty() @IsNumber() weekNumber: number;
  @IsNotEmpty() @IsString() lessonDate: string;
  @IsNotEmpty() @IsString() topic: string;
  @IsOptional() @IsString() subTopic?: string;
  @IsOptional() @IsString() strand?: string;
  @IsOptional() @IsString() subStrand?: string;
  @IsOptional() @IsString() activities?: string;
  @IsNotEmpty() @IsEnum(['covered', 'partially_covered', 'not_covered', 'postponed']) coverageStatus: string;
  @IsOptional() @IsString() reasonIfNotCovered?: string;
  @IsOptional() @IsNumber() learnerCount?: number;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsUUID()   lessonNoteId?: string;
}

export class GenerateLearnerProgressDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsUUID()   subjectId: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsString() term: string;
  @IsNotEmpty() @IsString() strand: string;
  @IsNotEmpty() @IsString() subStrand: string;
  @IsOptional() @IsArray()  learnerIds?: string[];
}

export class SubmitForApprovalDto {
  @IsNotEmpty() @IsString() recordType: 'scheme_of_work' | 'lesson_plan' | 'lesson_notes';
  @IsNotEmpty() @IsUUID()   recordId: string;
  @IsOptional() @IsUUID()   submittedTo?: string;
}

export class ReviewRecordDto {
  @IsNotEmpty() @IsEnum(['approved', 'rejected', 'revision_requested']) action: string;
  @IsOptional() @IsString() comment?: string;
}

// Edit-and-resubmit: lets a teacher fix a scheme week that came back with
// 'revision_requested' (or is still a plain 'draft') without paying to regenerate.
export class EditSchemeWeekDto {
  @IsOptional() @IsString() strand?: string;
  @IsOptional() @IsString() subStrand?: string;
  @IsOptional() @IsString() specificLearningOutcomes?: string;
  @IsOptional() @IsString() keyInquiryQuestions?: string;
  @IsOptional() @IsString() learningExperiences?: string;
  @IsOptional() @IsString() learningResources?: string;
  @IsOptional() @IsString() assessmentMethods?: string;
  @IsOptional() @IsString() reflectionNotes?: string;
  @IsOptional() @IsArray()  coreCompetencies?: string[];
  @IsOptional() @IsArray()  values?: string[];
  @IsOptional() @IsString() pertinentIssues?: string;
  // When the week has a per-lesson breakdown (modern schemes), edit just one lesson
  // entry in the `lessons` JSONB array instead of the week-level scalar fields above.
  @IsOptional() @IsNumber() lessonNumber?: number;
  @IsOptional() @IsString() lessonSpecificLearningOutcomes?: string;
  @IsOptional() @IsString() lessonKeyInquiryQuestions?: string;
  @IsOptional() @IsString() lessonLearningExperiences?: string;
}

export class EditLessonPlanDto {
  @IsOptional() @IsString() specificLearningOutcomes?: string;
  @IsOptional() @IsString() keyInquiryQuestions?: string;
  @IsOptional() @IsArray()  coreCompetencies?: string[];
  @IsOptional() @IsArray()  values?: string[];
  @IsOptional() @IsString() pertinentIssues?: string;
  @IsOptional() @IsString() linkToOtherSubjects?: string;
  @IsOptional() @IsString() introduction?: string;
  @IsOptional() @IsString() lessonDevelopment?: string;
  @IsOptional() @IsString() conclusion?: string;
  @IsOptional() @IsString() assessment?: string;
  @IsOptional() @IsString() extendedActivities?: string;
  @IsOptional() @IsString() supportActivities?: string;
  @IsOptional() @IsString() learningMaterials?: string;
  @IsOptional() @IsString() referenceBooks?: string;
}
