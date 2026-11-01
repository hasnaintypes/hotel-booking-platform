import { Transform, type TransformFnParams } from "class-transformer";
import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export const SUGGEST_KINDS = ["hotel_description", "insights_copy"] as const;

/** Longest text accepted as the basis for a draft; it is sent to a paid provider. */
export const MAX_SUGGEST_INPUT_CHARS = 2000;

const trim = ({ value }: TransformFnParams) => (typeof value === "string" ? value.trim() : value);

export class SuggestDto {
  @IsIn(SUGGEST_KINDS)
  kind: (typeof SUGGEST_KINDS)[number];

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: "input must not be empty" })
  @MaxLength(MAX_SUGGEST_INPUT_CHARS)
  input: string;
}
