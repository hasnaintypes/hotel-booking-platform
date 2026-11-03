import type { Type } from "@nestjs/common";
import { AiController } from "../../modules/ai/ai.controller";
import { AdminRollupsController } from "../../modules/analytics/admin-rollups.controller";
import { AuthController } from "../../modules/auth/auth.controller";
import { AdminBookingsController } from "../../modules/bookings/admin-bookings.controller";
import { BookingsController } from "../../modules/bookings/bookings.controller";
import { ManageBookingsController } from "../../modules/bookings/manage-bookings.controller";
import { AdminReportsController } from "../../modules/business-insights/admin-reports.controller";
import { AdminSystemController } from "../../modules/health/admin-system.controller";
import { AdminHotelsController } from "../../modules/hotels/admin-hotels.controller";
import { HotelsController } from "../../modules/hotels/hotels.controller";
import { MyHotelsController } from "../../modules/my-hotels/my-hotels.controller";
import { PartnerCapabilitiesController } from "../../modules/partner/partner-capabilities.controller";
import { AdminReviewsController } from "../../modules/reviews/admin-reviews.controller";
import { BookingReviewsController } from "../../modules/reviews/booking-reviews.controller";
import { HotelReviewsController } from "../../modules/reviews/hotel-reviews.controller";
import { AdminUsersController } from "../../modules/users/admin-users.controller";
import { MeController } from "../../modules/users/me.controller";
import { RegistrationController } from "../../modules/users/registration.controller";

export type Audience = "public" | "manage" | "admin" | "partner";

export type AudienceGroup = {
  audience: Audience;
  /** Prefix added by RouterModule (empty for the public/customer group). */
  path: string;
  controllers: readonly Type<unknown>[];
};

export const AUDIENCE_GROUPS: readonly AudienceGroup[] = [
  {
    audience: "public",
    path: "",
    controllers: [
      AuthController,
      RegistrationController,
      MeController,
      HotelsController,
      HotelReviewsController,
      BookingReviewsController,
      BookingsController,
    ],
  },
  {
    audience: "manage",
    path: "manage",
    controllers: [MyHotelsController, ManageBookingsController, AiController],
  },
  {
    audience: "admin",
    path: "admin",
    controllers: [
      AdminUsersController,
      AdminHotelsController,
      AdminBookingsController,
      AdminReviewsController,
      AdminReportsController,
      AdminRollupsController,
      AdminSystemController,
    ],
  },
  {
    audience: "partner",
    path: "partner",
    controllers: [PartnerCapabilitiesController],
  },
];

/** Every HTTP controller, used by the routing and status guards in tests. */
export const CONTROLLERS = AUDIENCE_GROUPS.flatMap((group) => group.controllers);
