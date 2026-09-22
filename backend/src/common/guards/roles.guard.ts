import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const role = req.user?.role;
    if (requiredRoles.includes(role)) return true;

    // DOS (Director of Studies) mirrors school_admin/hoi access everywhere
    // except Finance — the whole FinanceController, and any endpoint on
    // another controller that also admits 'bursar' (payslip/invoice/receipt
    // PDFs etc.), stays off-limits to DOS.
    if (role === 'dos') {
      const grantsAdmin = requiredRoles.includes('school_admin') || requiredRoles.includes('hoi');
      const isFinance = context.getClass().name === 'FinanceController' || requiredRoles.includes('bursar');
      return grantsAdmin && !isFinance;
    }

    return false;
  }
}
