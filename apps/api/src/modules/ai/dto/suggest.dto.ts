import { IsIn, IsString } from "class-validator";

export const SUGGEST_KINDS = ["hotel_description", "insights_copy"] as const;

export class SuggestDto {
  @IsIn(SUGGEST_KINDS)
  kind: (typeof SUGGEST_KINDS)[number];

  @IsString()
  input: string;
}
