import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import type { BookingType } from "@hotel-booking/types";
import { Badge, DataTable } from "@hotel-booking/ui";
import { adminKeys } from "@/shared/lib/query-keys";
import { fetchBookings } from "../api";
import CancelBookingButton from "../components/CancelBookingButton";

const statusClass = (status?: string) => {
  switch (status) {
    case "confirmed":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    case "completed":
      return "bg-blue-100 text-blue-800";
    case "refunded":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
};

const BookingsPage = () => {
  const bookingsQuery = useQuery({
    queryKey: adminKeys.bookings,
    queryFn: fetchBookings,
  });

  const columns = useMemo<LegacyColumnDef<BookingType, unknown>[]>(
    () => [
      {
        id: "guest",
        accessorFn: (booking) => `${booking.firstName} ${booking.lastName}`,
        header: "Guest",
        cell: ({ row }) => (
          <span className="font-medium text-gray-700">
            {row.original.firstName} {row.original.lastName}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge className={statusClass(row.original.status)}>
            {row.original.status || "pending"}
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
        id: "actions",
        header: "Actions",
        cell: ({ row }) => <CancelBookingButton booking={row.original} />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium text-gray-700 md:text-2xl">Bookings</h1>
        <p className="text-sm text-gray-500">
          All reservations — cancel upcoming stays with Stripe refund when paid
        </p>
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
          searchPlaceholder="Search bookings…"
        />
      )}
    </div>
  );
};

export default BookingsPage;
