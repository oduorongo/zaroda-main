import { Module }         from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { ThrottlerModule }from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// ── Feature modules ───────────────────────────────────────
import { AuthModule }               from './modules/auth/auth.module';
import { AcademicModule }           from './modules/academic/academic.module';
import { AssessmentModule }         from './modules/assessment/assessment.module';
import {
  FinanceModule, CommunicationModule, ProfessionalRecordsModule,
  LibraryModule, SportsModule, DisciplineModule, ReferralModule, PdfModule,
  AdminModule, RetoolingModule,
} from './modules/stubs.module';
import { LocationModule }           from './modules/location/location.module';
import { TeacherOnboardModule }     from './modules/onboarding/teacher-onboard.module';

@Module({
  imports: [
    // ── Config (loads .env) ───────────────────────────────
    ConfigModule.forRoot({
      isGlobal:   true,
      envFilePath: '.env',
    }),

    // ── Database ──────────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type:               'postgres',
        url:                cfg.get('DATABASE_URL'),
        host:               cfg.get('DB_HOST',  'localhost'),
        port:               cfg.get<number>('DB_PORT', 5432),
        database:           cfg.get('DB_NAME',  'zaroda_sms'),
        username:           cfg.get('DB_USER',  'zaroda_app'),
        password:           cfg.get('DB_PASS',  'password'),
        // In production: set synchronize:false and use migrations
        synchronize:        cfg.get('NODE_ENV') !== 'production',
        autoLoadEntities:   true,
        ssl:                cfg.get('NODE_ENV') === 'production'
                              ? { rejectUnauthorized: false }
                              : false,
        logging:            cfg.get('NODE_ENV') === 'development' ? ['error'] : false,
        extra: {
          max:              20,
          connectionTimeoutMillis: 3000,
        },
      }),
    }),

    // ── Rate limiting ─────────────────────────────────────
    ThrottlerModule.forRoot([{
      ttl:   60000,   // 1 minute
      limit: 100,     // 100 requests per minute per IP
    }]),

    // ── Cron jobs ─────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Event emitter (internal events) ──────────────────
    EventEmitterModule.forRoot(),

    // ── Feature modules ───────────────────────────────────
    AuthModule,
    LocationModule,
    AcademicModule,
    AssessmentModule,
    FinanceModule,
    CommunicationModule,
    ProfessionalRecordsModule,
    LibraryModule,
    SportsModule,
    DisciplineModule,
    ReferralModule,
    PdfModule,
    AdminModule,
    RetoolingModule,
    TeacherOnboardModule,
  ],
})
export class AppModule {}
