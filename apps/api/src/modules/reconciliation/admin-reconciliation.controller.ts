import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { ListDiscrepanciesQueryDto } from "./dto/list-discrepancies-query.dto";
import { UpdateDiscrepancyDto } from "./dto/update-discrepancy.dto";
import { ReconciliationService } from "./reconciliation.service";

/** Discrepancy queue: list with filters, then assign, resolve or ignore a finding. */
@Controller("reconciliation")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get("discrepancies")
  @RequirePermissions("reconciliation.read")
  list(@Query() query: ListDiscrepanciesQueryDto) {
    return this.reconciliationService.listDiscrepancies({
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.offset ? { offset: query.offset } : {}),
    });
  }

  @Patch("discrepancies/:id")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("reconciliation.manage")
  update(
    @Param("id", UuidPipe) id: string,
    @Body() dto: UpdateDiscrepancyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reconciliationService.updateDiscrepancy(id, dto, user.userId);
  }
}
