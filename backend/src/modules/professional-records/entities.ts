// ============================================================
// Professional Records — TypeORM entities
// Maps to backend/database/migrations/006_professional_records_schema.sql
// ============================================================
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany, ManyToOne, JoinColumn,
} from 'typeorm';

@Entity('subject_catalogue')
export class SubjectCatalogue {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'school_id' }) schoolId: string;
  @Column() name: string;
  @Column({ nullable: true }) code: string;
  @Column() category: string;
  @Column({ name: 'grade_band' }) gradeBand: string;
  @Column({ nullable: true }) pathway: string;
  @Column({ name: 'has_strands', default: true }) hasStrands: boolean;
  @Column({ name: 'is_examinable', default: true }) isExaminable: boolean;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('schemes_of_work')
export class SchemeOfWork {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'school_id' }) schoolId: string;
  @Column({ name: 'teacher_id' }) teacherId: string;
  @Column({ name: 'stream_id' }) streamId: string;
  @Column({ name: 'subject_id' }) subjectId: string;

  @Column({ name: 'academic_year' }) academicYear: string;
  @Column() term: string;
  @Column({ name: 'grade_level' }) gradeLevel: string;
  @Column() title: string;

  @Column({ name: 'ai_generated', default: false }) aiGenerated: boolean;
  @Column({ name: 'ai_model', nullable: true }) aiModel: string;
  @Column({ name: 'generation_prompt', nullable: true }) generationPrompt: string;
  @Column({ name: 'generation_tokens', nullable: true, type: 'int' }) generationTokens: number;

  @Column({ default: 'draft' }) status: string;
  @Column({ name: 'submitted_at', nullable: true }) submittedAt: Date;
  @Column({ name: 'submitted_to', nullable: true }) submittedTo: string;
  @Column({ name: 'reviewed_by', nullable: true }) reviewedBy: string;
  @Column({ name: 'reviewed_at', nullable: true }) reviewedAt: Date;
  @Column({ name: 'review_comment', nullable: true }) reviewComment: string;

  @Column({ name: 'pdf_url', nullable: true }) pdfUrl: string;
  @Column({ name: 'docx_url', nullable: true }) docxUrl: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @Column({ name: 'deleted_at', nullable: true }) deletedAt: Date;

  @OneToMany(() => SchemeWeek, (w) => w.scheme)
  weeks: SchemeWeek[];
}

@Entity('scheme_weeks')
export class SchemeWeek {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'scheme_id' }) schemeId: string;

  @Column({ name: 'week_number' }) weekNumber: number;
  @Column({ nullable: true }) dates: string;
  @Column() strand: string;
  @Column({ name: 'sub_strand' }) subStrand: string;
  @Column({ name: 'specific_learning_outcomes', type: 'text' }) specificLearningOutcomes: string;
  @Column({ name: 'key_inquiry_questions', type: 'text', nullable: true }) keyInquiryQuestions: string;
  @Column({ name: 'learning_experiences', type: 'text' }) learningExperiences: string;
  @Column({ name: 'learning_resources', type: 'text', nullable: true }) learningResources: string;
  @Column({ name: 'assessment_methods', type: 'text', nullable: true }) assessmentMethods: string;
  @Column({ name: 'reflection_notes', type: 'text', nullable: true }) reflectionNotes: string;
  @Column({ default: 5 }) periods: number;
  @Column({ type: 'text', nullable: true }) remarks: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;

  @ManyToOne(() => SchemeOfWork, (s) => s.weeks)
  @JoinColumn({ name: 'scheme_id' })
  scheme: SchemeOfWork;
}

