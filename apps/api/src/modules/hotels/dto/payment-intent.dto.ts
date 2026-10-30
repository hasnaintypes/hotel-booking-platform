import { IsString } from "class-validator";

export class PaymentIntentDto {
  @IsString()
  numberOfNights: string;
}
