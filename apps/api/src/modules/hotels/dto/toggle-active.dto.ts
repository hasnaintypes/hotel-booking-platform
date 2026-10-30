import { IsBoolean } from "class-validator";

export class ToggleActiveDto {
  @IsBoolean({ message: "isActive boolean required" })
  isActive: boolean;
}