@Entity('lesson_plans')
export class LessonPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'teacher_id' }) teacherId: string;
  @Column({ name: 'scheme_id' }) schemeId: string;
  @Column({ name: 'scheme_week_id', nullable: true }) schemeWeekId: string;
  @Column({ name: 'stream_id' }) streamId: string;
  @Column({ name: 'subject_id' }) subjectId: string;

  @Column({ name: 'lesson_date', type: 'date', nullable: true }) lessonDate: Date | null;
  @Column({ name: 'lesson_number', nullable: true }) lessonNumber: number;
  @Column({ name: 'duration_minutes', default: 40 }) durationMinutes: number;
  @Column({ name: 'grade_level' }) gradeLevel: string;

  @Column() strand: string;
  @Column({ name: 'sub_strand' }) subStrand: string;
  @Column({ name: 'specific_learning_outcomes', type: 'text' }) specificLearningOutcomes: string;
  @Column({ name: 'key_inquiry_questions', type: 'text', nullable: true }) keyInquiryQuestions: string;
  @Column({ name: 'core_competencies', type: 'text', array: true, nullable: true }) coreCompetencies: string[];
  @Column({ type: 'text', array: true, nullable: true }) values: string[];
  @Column({ name: 'pertinent_issues', type: 'text', nullable: true }) pertinentIssues: string;
  @Column({ name: 'link_to_other_subjects', type: 'text', nullable: true }) linkToOtherSubjects: string;

  @Column({ type: 'text' }) introduction: string;
  @Column({ name: 'lesson_development', type: 'text' }) lessonDevelopment: string;
  @Column({ type: 'text' }) conclusion: string;
  @Column({ type: 'text' }) assessment: string;
  @Column({ name: 'extended_activities', type: 'text', nullable: true }) extendedActivities: string;
  @Column({ name: 'support_activities', type: 'text', nullable: true }) supportActivities: string;

  @Column({ name: 'learning_materials', type: 'text', nullable: true }) learningMaterials: string;
  @Column({ name: 'reference_books', type: 'text', nullable: true }) referenceBooks: string;

  @Column({ name: 'ai_generated', default: false }) aiGenerated: boolean;
  @Column({ name: 'ai_model', nullable: true }) aiModel: string;

  @Column({ default: 'draft' }) status: string;
  @Column({ name: 'submitted_at', nullable: true }) submittedAt: Date;
  @Column({ name: 'reviewed_by', nullable: true }) reviewedBy: string;
  @Column({ name: 'reviewed_at', nullable: true }) reviewedAt: Date;
  @Column({ name: 'review_comment', nullable: true }) reviewComment: string;

  @Column({ name: 'pdf_url', nullable: true }) pdfUrl: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('lesson_notes')
export class LessonNote {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'teacher_id' }) teacherId: string;
  @Column({ name: 'lesson_plan_id' }) lessonPlanId: string;
  @Column({ name: 'stream_id' }) streamId: string;
  @Column({ name: 'subject_id' }) subjectId: string;

  @Column({ name: 'lesson_date', type: 'date' }) lessonDate: Date;
  @Column({ name: 'grade_level' }) gradeLevel: string;
  @Column() topic: string;
  @Column({ name: 'sub_topic', nullable: true }) subTopic: string;

  @Column({ name: 'teacher_content', type: 'text' }) teacherContent: string;
  @Column({ name: 'board_work', type: 'text', nullable: true }) boardWork: string;
  @Column({ type: 'text', nullable: true }) examples: string;
  @Column({ type: 'text' }) activities: string;
  @Column({ type: 'text', nullable: true }) questions: string;

  @Column({ name: 'assessment_evidence', type: 'text', nullable: true }) assessmentEvidence: string;
  @Column({ name: 'expected_responses', type: 'text', nullable: true }) expectedResponses: string;

  @Column({ name: 'actual_duration', nullable: true }) actualDuration: number;
  @Column({ name: 'coverage_status', default: 'pending' }) coverageStatus: string;
  @Column({ name: 'delivery_remarks', type: 'text', nullable: true }) deliveryRemarks: string;

  @Column({ name: 'ai_generated', default: false }) aiGenerated: boolean;
  @Column({ name: 'ai_model', nullable: true }) aiModel: string;
  @Column({ name: 'pdf_url', nullable: true }) pdfUrl: string;

  @Column({ default: 'draft' }) status: string;
  @Column({ name: 'submitted_at', nullable: true }) submittedAt: Date;
  @Column({ name: 'reviewed_by', nullable: true }) reviewedBy: string;
  @Column({ name: 'reviewed_at', nullable: true }) reviewedAt: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('records_of_work')
