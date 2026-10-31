import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import type { HotelType } from "@hotel-booking/types";
import { Badge, Button, DataTable } from "@hotel-booking/ui";
import { toast } from "sonner";
import { getErrorMessage } from "@/shared/lib/api-error";
import { getHotelUrl } from "@/shared/lib/app-urls";
import { adminKeys } from "@/shared/lib/query-keys";
import { invalidateAdminCatalogs } from "@/shared/lib/query-invalidation";
import { fetchHotels, updateHotelActive } from "../api";

const HotelsPage = () => {
  const queryClient = useQueryClient();
  const hotelsQuery = useQuery({
    queryKey: adminKeys.hotels,
    queryFn: fetchHotels,
  });

  const mutation = useMutation({
    mutationFn: ({ hotelId, isActive }: { hotelId: string; isActive: boolean }) =>
      updateHotelActive(hotelId, isActive),
    onSuccess: async () => {
      await invalidateAdminCatalogs(queryClient);
      toast.success("Hotel status updated");
    },
    onError: (error) => {
      toast.error("Failed to update hotel", {
        description: getErrorMessage(error, "Please try again in a moment."),
      });
    },
  });

  const columns = useMemo<LegacyColumnDef<HotelType, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium text-gray-700">{row.original.name}</span>,
      },
      {
        id: "location",
        accessorFn: (hotel) => `${hotel.city}, ${hotel.country}`,
        header: "Location",
      },
      {
        accessorKey: "pricePerNight",
        header: "Price",
        cell: ({ row }) => `£${row.original.pricePerNight}/night`,
      },
      {
        accessorKey: "totalBookings",
        header: "Bookings",
        cell: ({ row }) => <Badge variant="outline">{row.original.totalBookings ?? 0}</Badge>,
      },
      {
        id: "active",
        accessorFn: (hotel) => (hotel.isActive === false ? "inactive" : "active"),
        header: "Active",
        cell: ({ row }) => {
          const hotel = row.original;
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  hotelId: hotel._id,
                  isActive: !hotel.isActive,
                })
              }
            >
              {hotel.isActive === false ? "Inactive — activate" : "Active — deactivate"}
            </Button>
          );
        },
      },
      {
        id: "view",
        header: "",
        cell: ({ row }) => (
          <a
            href={getHotelUrl(row.original._id)}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View
          </a>
        ),
      },
    ],
    [mutation],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium text-gray-700 md:text-2xl">Hotels</h1>
        <p className="text-sm text-gray-500">All properties in the catalog</p>
      </div>

      {hotelsQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : hotelsQuery.isError ? (
        <p className="text-sm text-red-600">Could not load hotels.</p>
      ) : (
        <DataTable
          columns={columns}
          data={hotelsQuery.data || []}
          searchPlaceholder="Search hotels…"
        />
      )}
    </div>
  );
};

export default HotelsPage;
