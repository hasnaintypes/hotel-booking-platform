import { analyticsSnapshots } from "./analytics-snapshots.js";
import { bookingEvents } from "./booking-events.js";
import { bookings } from "./bookings.js";
import { credentials } from "./credentials.js";
import { currencies } from "./currencies.js";
import { exchangeRates } from "./exchange-rates.js";
import { fxRateSnapshots } from "./fx-rate-snapshots.js";
import { facilities, hotelFacilities } from "./facilities.js";
import { hotelImages } from "./hotel-images.js";
import { hotelHotelTypes, hotelTypes } from "./hotel-types.js";
import { hotels } from "./hotels.js";
import { idempotencyKeys } from "./idempotency-keys.js";
import { inboxEvents } from "./inbox-events.js";
import { ledgerEntries } from "./ledger-entries.js";
import { memberships } from "./memberships.js";
import { oauthAccounts } from "./oauth-accounts.js";
import { organisationRoles, organisations, rolePermissions } from "./organisations.js";
import { outboxEvents } from "./outbox-events.js";
import { payments } from "./payments.js";
import { reviews } from "./reviews.js";
import { users } from "./users.js";

export { users };
export type { NewUser, User } from "./users.js";

export { credentials };
export type { Credential, NewCredential } from "./credentials.js";

export { currencies };
export type { Currency, NewCurrency } from "./currencies.js";

export { exchangeRates };
export type { ExchangeRate, NewExchangeRate } from "./exchange-rates.js";

export { fxRateSnapshots };
export type { FxRateSnapshot, NewFxRateSnapshot } from "./fx-rate-snapshots.js";

export { oauthAccounts };
export type { NewOAuthAccount, OAuthAccount } from "./oauth-accounts.js";

export { hotels };
export type { Hotel, NewHotel } from "./hotels.js";

export { organisationRoles, organisations, rolePermissions };
export type {
  NewOrganisation,
  NewOrganisationRole,
  NewRolePermission,
  Organisation,
  OrganisationRole,
  RolePermission,
} from "./organisations.js";

export { organisationStatus } from "./organisations.js";

export { memberships };
export type { Membership, NewMembership } from "./memberships.js";

export { hotelImages };
export type { HotelImage, NewHotelImage } from "./hotel-images.js";

export { facilities, hotelFacilities };
export type { Facility, HotelFacility, NewFacility, NewHotelFacility } from "./facilities.js";

export { hotelHotelTypes, hotelTypes };
export type {
  HotelHotelType,
  HotelTypeRow,
  NewHotelHotelType,
  NewHotelTypeRow,
} from "./hotel-types.js";

export { bookings };
export type { Booking, NewBooking } from "./bookings.js";

export { payments };
export type { NewPayment, Payment } from "./payments.js";

export { ledgerEntries };
export type { LedgerEntry, NewLedgerEntry } from "./ledger-entries.js";

export { bookingEvents };
export type { BookingEvent, NewBookingEvent } from "./booking-events.js";

export { analyticsSnapshots };
export type {
  AnalyticsDestinationTotal,
  AnalyticsHotelTypeTotal,
  AnalyticsPaymentBreakdown,
  AnalyticsSnapshot,
  AnalyticsStatusBreakdown,
  NewAnalyticsSnapshot,
} from "./analytics-snapshots.js";

export { reviews };
export type { NewReview, Review } from "./reviews.js";

export { outboxEvents };
export type { NewOutboxEvent, OutboxEvent } from "./outbox-events.js";

export { inboxEvents };
export type { InboxEvent, NewInboxEvent } from "./inbox-events.js";

export { idempotencyKeys };
export type { IdempotencyKey, NewIdempotencyKey } from "./idempotency-keys.js";

export {
  bookingStatus,
  hotelSource,
  hotelStatus,
  inventorySource,
  ledgerEntryType,
  paymentStatus,
  userRole,
  userStatus,
} from "./enums.js";
export type {
  BookingStatus,
  HotelSource,
  HotelStatus,
  InventorySource,
  LedgerEntryType,
  PaymentStatus,
  UserRole,
  UserStatus,
} from "./enums.js";

export const schema = {
  users,
  credentials,
  oauthAccounts,
  currencies,
  exchangeRates,
  fxRateSnapshots,
  hotels,
  hotelImages,
  organisations,
  organisationRoles,
  rolePermissions,
  memberships,
  facilities,
  hotelFacilities,
  hotelTypes,
  hotelHotelTypes,
  bookings,
  payments,
  ledgerEntries,
  bookingEvents,
  analyticsSnapshots,
  reviews,
  outboxEvents,
  inboxEvents,
  idempotencyKeys,
};
