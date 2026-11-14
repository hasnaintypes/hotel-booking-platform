import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorMessage } from "@hotel-booking/api-client";
import type { BookingType } from "@hotel-booking/types";
import { Button } from "@hotel-booking/ui";
import { toast } from "sonner";
import { invalidateAdminBookings } from "@/shared/lib/query-invalidation";
import { markBookingReviewed, retryBooking } from "../api";

type Action = "retry" | "review";

const MIN_REASON_LENGTH = 3;

/**
 * Manual actions for a booking parked in `needs_review`. The button set mirrors the state machine:
 * only retry and acknowledge are offered, both demand a reason, and neither edits a status by hand.
 */
const BookingActions = ({ booking }: { booking: BookingType }) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: (action: Action) =>
      action === "retry"
        ? retryBooking(booking._id, reason.trim())
        : markBookingReviewed(booking._id, reason.trim()),
    onSuccess: async (_data, action) => {
      await invalidateAdminBookings(queryClient);
      toast.success(action === "retry" ? "Payment retry started" : "Booking marked reviewed");
      setReason("");
    },
    onError: (error) => {
      toast.error("Action failed", {
        description: apiErrorMessage(error, "The manual action could not be applied"),
      });
    },
  });

  if (booking.status !== "needs_review") {
    return <p className="text-sm text-gray-500">No manual actions for this status.</p>;
  }

  const reasonIsValid = reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
      <p className="text-sm text-purple-900">
        This booking is parked for review. Retrying re-reads Stripe and either confirms the stay or
        parks it again with the provider reason.
      </p>
      <label className="block text-sm font-medium text-gray-700">
        Reason (required)
        <textarea
          className="mt-1 block w-full rounded-xl border border-gray-300 p-2"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What did you check?"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!reasonIsValid || mutation.isPending}
          onClick={() => mutation.mutate("retry")}
        >
          {mutation.isPending && mutation.variables === "retry" ? "Retrying…" : "Retry payment"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!reasonIsValid || mutation.isPending}
          onClick={() => mutation.mutate("review")}
        >
          {mutation.isPending && mutation.variables === "review" ? "Saving…" : "Mark reviewed"}
        </Button>
      </div>
    </div>
  );
};

export default BookingActions;
