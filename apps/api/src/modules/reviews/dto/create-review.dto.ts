import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, Max, Min, MinLength, ValidateNested } from "class-validator";

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

export class CreateReviewDto {
  @IsNotEmpty()
  @IsString()
  hotelId: string;

  @IsNotEmpty()
  @IsString()
  bookingId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MinLength(3)
  comment: string;

  @ValidateNested()
  @Type(() => ReviewCategoriesDto)
  categories: ReviewCategoriesDto;
}
