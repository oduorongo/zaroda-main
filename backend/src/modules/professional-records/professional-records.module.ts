import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SchemeOfWork, SchemeWeek, LessonPlan, LessonNote, RecordOfWork,
  LearnerProgressEntry, TeacherDocument, PrAudit, PrPurchase, SubjectCatalogue,
} from './entities';
import { Learner } from '../academic/academic.module';
import { Tenant } from '../auth/entities/tenant.entity';
import { AiGeneratorService } from './ai-generator.service';
import { SchemeService } from './scheme.service';
import { LessonPlanService } from './lesson-plan.service';
import { RecordsService } from './records.service';
import { PurchaseService } from './purchase.service';
import { ProfessionalRecordsController, ProfessionalRecordsPaymentsController } from './professional-records.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SchemeOfWork, SchemeWeek, LessonPlan, LessonNote, RecordOfWork,
      LearnerProgressEntry, TeacherDocument, PrAudit, PrPurchase, SubjectCatalogue, Learner, Tenant,
    ]),
  ],
  controllers: [ProfessionalRecordsController, ProfessionalRecordsPaymentsController],
  providers: [AiGeneratorService, SchemeService, LessonPlanService, RecordsService, PurchaseService],
})
export class ProfessionalRecordsModule {}
