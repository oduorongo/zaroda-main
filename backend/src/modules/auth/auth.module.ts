import { Module }         from '@nestjs/common';
import { JwtModule }      from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService }    from './auth.service';
import { JwtStrategy }    from './jwt.strategy';
import { User }           from './entities/user.entity';
import { Tenant }         from './entities/tenant.entity';
import { School }         from './entities/school.entity';
import { SchoolSettingsController, SchoolSettingsService } from './school-settings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Tenant, School]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret:      cfg.get('JWT_SECRET', 'zaroda-dev-secret'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [AuthController, SchoolSettingsController],
  providers:   [AuthService, JwtStrategy, SchoolSettingsService],
  exports:     [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
