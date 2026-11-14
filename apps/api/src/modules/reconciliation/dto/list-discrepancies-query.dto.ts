import { Transform, type TransformFnParams } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import {
  DISCREPANCY_KINDS,
  DISCREPANCY_STATUSES,
} from "../../../database/repositories/reconciliation.repository";

const MAX_OFFSET = 10_000;

const raw = ({ obj, key }: TransformFnParams): unknown => obj[key];

const blankToUndefined = (params: TransformFnParams) => {
  const value = raw(params);
  return value === "" || value === null ? undefined : value;
};

const toOptionalNumber = (params: TransformFnParams) => {
  const value = blankToUndefined(params);
  return typeof value === "string" ? Number(value) : value;
};

/** Filters for the discrepancy queue. */
export class ListDiscrepanciesQueryDto {
  @IsOptional()
  @Transform(blankToUndefined)
  @IsIn(DISCREPANCY_STATUSES)
  status?: (typeof DISCREPANCY_STATUSES)[number];

  @IsOptional()
  @Transform(blankToUndefined)
  @IsIn(DISCREPANCY_KINDS)
  kind?: (typeof DISCREPANCY_KINDS)[number];

  @IsOptional()
  @Transform(blankToUndefined)
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(0)
  @Max(MAX_OFFSET)
  offset?: number;
}
