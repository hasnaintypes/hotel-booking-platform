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
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { DiscrepancyDto, DiscrepancyPageDto } from "./dto/discrepancy-response.dto";
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
  @ZodResponse({ type: DiscrepancyPageDto, status: 200, description: "One page of findings" })
  list(@Query() query: ListDiscrepanciesQueryDto) {
    return this.reconciliationService.listDiscrepancies(query);
  }

  @Patch("discrepancies/:id")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("reconciliation.manage")
  @ZodResponse({ type: DiscrepancyDto, status: 200, description: "The updated finding" })
  update(
    @Param("id", UuidPipe) id: string,
    @Body() dto: UpdateDiscrepancyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reconciliationService.updateDiscrepancy(id, dto, user.userId);
  }
}
