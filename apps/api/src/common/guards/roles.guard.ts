import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { AppRole, ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException("Access denied");
    }

    try {
      const user = (await this.connection.model("User").findById(userId).select("role")) as {
        role?: string;
      } | null;

      if (!user || !roles.includes(user.role as AppRole)) {
        throw new ForbiddenException("Access denied");
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException("Unable to verify admin");
    }
  }
}
