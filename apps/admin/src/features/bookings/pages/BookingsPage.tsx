import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { Link } from "react-router-dom";
import {
  bookingStatusLabel,
  type BookingListFilters,
  type BookingStatus,
  type BookingType,
} from "@hotel-booking/types";
import { Badge, DataTable } from "@hotel-booking/ui";
import { adminKeys } from "@/shared/lib/query-keys";
import { fetchBookings } from "../api";
import CancelBookingButton from "../components/CancelBookingButton";
import { bookingStatusClass } from "../lib/booking-status";

const BOOKING_STATUSES: BookingStatus[] = [
  "pending_payment",
  "authorized",
  "confirming",
  "confirmed",
  "cancelling",
  "cancelled",
  "failed",
  "expired",
  "needs_review",
];

const BookingsPage = () => {
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo<BookingListFilters>(
    () => ({
      ...(status ? { status } : {}),
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
    }),
    [status, debouncedSearch],
  );

  const bookingsQuery = useQuery({
    queryKey: [...adminKeys.bookings, filters],
    queryFn: () => fetchBookings(filters),
  });

  const columns = useMemo<LegacyColumnDef<BookingType, unknown>[]>(
    () => [
      {
        id: "guest",
        accessorFn: (booking) => `${booking.firstName} ${booking.lastName}`,
        header: "Guest",
        cell: ({ row }) => (
          <Link
            to={`/bookings/${row.original._id}`}
            className="font-medium text-primary-700 hover:underline"
          >
            {row.original.firstName} {row.original.lastName}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge className={bookingStatusClass(row.original.status)}>
            {bookingStatusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.paymentStatus || "pending"}</Badge>
        ),
      },
      {
        id: "dates",
        accessorFn: (booking) =>
          `${new Date(booking.checkIn).toLocaleDateString()} → ${new Date(
            booking.checkOut,
          ).toLocaleDateString()}`,
        header: "Dates",
      },
      {
        accessorKey: "totalCost",
        header: "Total",
        cell: ({ row }) => `£${row.original.totalCost?.toLocaleString() ?? 0}`,
      },
      {
        id: "allowedTransitions",
        header: "Allowed next",
        cell: ({ row }) => (
          <span className="text-xs text-slate-600">
            {row.original.allowedTransitions?.length
              ? row.original.allowedTransitions.map(bookingStatusLabel).join(", ")
              : "None"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/bookings/${row.original._id}`}
              className="text-sm font-medium text-primary-700 hover:underline"
            >
              View
            </Link>
            <CancelBookingButton booking={row.original} />
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium text-gray-700 md:text-2xl">Bookings</h1>
        <p className="text-sm text-gray-500">
          All reservations — inspect payment history, retry parked bookings or cancel upcoming stays
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700">
          Status
          <select
            className="mt-1 block rounded-xl border border-gray-300 bg-white p-2"
            value={status}
            onChange={(event) => setStatus(event.target.value as BookingStatus | "")}
          >
            <option value="">All statuses</option>
            {BOOKING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {bookingStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          Search
          <input
            className="mt-1 block rounded-xl border border-gray-300 p-2"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Guest, email or reference"
          />
        </label>
        {status === "needs_review" && (
          <p className="text-sm text-purple-700">
            Bookings parked for review — open one to retry or acknowledge it.
          </p>
        )}
      </div>

      {bookingsQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : bookingsQuery.isError ? (
        <p className="text-sm text-red-600">Could not load bookings.</p>
      ) : (
        <DataTable
          columns={columns}
          data={bookingsQuery.data || []}
          searchPlaceholder="Search loaded bookings…"
        />
      )}
    </div>
  );
};

export default BookingsPage;
