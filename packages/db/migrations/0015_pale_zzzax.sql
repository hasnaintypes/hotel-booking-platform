DROP INDEX "analytics_snapshots_date_idx";--> statement-breakpoint
DROP INDEX "bookings_owner_created_at_idx";--> statement-breakpoint
DROP INDEX "bookings_created_at_idx";--> statement-breakpoint
DROP INDEX "bookings_status_created_at_idx";--> statement-breakpoint
DROP INDEX "hotels_price_idx";--> statement-breakpoint
DROP INDEX "hotels_star_rating_idx";--> statement-breakpoint
DROP INDEX "hotels_owner_idx";--> statement-breakpoint
DROP INDEX "hotels_status_idx";--> statement-breakpoint
DROP INDEX "reconciliation_discrepancies_status_detected_at_idx";--> statement-breakpoint
DROP INDEX "reviews_hotel_created_at_idx";--> statement-breakpoint
DROP INDEX "users_created_at_idx";--> statement-breakpoint
CREATE INDEX "analytics_snapshots_date_id_idx" ON "analytics_snapshots" USING btree ("date","id");--> statement-breakpoint
CREATE INDEX "bookings_owner_created_at_id_idx" ON "bookings" USING btree ("owner_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "bookings_created_at_id_idx" ON "bookings" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "bookings_hotel_created_at_id_idx" ON "bookings" USING btree ("hotel_id","created_at","id");--> statement-breakpoint
CREATE INDEX "bookings_status_created_at_id_idx" ON "bookings" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "hotels_price_id_idx" ON "hotels" USING btree ("price_per_night_minor","id");--> statement-breakpoint
CREATE INDEX "hotels_star_rating_id_idx" ON "hotels" USING btree ("star_rating","id");--> statement-breakpoint
CREATE INDEX "hotels_updated_at_id_idx" ON "hotels" USING btree ("updated_at","id");--> statement-breakpoint
CREATE INDEX "hotels_status_updated_at_id_idx" ON "hotels" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "hotels_owner_updated_at_id_idx" ON "hotels" USING btree ("owner_user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "reconciliation_discrepancies_detected_at_id_idx" ON "reconciliation_discrepancies" USING btree ("detected_at","id");--> statement-breakpoint
CREATE INDEX "reconciliation_discrepancies_status_detected_at_id_idx" ON "reconciliation_discrepancies" USING btree ("status","detected_at","id");--> statement-breakpoint
CREATE INDEX "reviews_created_at_id_idx" ON "reviews" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "reviews_hotel_created_at_id_idx" ON "reviews" USING btree ("hotel_id","created_at","id");--> statement-breakpoint
CREATE INDEX "users_created_at_id_idx" ON "users" USING btree ("created_at","id");