export class RecordOfWork {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'teacher_id' }) teacherId: string;
  @Column({ name: 'stream_id' }) streamId: string;
  @Column({ name: 'subject_id' }) subjectId: string;
  @Column({ name: 'lesson_note_id', nullable: true }) lessonNoteId: string;

  @Column({ name: 'academic_year' }) academicYear: string;
  @Column() term: string;
  @Column({ name: 'week_number' }) weekNumber: number;
  @Column({ name: 'lesson_date', type: 'date' }) lessonDate: Date;
  @Column({ name: 'period_number', nullable: true }) periodNumber: number;

  @Column() topic: string;
  @Column({ name: 'sub_topic', nullable: true }) subTopic: string;
  @Column({ nullable: true }) strand: string;
  @Column({ name: 'sub_strand', nullable: true }) subStrand: string;
  @Column({ type: 'text', nullable: true }) activities: string;
  @Column({ name: 'coverage_status', default: 'covered' }) coverageStatus: string;
  @Column({ name: 'reason_if_not_covered', type: 'text', nullable: true }) reasonIfNotCovered: string;
  @Column({ name: 'learner_count', nullable: true }) learnerCount: number;
  @Column({ type: 'text', nullable: true }) remarks: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('learner_progress_entries')
export class LearnerProgressEntry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'teacher_id' }) teacherId: string;
  @Column({ name: 'learner_id' }) learnerId: string;
  @Column({ name: 'stream_id' }) streamId: string;
  @Column({ name: 'subject_id' }) subjectId: string;

  @Column({ name: 'academic_year' }) academicYear: string;
  @Column() term: string;
  @Column({ name: 'week_number', nullable: true }) weekNumber: number;

  @Column() strand: string;
  @Column({ name: 'sub_strand', nullable: true }) subStrand: string;
  @Column({ name: 'slo_assessed', type: 'text', nullable: true }) sloAssessed: string;

  @Column({ name: 'performance_level' }) performanceLevel: string;
  @Column({ type: 'text', nullable: true }) evidence: string;
  @Column({ name: 'teacher_comment', type: 'text', nullable: true }) teacherComment: string;
  @Column({ name: 'support_needed', default: false }) supportNeeded: boolean;
  @Column({ name: 'support_type', type: 'text', nullable: true }) supportType: string;

  @Column({ name: 'assessment_date', type: 'date' }) assessmentDate: Date;
  @Column({ name: 'ai_generated', default: false }) aiGenerated: boolean;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('teacher_documents')
export class TeacherDocument {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'teacher_id' }) teacherId: string;
  @Column({ name: 'document_type' }) documentType: string;
  @Column({ name: 'reference_id', nullable: true }) referenceId: string;
  @Column() title: string;
  @Column({ name: 'file_url' }) fileUrl: string;
  @Column({ name: 'file_size_kb', nullable: true }) fileSizeKb: number;
  @Column({ name: 'academic_year', nullable: true }) academicYear: string;
  @Column({ nullable: true }) term: string;
  @Column({ name: 'subject_name', nullable: true }) subjectName: string;
  @Column({ name: 'stream_name', nullable: true }) streamName: string;
  @Column({ name: 'download_count', default: 0 }) downloadCount: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('pr_purchases')
export class PrPurchase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'teacher_id' }) teacherId: string;
  @Column({ name: 'scheme_id', nullable: true }) schemeId: string | null;

  @Column({ type: 'numeric', default: 50 }) amount: number;
  @Column({ nullable: true }) phone: string;

  @Column({ name: 'checkout_request_id', nullable: true }) checkoutRequestId: string;
  @Column({ name: 'merchant_request_id', nullable: true }) merchantRequestId: string;
  @Column({ name: 'mpesa_receipt_number', nullable: true }) mpesaReceiptNumber: string;

  @Column({ default: 'pending' }) status: string;
  @Column({ name: 'result_desc', type: 'text', nullable: true }) resultDesc: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('professional_records_audit')
export class PrAudit {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'record_type' }) recordType: string;
  @Column({ name: 'record_id' }) recordId: string;
  @Column() action: string;
  @Column({ name: 'actor_id', nullable: true }) actorId: string;
  @Column({ name: 'actor_role', nullable: true }) actorRole: string;
  @Column({ type: 'text', nullable: true }) comment: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
