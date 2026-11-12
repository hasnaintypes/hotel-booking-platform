import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@hotel-booking/ui";
import { Card, CardContent } from "@hotel-booking/ui";
import BookingStatusCard from "@/features/bookings/components/BookingStatusCard";
import { useBookingStatus } from "@/features/bookings/hooks/useBookingStatus";
import { clearCheckoutDraft, isTerminalBookingStatus } from "@/features/bookings/lib/checkout";
import { resetCheckoutSession } from "@/features/bookings/api";

const FAILED_STATUSES = ["failed", "expired", "cancelled"];

/**
 * Where Stripe sends the guest after a 3-D Secure redirect. It polls the booking by its reference
 * (carried in the return URL) so the outcome is never guessed from the redirect itself.
 */
const BookingReturnPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reference = params.get("reference") ?? params.get("booking") ?? undefined;
  const { data: booking, isError } = useBookingStatus(reference);

  useEffect(() => {
    if (!booking || !isTerminalBookingStatus(booking.status)) return;
    clearCheckoutDraft();
    if (booking.status && FAILED_STATUSES.includes(booking.status)) {
      resetCheckoutSession({
        hotelId: booking.hotelId,
        checkIn: new Date(booking.checkIn).toISOString(),
        checkOut: new Date(booking.checkOut).toISOString(),
        adultCount: booking.adultCount,
        childCount: booking.childCount,
      });
    }
  }, [booking]);

  if (!reference) {
    return (
      <Card className="max-w-xl mx-auto">
        <CardContent className="space-y-4 p-6 text-center">
          <p className="text-gray-700">This payment return link is missing a booking reference.</p>
          <Link to="/my-bookings">
            <Button>Go to My Bookings</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="text-center">
        <h1 className="text-xl font-medium text-gray-700">Checking your booking</h1>
        <p className="mt-1 text-sm text-gray-600">
          You may have completed an extra verification step. Don't close this page yet.
        </p>
      </div>

      {booking ? (
        <BookingStatusCard
          booking={booking}
          reference={reference}
          isError={isError}
          onStartNew={() => {
            resetCheckoutSession({
              hotelId: booking.hotelId,
              checkIn: new Date(booking.checkIn).toISOString(),
              checkOut: new Date(booking.checkOut).toISOString(),
              adultCount: booking.adultCount,
              childCount: booking.childCount,
            });
            clearCheckoutDraft();
            navigate(`/hotel/${booking.hotelId}/booking`);
          }}
        />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-gray-700">Fetching your booking...</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BookingReturnPage;
