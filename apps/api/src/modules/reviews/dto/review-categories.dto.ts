import { IsInt, Max, Min } from "class-validator";

export class ReviewCategoriesDto {
  @IsInt()
  @Min(1)
  @Max(5)
  cleanliness: number;

  @IsInt()
  @Min(1)
  @Max(5)
  service: number;

  @IsInt()
  @Min(1)
  @Max(5)
  location: number;

  @IsInt()
  @Min(1)
  @Max(5)
  value: number;

  @IsInt()
  @Min(1)
  @Max(5)
  amenities: number;
}
