import { createZodDto } from "nestjs-zod";
import { offerSchema } from "@hotel-booking/contracts";

/** `POST /api/v1/offers` — the frozen quote a guest can book. */
export class OfferDto extends createZodDto(offerSchema) {}
