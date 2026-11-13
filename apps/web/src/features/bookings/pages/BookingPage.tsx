import { useQuery } from "@tanstack/react-query";
import * as hotelsApi from "@/features/hotels/api";
import BookingForm from "@/features/bookings/components/BookingForm";
import BookingStatusCard from "@/features/bookings/components/BookingStatusCard";
import useSearchContext from "@/features/hotels/hooks/useSearchContext";
import { useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import BookingDetailsSummary from "@/features/bookings/components/BookingDetailsSummary";
import { hotelKeys } from "@/shared/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle } from "@hotel-booking/ui";
import { Badge } from "@hotel-booking/ui";
import { Loader2, CreditCard, Calendar, Users } from "lucide-react";
import useAuth from "@/features/auth/hooks/useAuth";
import { useBookingStatus } from "@/features/bookings/hooks/useBookingStatus";
import { clearCheckoutDraft } from "@/features/bookings/lib/checkout";
import { resetCheckoutSession } from "@/features/bookings/api";

const Booking = () => {
  const { user: currentUser, isLoading: isLoadingUser } = useAuth();
  const search = useSearchContext();
  const { hotelId } = useParams();

  // Set once the guest has submitted payment. The page then polls the booking instead of
  // keeping the payment form mounted, so a settling payment cannot be submitted twice.
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);

  const numberOfNights = useMemo(
    () =>
      Math.max(
        0,
        Math.ceil(
          Math.abs(search.checkOut.getTime() - search.checkIn.getTime()) / (1000 * 60 * 60 * 24),
        ),
      ),
    [search.checkIn, search.checkOut],
  );

  const { data: hotel, isLoading: isLoadingHotel } = useQuery({
    queryKey: hotelKeys.detail(hotelId || ""),
    queryFn: () => hotelsApi.fetchHotelById(hotelId as string),
    enabled: !!hotelId,
    // Checkout must not create a second booking because the window regained focus.
    refetchOnWindowFocus: false,
  });

  const { data: submittedBooking, isError: isStatusError } = useBookingStatus(
    submittedReference ?? undefined,
  );

  const startNewCheckout = () => {
    if (hotelId) {
      resetCheckoutSession({
        hotelId,
        checkIn: search.checkIn.toISOString(),
        checkOut: search.checkOut.toISOString(),
        adultCount: search.adultCount,
        childCount: search.childCount,
      });
    }
    clearCheckoutDraft();
    setSubmittedReference(null);
  };

  if (isLoadingHotel || isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="text-lg font-medium text-gray-700">Loading booking details...</span>
        </div>
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-sm md:text-lg font-medium text-gray-700 mb-2">Hotel Not Found</h2>
          <p className="text-gray-600">The hotel you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="pb-6">
        <div className="flex items-center gap-3 mb-2">
          <CreditCard className="h-6 w-6 text-blue-600" />
          <h1 className="text-sm md:text-lg font-medium text-gray-700">Complete Your Booking</h1>
        </div>
        <p className="text-gray-600">
          Please review your details and complete the payment to confirm your reservation.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_2fr] gap-8">
        <div className="space-y-6">
          <Card className="shadow-xl border-0 bg-white">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-medium">
                <Calendar className="h-5 w-5 text-blue-600" />
                Booking Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BookingDetailsSummary
                checkIn={search.checkIn}
                checkOut={search.checkOut}
                adultCount={search.adultCount}
                childCount={search.childCount}
                numberOfNights={numberOfNights}
                hotel={hotel}
              />
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 bg-white">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-medium">
                <Users className="h-5 w-5 text-blue-600" />
                Hotel Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">{hotel.name}</h3>
                <p className="text-gray-600 text-sm mb-3">
                  {hotel.city}, {hotel.country}
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="text-xs">
                    {hotel.starRating} Stars
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    £{hotel.pricePerNight}/night
                  </Badge>
                </div>
                {hotel.type && hotel.type.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {hotel.type.map((type, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {submittedReference ? (
            <BookingStatusCard
              booking={submittedBooking}
              reference={submittedReference}
              isError={isStatusError}
              onStartNew={startNewCheckout}
            />
          ) : currentUser ? (
            <Card className="shadow-xl border-0 bg-white">
              <CardContent className="p-0">
                <BookingForm
                  currentUser={currentUser}
                  hotelId={hotelId as string}
                  stay={{
                    checkIn: search.checkIn,
                    checkOut: search.checkOut,
                    adultCount: search.adultCount,
                    childCount: search.childCount,
                  }}
                  onPaymentSubmitted={setSubmittedReference}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-xl border-0 bg-white">
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-gray-700">Loading payment form...</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Booking;
