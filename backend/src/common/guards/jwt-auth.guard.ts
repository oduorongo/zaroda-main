import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY, ALLOW_ROLES_KEY, SCHOOL_ONLY_KEY } from '../decorators/access.decorator';

// Account-level access rules live here rather than in a global APP_GUARD: global
// guards run before this controller-level guard, so they would see no req.user yet.
// Here they run right after the token is verified, on every authenticated route.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) { super(); }

  handleRequest(err: any, user: any, _info: any, context: ExecutionContext) {
    if (err || !user) {
      throw new UnauthorizedException('Authentication required — include Authorization: Bearer <token>');
    }
    const targets = [context.getHandler(), context.getClass()];

    if (user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_PASSWORD_CHANGE_KEY, targets)) {
      throw new ForbiddenException({
        statusCode: 403, code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before continuing.',
      });
    }

    if (user.role === 'parent' || user.role === 'learner') {
      const allowed = this.reflector.getAllAndOverride<string[]>(ALLOW_ROLES_KEY, targets) || [];
      if (!allowed.includes(user.role)) throw new ForbiddenException('This area is for school staff only.');
    }

    if (user.accountType === 'individual' && this.reflector.getAllAndOverride<boolean>(SCHOOL_ONLY_KEY, targets)) {
      throw new ForbiddenException('This part of ZARODA needs a school account. Set one up from your dashboard to use it.');
    }

    return user;
  }
}
