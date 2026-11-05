export { createDb, DEFAULT_DATABASE_TIMEOUTS } from "./client.js";
export { EXPECTED_MIGRATION_COUNT } from "./migrations.js";
export type { CreateDatabaseOptions, Database, DatabaseHandle } from "./client.js";
export {
  bookingEvents,
  bookings,
  bookingStatus,
  credentials,
  currencies,
  exchangeRates,
  facilities,
  fxRateSnapshots,
  hotelFacilities,
  hotelHotelTypes,
  hotelImages,
  hotelSource,
  hotels,
  hotelStatus,
  hotelTypes,
  inventorySource,
  ledgerEntries,
  ledgerEntryType,
  memberships,
  oauthAccounts,
  organisationRoles,
  organisations,
  organisationStatus,
  paymentStatus,
  payments,
  reviews,
  rolePermissions,
  schema,
  users,
  userRole,
  userStatus,
} from "./schema/index.js";
export type {
  Booking,
  BookingEvent,
  Credential,
  Currency,
  ExchangeRate,
  Facility,
  FxRateSnapshot,
  Hotel,
  HotelFacility,
  HotelHotelType,
  HotelImage,
  HotelTypeRow,
  InventorySource,
  LedgerEntry,
  LedgerEntryType,
  Membership,
  NewBooking,
  NewBookingEvent,
  NewCredential,
  NewCurrency,
  NewExchangeRate,
  NewFacility,
  NewFxRateSnapshot,
  NewHotel,
  NewHotelFacility,
  NewHotelHotelType,
  NewHotelImage,
  NewHotelTypeRow,
  NewLedgerEntry,
  NewMembership,
  NewOAuthAccount,
  NewOrganisation,
  NewOrganisationRole,
  NewPayment,
  NewReview,
  NewRolePermission,
  NewUser,
  OAuthAccount,
  Organisation,
  OrganisationRole,
  Payment,
  PaymentStatus,
  Review,
  RolePermission,
  User,
} from "./schema/index.js";
export { findPostgresError, isRetryableTransactionError, POSTGRES_ERROR_CODES } from "./errors.js";
export type { PostgresError, PostgresErrorCode } from "./errors.js";
export { applyLocalDatabaseTimeouts, withDatabaseTimeouts } from "./timeouts.js";
export {
  assertSeedPassword,
  assertSeedTarget,
  deleteSeedFixtures,
  MIN_SEED_PASSWORD_LENGTH,
  SEED_FIXTURE_IDS,
  SEED_TIMESTAMP,
  seedDatabase,
} from "./seed/index.js";
export type { SeedOptions, SeedSummary, SeedTarget, SeedTargetOptions } from "./seed/index.js";

export type { DatabaseTimeoutOverrides } from "./timeouts.js";
export { withTransaction } from "./transaction.js";
export type {
  Transaction,
  TransactionIsolationLevel,
  TransactionOptions,
  TransactionRetry,
} from "./transaction.js";
export {
  canWithPermissions,
  createAuthorizer,
  DIRECT_BOOKING_OWNER_PERMISSIONS,
  DIRECT_HOTEL_OWNER_PERMISSIONS,
  isPermission,
  ORGANISATION_ROLE_PERMISSIONS,
  PERMISSIONS,
} from "./authz.js";
export type {
  Actor,
  AuthorizationDatabase,
  Authorizer,
  OrganisationPermissionLookup,
  Permission,
  Resource,
} from "./authz.js";
export {
  DEFAULT_EXCHANGE_RATE_MAX_AGE_MS,
  lookupExchangeRate,
  selectApplicableRate,
} from "./fx.js";
export type {
  ExchangeRateDatabase,
  ExchangeRateLookup,
  ExchangeRateResult,
  RateCandidate,
} from "./fx.js";
