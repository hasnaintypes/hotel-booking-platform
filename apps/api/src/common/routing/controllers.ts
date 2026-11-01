import { AiController } from "../../modules/ai/ai.controller";
import { AnalyticsController } from "../../modules/analytics/analytics.controller";
import { AuthController } from "../../modules/auth/auth.controller";
import { BookingsController } from "../../modules/bookings/bookings.controller";
import { MyBookingsController } from "../../modules/bookings/my-bookings.controller";
import { BusinessInsightsController } from "../../modules/business-insights/business-insights.controller";
import { HealthController } from "../../modules/health/health.controller";
import { HotelsController } from "../../modules/hotels/hotels.controller";
import { MyHotelsController } from "../../modules/my-hotels/my-hotels.controller";
import { ReviewsController } from "../../modules/reviews/reviews.controller";
import { UsersController } from "../../modules/users/users.controller";

/** Every HTTP controller, used by the routing and status guards in tests. */
export const CONTROLLERS = [
  AiController,
  AnalyticsController,
  AuthController,
  BookingsController,
  MyBookingsController,
  BusinessInsightsController,
  HealthController,
  HotelsController,
  MyHotelsController,
  ReviewsController,
  UsersController,
];
