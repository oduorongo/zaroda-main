import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SchemeOfWork, SchemeWeek, LessonPlan, LessonNote, RecordOfWork,
  LearnerProgressEntry, TeacherDocument, PrAudit, SubjectCatalogue,
} from './entities';
import { Learner } from '../academic/academic.module';
import { AiGeneratorService } from './ai-generator.service';
import { SchemeService } from './scheme.service';
import { LessonPlanService } from './lesson-plan.service';
import { RecordsService } from './records.service';
import { ProfessionalRecordsController } from './professional-records.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SchemeOfWork, SchemeWeek, LessonPlan, LessonNote, RecordOfWork,
      LearnerProgressEntry, TeacherDocument, PrAudit, SubjectCatalogue, Learner,
    ]),
  ],
  controllers: [ProfessionalRecordsController],
  providers: [AiGeneratorService, SchemeService, LessonPlanService, RecordsService],
})
export class ProfessionalRecordsModule {}
