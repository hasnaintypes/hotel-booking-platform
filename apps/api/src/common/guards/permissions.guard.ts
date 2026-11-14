import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UsersRepository } from "../../database/repositories/users.repository";
import { PERMISSIONS_KEY } from "../decorators/require-permissions.decorator";
import { hasPermission, type Permission } from "../permissions/permissions";

/**
 * Authorises a request against the permissions its handler declares. The role is read from the
 * database (not the token) so a demotion takes effect immediately, and an unknown role or user is
 * denied: the guard never fails open.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException("Access denied");
    }

    try {
      const user = await this.users.findById(userId);
      if (!user || !required.every((permission) => hasPermission(user.role, permission))) {
        throw new ForbiddenException("Access denied");
      }
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException("Unable to verify permission");
    }
  }
}
