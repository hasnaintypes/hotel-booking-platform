/**
 * Only the guest and the stay are sent. Price, currency and cancellation terms are computed by the
 * server from a frozen offer, so money fields are deliberately absent and would be stripped by the
 * API's validation whitelist anyway.
 */
export type BookingFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  adultCount: number;
  childCount: number;
  checkIn: string;
  checkOut: string;
  hotelId: string;
  specialRequests?: string;
};
