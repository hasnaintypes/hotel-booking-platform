import { Transform, type TransformFnParams } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

const SHORTEST_RESOLUTION = 3;
const LONGEST_RESOLUTION = 1_000;

const trimmed = (params: TransformFnParams) =>
  typeof params.value === "string" ? params.value.trim() : params.value;

/**
 * Assignment and closure in one patch. `assignedToUserId: null` clears the owner; closing a
 * finding needs a resolution, and a closed finding cannot be reopened.
 */
export class UpdateDiscrepancyDto {
  @IsOptional()
  @IsIn(["resolved", "ignored"] as const)
  status?: "resolved" | "ignored";

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(SHORTEST_RESOLUTION)
  @MaxLength(LONGEST_RESOLUTION)
  resolution?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string | null;
}
