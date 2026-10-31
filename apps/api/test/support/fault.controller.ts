import { Body, Controller, Get, HttpException, Post } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { IsEmail, IsInt, Min } from "class-validator";

export class EchoDto {
  @IsEmail()
  email!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

const tagged = (message: string, extra: Record<string, unknown>) =>
  Object.assign(new Error(message), extra);

/** Test-only controller that raises each class of error the global filter must handle. */
@Controller("__test__")
export class FaultController {
  @Get("boom")
  boom() {
    throw new Error("connection failed: mongodb://admin:hunter2@internal-db:27017");
  }

  @Get("stripe-card")
  stripeCard() {
    throw tagged("Your card was declined.", { type: "StripeCardError" });
  }

  @Get("stripe-down")
  stripeDown() {
    throw tagged("socket hang up to api.stripe.com", { type: "StripeConnectionError" });
  }

  @Get("mongo-duplicate")
  mongoDuplicate() {
    throw tagged("E11000 duplicate key error collection: users index: email_1", {
      name: "MongoServerError",
      code: 11000,
    });
  }

  @Get("cast-error")
  castError() {
    throw tagged('Cast to ObjectId failed for value "x" (type string)', { name: "CastError" });
  }

  @Get("throttled")
  throttled() {
    throw new ThrottlerException();
  }

  @Get("teapot")
  teapot() {
    throw new HttpException("I am a teapot", 418);
  }

  @Post("echo")
  echo(@Body() dto: EchoDto) {
    return dto;
  }
}
