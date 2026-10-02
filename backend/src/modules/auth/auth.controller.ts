import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto, SignupIndividualDto, LoginDto, UpgradeToSchoolDto, ChangePasswordDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AllowRoles, AllowDuringPasswordChange } from '../../common/decorators/access.decorator';

// Per-IP limits on the unauthenticated auth routes only — deliberately not global,
// since a whole school's staff room often shares one public IP.
const perMinute = (limit: number) => Throttle({ default: { limit, ttl: 60_000 } });

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @perMinute(10)
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('signup')
  @UseGuards(ThrottlerGuard)
  @perMinute(5)
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  // Teacher whose school isn't a ZARODA tenant — Professional Records only.
  @Post('signup-individual')
  @UseGuards(ThrottlerGuard)
  @perMinute(5)
  signupIndividual(@Body() dto: SignupIndividualDto) {
    return this.authService.signupIndividual(dto);
  }

  // Turn the signed-in teacher's individual (Professional Records) account into a
  // school account, keeping their login and their existing records. Authenticated
  // rather than public: the account being upgraded is whoever holds the token.
  @Post('upgrade-to-school')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  upgradeToSchool(@Request() req: any, @Body() dto: UpgradeToSchoolDto) {
    return this.authService.upgradeToSchool(req.user.id, dto);
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @perMinute(5)
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: { email: string; appUrl?: string }) {
    return this.authService.forgotPassword(dto.email, dto.appUrl);
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @perMinute(5)
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: { email: string; token: string; password: string }) {
    return this.authService.resetPassword(dto.email, dto.token, dto.password);
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @perMinute(30)
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowRoles('parent', 'learner')
  @AllowDuringPasswordChange()
  @ApiBearerAuth()
  me(@Request() req: any) {
    return this.authService.getMe(req.user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @AllowRoles('parent', 'learner')
  @AllowDuringPasswordChange()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  logout(@Request() req: any) {
    return this.authService.logout(req.user.id);
  }

  // Signed-in password change. Also how a user with must_change_password (a
  // temporary password from an admin) gets back into the rest of the app.
  @Post('change-password')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @perMinute(10)
  @AllowRoles('parent', 'learner')
  @AllowDuringPasswordChange()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
