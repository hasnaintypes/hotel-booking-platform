import { useQuery } from "@tanstack/react-query";
import { adminKeys } from "@/shared/lib/query-keys";
import { fetchBookings } from "@/features/bookings/api";
import { fetchReviews } from "@/features/reviews/api";

type ActivityItem = {
  id: string;
  at: number;
  kind: "booking" | "review";
  title: string;
  detail: string;
};

const ActivityPage = () => {
  const bookingsQuery = useQuery({
    queryKey: adminKeys.bookings,
    queryFn: fetchBookings,
  });
  const reviewsQuery = useQuery({
    queryKey: adminKeys.reviews,
    queryFn: fetchReviews,
  });

  const items: ActivityItem[] = [];

  bookingsQuery.data?.forEach((booking) => {
    items.push({
      id: `b-${booking._id}`,
      at: new Date(booking.createdAt || booking.checkIn).getTime(),
      kind: "booking",
      title: `Booking ${booking.status || "pending"} — ${booking.firstName} ${booking.lastName}`,
      detail: `£${booking.totalCost} · check-in ${new Date(booking.checkIn).toLocaleDateString()}`,
    });
  });

  reviewsQuery.data?.forEach((review) => {
    items.push({
      id: `r-${review._id}`,
      at: new Date(review.createdAt || Date.now()).getTime(),
      kind: "review",
      title: `Review ${review.rating}★`,
      detail: review.comment.slice(0, 120),
    });
  });

  items.sort((a, b) => b.at - a.at);

  const isLoading = bookingsQuery.isLoading || reviewsQuery.isLoading;
  const isError = bookingsQuery.isError || reviewsQuery.isError;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium text-slate-900 md:text-2xl">Activity</h1>
        <p className="text-sm text-slate-500">
          Recent bookings and reviews (no separate audit log)
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600">Could not load activity.</p>
      ) : !items.length ? (
        <p className="text-sm text-slate-500">No recent activity.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {items.slice(0, 50).map((item) => (
            <li key={item.id} className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                <span className="font-medium uppercase text-slate-500">{item.kind}</span>
                <span>{new Date(item.at).toLocaleString()}</span>
              </div>
              <p className="font-medium text-slate-900">{item.title}</p>
              <p className="text-sm text-slate-600">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ActivityPage;
