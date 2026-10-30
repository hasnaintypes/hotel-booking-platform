import { IsOptional } from "class-validator";

export class SearchHotelsDto {
  @IsOptional()
  destination?: string;

  @IsOptional()
  adultCount?: string;

  @IsOptional()
  childCount?: string;

  @IsOptional()
  facilities?: string | string[];

  @IsOptional()
  types?: string | string[];

  @IsOptional()
  stars?: string | string[];

  @IsOptional()
  maxPrice?: string;

  @IsOptional()
  sortOption?: string;

  @IsOptional()
  page?: string;
}
