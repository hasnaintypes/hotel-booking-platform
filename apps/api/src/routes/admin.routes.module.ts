import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../modules/analytics/analytics.module";
import { AdminRollupsController } from "../modules/analytics/admin-rollups.controller";
import { BookingsModule } from "../modules/bookings/bookings.module";
import { AdminBookingsController } from "../modules/bookings/admin-bookings.controller";
import { BusinessInsightsModule } from "../modules/business-insights/business-insights.module";
import { AdminReportsController } from "../modules/business-insights/admin-reports.controller";
import { HealthServiceModule } from "../modules/health/health-service.module";
import { JobsModule } from "../modules/jobs/jobs.module";
import { AdminSystemController } from "../modules/health/admin-system.controller";
import { HotelsModule } from "../modules/hotels/hotels.module";
import { AdminHotelsController } from "../modules/hotels/admin-hotels.controller";
import { ReviewsModule } from "../modules/reviews/reviews.module";
import { AdminReviewsController } from "../modules/reviews/admin-reviews.controller";
import { UsersModule } from "../modules/users/users.module";
import { AdminUsersController } from "../modules/users/admin-users.controller";

/** `/api/v1/admin` — platform administration. */
@Module({
  imports: [
    UsersModule,
    HotelsModule,
    BookingsModule,
    ReviewsModule,
    BusinessInsightsModule,
    AnalyticsModule,
    HealthServiceModule,
    JobsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminHotelsController,
    AdminBookingsController,
    AdminReviewsController,
    AdminReportsController,
    AdminRollupsController,
    AdminSystemController,
  ],
})
export class AdminRoutesModule {}
