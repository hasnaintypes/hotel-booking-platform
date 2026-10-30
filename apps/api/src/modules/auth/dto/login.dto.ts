import { IsEmail, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Email is required" })
  email: string;

  @MinLength(6, { message: "Password with 6 or more characters required" })
  password: string;
}
