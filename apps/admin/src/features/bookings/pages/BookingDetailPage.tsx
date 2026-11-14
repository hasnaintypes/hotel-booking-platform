import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  bookingStatusLabel,
  type BookingEventType,
  type BookingPaymentType,
} from "@hotel-booking/types";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@hotel-booking/ui";
import { adminKeys } from "@/shared/lib/query-keys";
import { fetchBookingDetail } from "../api";
import BookingActions from "../components/BookingActions";
import CancelBookingButton from "../components/CancelBookingButton";
import { bookingStatusClass, paymentStatusClass } from "../lib/booking-status";

const formatDateTime = (value?: Date | string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const formatDate = (value?: Date | string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

const formatMoney = (amountMinor: number, currencyCode: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currencyCode || "GBP" }).format(
    amountMinor / 100,
  );

const stripeLinkOf = (payment: BookingPaymentType): string | null => {
  if (payment.provider !== "stripe" || !payment.providerReference) return null;
  return payment.kind === "refund"
    ? `https://dashboard.stripe.com/refunds/${payment.providerReference}`
    : `https://dashboard.stripe.com/payments/${payment.providerReference}`;
};

const EventRow = ({ event }: { event: BookingEventType }) => {
  const isNote = event.metadata?.kind === "note";
  return (
    <li className="border-l-2 border-slate-200 pl-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {isNote ? (
          <span className="font-medium text-purple-700">Review note</span>
        ) : (
          <span className="font-medium text-slate-800">
            {event.fromStatus ? bookingStatusLabel(event.fromStatus) : "Created"} →{" "}
            {bookingStatusLabel(event.toStatus)}
          </span>
        )}
        <span className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</span>
      </div>
      {event.reason && <p className="mt-1 text-sm text-slate-700">{event.reason}</p>}
      <p className="mt-1 text-xs text-slate-500">
        {event.actorUserId ? `Actor ${event.actorUserId}` : "System"}
        {event.requestId ? ` · request ${event.requestId}` : ""}
        {typeof event.metadata?.permission === "string" ? ` · ${event.metadata.permission}` : ""}
      </p>
    </li>
  );
};

const BookingDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const detailQuery = useQuery({
    queryKey: [...adminKeys.bookings, id],
    queryFn: () => fetchBookingDetail(id!),
    enabled: Boolean(id),
  });

  if (detailQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Could not load this booking.</p>
        <Link to="/bookings" className="text-sm text-primary-700 hover:underline">
          Back to bookings
        </Link>
      </div>
    );
  }

  const booking = detailQuery.data;
  const guest = `${booking.firstName} ${booking.lastName}`.trim() || "Guest";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/bookings" className="text-sm text-primary-700 hover:underline">
            ← Bookings
          </Link>
          <h1 className="mt-1 text-lg font-medium text-gray-700 md:text-2xl">{guest}</h1>
          <p className="font-mono text-xs text-slate-500">{booking.publicReference}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={bookingStatusClass(booking.status)}>
            {bookingStatusLabel(booking.status)}
          </Badge>
          <Badge className={paymentStatusClass(booking.paymentStatus)}>
            {booking.paymentStatus ?? "pending"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stay and customer</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <p>
              <span className="text-slate-500">Check-in</span>
              <br />
              {formatDate(booking.checkIn)}
            </p>
            <p>
              <span className="text-slate-500">Check-out</span>
              <br />
              {formatDate(booking.checkOut)}
            </p>
            <p>
              <span className="text-slate-500">Guests</span>
              <br />
              {booking.adultCount} adult{booking.adultCount === 1 ? "" : "s"}, {booking.childCount}{" "}
              child{booking.childCount === 1 ? "" : "ren"}
            </p>
            <p>
              <span className="text-slate-500">Total</span>
              <br />
              {formatMoney(
                Math.round((booking.totalCost ?? 0) * 100),
                booking.payments[0]?.currencyCode ?? "GBP",
              )}
            </p>
            <p>
              <span className="text-slate-500">Email</span>
              <br />
              {booking.email || "—"}
            </p>
            <p>
              <span className="text-slate-500">Phone</span>
              <br />
              {booking.phone || "—"}
            </p>
            <p>
              <span className="text-slate-500">Hotel</span>
              <br />
              <span className="font-mono text-xs">{booking.hotelId}</span>
            </p>
            <p>
              <span className="text-slate-500">Inventory</span>
              <br />
              {booking.inventorySource ?? "managed"}
              {booking.supplierId ? ` · ${booking.supplierId}` : ""}
              {booking.supplierReference ? ` · ${booking.supplierReference}` : ""}
            </p>
            {booking.specialRequests && (
              <p className="sm:col-span-2">
                <span className="text-slate-500">Special requests</span>
                <br />
                {booking.specialRequests}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manual actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BookingActions booking={booking} />
            <CancelBookingButton booking={booking} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payments ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {booking.payments.length === 0 ? (
            <p className="text-sm text-slate-500">No payment attempts recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Stripe</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.payments.map((payment) => {
                    const link = stripeLinkOf(payment);
                    return (
                      <tr key={payment.id} className="border-t border-slate-100">
                        <td className="py-2 pr-3">
                          {payment.kind === "refund" ? "Refund" : "Charge"}
                        </td>
                        <td className="py-2 pr-3">{payment.provider}</td>
                        <td className="py-2 pr-3">
                          <Badge className={paymentStatusClass(payment.status)}>
                            {payment.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          {formatMoney(payment.amountMinor, payment.currencyCode)}
                        </td>
                        <td className="py-2 pr-3">
                          {link ? (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary-700 hover:underline"
                            >
                              Open
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-xs text-slate-500">
                          {formatDateTime(payment.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {booking.events.length === 0 ? (
            <p className="text-sm text-slate-500">No events recorded.</p>
          ) : (
            <ol className="space-y-4">
              {booking.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BookingDetailPage;
