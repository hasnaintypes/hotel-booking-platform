import type { BookingStatus, BookingType } from "@hotel-booking/types";
import { Badge } from "@hotel-booking/ui";
import { Button } from "@hotel-booking/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@hotel-booking/ui";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

type Props = {
  booking?: BookingType;
  /** Used before the first status response arrives so the guest still sees a reference. */
  reference?: string;
  /** True when the polling request itself failed; the outcome remains unknown. */
  isError?: boolean;
  onStartNew?: () => void;
};

type StatusView = {
  tone: "pending" | "success" | "danger" | "review";
  title: string;
  message: string;
  badge: string;
};

const viewFor = (status: BookingStatus | undefined, isError: boolean): StatusView => {
  switch (status) {
    case "confirmed":
      return {
        tone: "success",
        title: "Booking confirmed",
        message: "Your payment went through and your reservation is confirmed.",
        badge: "Confirmed",
      };
    case "needs_review":
      return {
        tone: "review",
        title: "Payment needs review",
        message:
          "We received your payment but couldn't confirm the booking automatically. Please don't pay again; our team is reviewing it.",
        badge: "Needs review",
      };
    case "failed":
      return {
        tone: "danger",
        title: "Booking not completed",
        message:
          "The booking could not be completed and no charge was taken. You can start the checkout again.",
        badge: "Failed",
      };
    case "expired":
      return {
        tone: "danger",
        title: "Payment window expired",
        message:
          "The booking was released before payment completed and no charge was taken. Start again to get a fresh price.",
        badge: "Expired",
      };
    case "cancelled":
      return {
        tone: "danger",
        title: "Booking cancelled",
        message: "This booking was cancelled. Any refund follows the cancellation policy.",
        badge: "Cancelled",
      };
    default:
      return {
        tone: "pending",
        title: isError ? "Still checking your booking" : "Confirming your booking",
        message: isError
          ? "We couldn't reach the booking service. Please don't pay again — we'll keep checking while this page is open."
          : "Your payment was submitted. This usually takes a few seconds; please don't pay again.",
        badge: "Confirming",
      };
  }
};

const toneClasses: Record<StatusView["tone"], string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  review: "border-amber-300 bg-amber-50 text-amber-900",
  pending: "border-blue-200 bg-blue-50 text-blue-800",
};

const StatusIcon = ({ tone }: { tone: StatusView["tone"] }) => {
  if (tone === "success") return <CheckCircle2 className="h-8 w-8 text-green-600" />;
  if (tone === "danger") return <XCircle className="h-8 w-8 text-red-600" />;
  if (tone === "review") return <AlertTriangle className="h-8 w-8 text-amber-600" />;
  return <Loader2 className="h-8 w-8 animate-spin text-blue-600" />;
};

/** Guest-facing checkout outcome. Every terminal state says whether paying again is safe. */
const BookingStatusCard = ({ booking, reference, isError = false, onStartNew }: Props) => {
  const status = booking?.status;
  const view = viewFor(status, isError);
  const shownReference = booking?.publicReference ?? reference;

  return (
    <Card className="shadow-xl border-0 bg-white">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-4">
          <StatusIcon tone={view.tone} />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg md:text-2xl font-medium text-gray-700">
                {view.title}
              </CardTitle>
              <Badge variant="outline">{view.badge}</Badge>
            </div>
            <p className="text-sm text-gray-600">{view.message}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className={`rounded-xl border p-4 text-sm ${toneClasses[view.tone]}`}>
          {view.tone === "pending" ? (
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Checking again automatically…
            </p>
          ) : (
            <p>This page stops checking once the booking reaches this state.</p>
          )}
        </div>

        {booking && (
          <dl className="grid gap-2 text-sm text-gray-700">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Booking reference</dt>
              <dd className="select-all font-mono">{booking.publicReference || booking._id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Total</dt>
              <dd className="font-medium">£{booking.totalCost.toFixed(2)}</dd>
            </div>
          </dl>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Link to="/my-bookings">
            <Button variant="outline">View My Bookings</Button>
          </Link>
          {onStartNew && (view.tone === "danger" || view.tone === "review") && (
            <Button onClick={onStartNew}>Start a new booking</Button>
          )}
        </div>

        {shownReference && !booking && (
          <p className="text-xs text-gray-500">
            Reference: <span className="select-all font-mono">{shownReference}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default BookingStatusCard;
