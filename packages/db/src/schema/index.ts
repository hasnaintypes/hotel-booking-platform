import { bookings } from "./bookings.js";
import { credentials } from "./credentials.js";
import { facilities, hotelFacilities } from "./facilities.js";
import { hotelImages } from "./hotel-images.js";
import { hotelHotelTypes, hotelTypes } from "./hotel-types.js";
import { hotels } from "./hotels.js";
import { oauthAccounts } from "./oauth-accounts.js";
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

export const schema = {
  users,
  credentials,
  oauthAccounts,
  hotels,
  hotelImages,
  facilities,
  hotelFacilities,
  hotelTypes,
  hotelHotelTypes,
  bookings,
  reviews,
};
