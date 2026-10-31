import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import type { ReviewType } from "@hotel-booking/types";
import { Badge, DataTable } from "@hotel-booking/ui";
import { getHotelUrl } from "@/shared/lib/app-urls";
import { adminKeys } from "@/shared/lib/query-keys";
import { fetchReviews } from "../api";

const ReviewsPage = () => {
  const reviewsQuery = useQuery({
    queryKey: adminKeys.reviews,
    queryFn: fetchReviews,
  });

  const columns = useMemo<LegacyColumnDef<ReviewType, unknown>[]>(
    () => [
      {
        accessorKey: "rating",
        header: "Rating",
        cell: ({ row }) => <Badge variant="outline">{row.original.rating}★</Badge>,
      },
      {
        id: "verified",
        accessorFn: (review) => (review.isVerified ? "Verified" : ""),
        header: "Verified",
        cell: ({ row }) =>
          row.original.isVerified ? (
            <Badge className="bg-green-100 text-green-800">Verified</Badge>
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "comment",
        header: "Comment",
        cell: ({ row }) => (
          <p className="line-clamp-3 max-w-md whitespace-pre-line text-sm text-gray-700">
            {row.original.comment}
          </p>
        ),
      },
      {
        id: "hotel",
        accessorKey: "hotelId",
        header: "Hotel",
        cell: ({ row }) => (
          <a
            href={getHotelUrl(row.original.hotelId)}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            Hotel {row.original.hotelId.slice(-6)}
          </a>
        ),
      },
      {
        id: "date",
        accessorFn: (review) =>
          review.createdAt ? new Date(review.createdAt).toLocaleDateString() : "",
        header: "Date",
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium text-gray-700 md:text-2xl">Reviews</h1>
        <p className="text-sm text-gray-500">Guest feedback across hotels</p>
      </div>

      {reviewsQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : reviewsQuery.isError ? (
        <p className="text-sm text-red-600">Could not load reviews.</p>
      ) : (
        <DataTable
          columns={columns}
          data={reviewsQuery.data || []}
          searchPlaceholder="Search reviews…"
        />
      )}
    </div>
  );
};

export default ReviewsPage;
