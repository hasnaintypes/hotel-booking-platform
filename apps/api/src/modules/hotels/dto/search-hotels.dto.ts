import { Transform, type TransformFnParams } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const SEARCH_SORT_OPTIONS = ["starRating", "pricePerNightAsc", "pricePerNightDesc"] as const;
export const MAX_SEARCH_PAGE = 1000;

// The web client sends filters that are not set as empty strings, so "" means "not provided".
// These transforms read the raw query value: implicit conversion would already have turned ""
// into 0 for a number.
const raw = ({ obj, key }: TransformFnParams): unknown => obj[key];

const blankToUndefined = (params: TransformFnParams) => {
  const value = raw(params);
  return value === "" || value === null ? undefined : value;
};

const toOptionalNumber = (params: TransformFnParams) => {
  const value = blankToUndefined(params);
  return typeof value === "string" ? Number(value) : value;
};

const toList = (params: TransformFnParams): unknown[] | undefined => {
  const value = blankToUndefined(params);
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
};

const toNumberList = (params: TransformFnParams) =>
  toList(params)?.map((item) =>
    typeof item === "string" && item.trim() !== "" ? Number(item) : item,
  );

export class SearchHotelsDto {
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(100)
  destination?: string;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(0)
  @Max(50)
  adultCount?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(0)
  @Max(50)
  childCount?: number;

  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  facilities?: string[];

  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  types?: string[];

  @IsOptional()
  @Transform(toNumberList)
  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  stars?: number[];

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  maxPrice?: number;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsIn(SEARCH_SORT_OPTIONS)
  sortOption?: (typeof SEARCH_SORT_OPTIONS)[number];

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(MAX_SEARCH_PAGE)
  page?: number;
}
