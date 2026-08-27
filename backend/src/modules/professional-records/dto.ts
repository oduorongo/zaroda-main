import {
  IsNotEmpty, IsOptional, IsString, IsEnum,
  IsUUID, IsNumber, IsArray, IsBoolean,
} from 'class-validator';

export class GenerateSchemeDto {
  @IsNotEmpty() @IsUUID()   streamId: string;
  @IsNotEmpty() @IsUUID()   subjectId: string;
  @IsNotEmpty() @IsString() subjectName: string;
  @IsNotEmpty() @IsString() gradeLevel: string;
  @IsNotEmpty() @IsString() academicYear: string;
  @IsNotEmpty() @IsEnum(['term_1', 'term_2', 'term_3']) term: string;
  @IsOptional() @IsNumber() totalWeeks?: number;
  @IsOptional() @IsNumber() periodsPerWeek?: number;
  @IsOptional() @IsString() schoolContext?: string;
  @IsOptional() @IsArray()  strandFocus?: string[];

  // Document header fields — printed on the generated scheme, not used for AI generation.
  @IsOptional() @IsString() schoolName?: string;
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
  @IsOptional() @IsString() lessonDate?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
}

export class GenerateLessonNotesDto {
  @IsNotEmpty() @IsUUID()   lessonPlanId: string;
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
