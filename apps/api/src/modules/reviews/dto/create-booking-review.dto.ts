import { Type } from "class-transformer";
import { IsInt, IsMongoId, IsString, Max, Min, MinLength, ValidateNested } from "class-validator";
import { ReviewCategoriesDto } from "./create-review.dto";

export class CreateBookingReviewDto {
  @IsMongoId()
  hotelId: string;

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
