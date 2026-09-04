import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SchemeOfWork, SchemeWeek, LessonPlan, LessonNote, RecordOfWork,
  LearnerProgressEntry, TeacherDocument, PrAudit, PrWallet, PrWalletTransaction, SubjectCatalogue,
} from './entities';
import { Learner } from '../academic/academic.module';
import { Tenant } from '../auth/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { AiGeneratorService } from './ai-generator.service';
import { SchemeService } from './scheme.service';
import { LessonPlanService } from './lesson-plan.service';
import { RecordsService } from './records.service';
import { WalletService } from './wallet.service';
import { ProfessionalRecordsController, ProfessionalRecordsPaymentsController } from './professional-records.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SchemeOfWork, SchemeWeek, LessonPlan, LessonNote, RecordOfWork,
      LearnerProgressEntry, TeacherDocument, PrAudit, PrWallet, PrWalletTransaction, SubjectCatalogue, Learner, Tenant, User,
    ]),
  ],
  controllers: [ProfessionalRecordsController, ProfessionalRecordsPaymentsController],
  providers: [AiGeneratorService, SchemeService, LessonPlanService, RecordsService, WalletService],
})
export class ProfessionalRecordsModule {}
