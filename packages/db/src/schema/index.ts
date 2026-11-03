import { bookings } from "./bookings.js";
import { credentials } from "./credentials.js";
import { facilities, hotelFacilities } from "./facilities.js";
import { hotelImages } from "./hotel-images.js";
import { hotelHotelTypes, hotelTypes } from "./hotel-types.js";
import { hotels } from "./hotels.js";
import { memberships } from "./memberships.js";
import { oauthAccounts } from "./oauth-accounts.js";
import { organisationRoles, organisations, rolePermissions } from "./organisations.js";
import { reviews } from "./reviews.js";
import { users } from "./users.js";

export { users };
export type { NewUser, User } from "./users.js";

export { credentials };
export type { Credential, NewCredential } from "./credentials.js";

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

export { reviews };
export type { NewReview, Review } from "./reviews.js";

export { bookingStatus, hotelSource, hotelStatus, userRole, userStatus } from "./enums.js";
export type { BookingStatus, HotelSource, HotelStatus, UserRole, UserStatus } from "./enums.js";

export const schema = {
  users,
  credentials,
  oauthAccounts,
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
  reviews,
};
