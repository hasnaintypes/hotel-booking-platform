import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isBookingCancellable, type BookingType } from "@hotel-booking/types";
import { Button } from "@hotel-booking/ui";
import { apiErrorMessage } from "@hotel-booking/api-client";
import { toast } from "sonner";
import { invalidateAdminBookings } from "@/shared/lib/query-invalidation";
import { cancelBooking } from "../api";

const CancelBookingButton = ({ booking }: { booking: BookingType }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => cancelBooking(booking._id, reason.trim() || undefined),
    onSuccess: async (data) => {
      await invalidateAdminBookings(queryClient);
      const refundNote = data.refundAmount > 0 ? ` Refunded £${data.refundAmount.toFixed(2)}.` : "";
      const skipNote = data.refundSkipped ? ` ${data.refundSkipped}` : "";
      toast.success("Booking cancelled", {
        description: `${refundNote}${skipNote}`.trim() || "Status updated.",
      });
      setOpen(false);
      setReason("");
    },
    onError: (error) => {
      toast.error("Cancel failed", {
        description: apiErrorMessage(error, "Could not cancel booking"),
      });
    },
  });

  if (!isBookingCancellable(booking)) return null;

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        Cancel booking
      </Button>
    );
  }

  return (
    <div className="mt-3 min-w-64 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-800">
        Cancel this upcoming stay? Paid bookings receive a full Stripe refund when a payment intent
        is on file.
      </p>
      <label className="block text-sm font-medium text-gray-700">
        Reason (optional)
        <input
          className="mt-1 block w-full rounded-xl border border-gray-300 p-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Change of plans"
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Cancelling…" : "Confirm cancel"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            setOpen(false);
            setReason("");
          }}
        >
          Keep booking
        </Button>
      </div>
    </div>
  );
};

export default CancelBookingButton;
