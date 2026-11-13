import { useForm } from "react-hook-form";
import type { BookingCreationType, UserType } from "@hotel-booking/types";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useMutation } from "@tanstack/react-query";
import { apiErrorMessage, getErrorStatus } from "@hotel-booking/api-client";
import * as bookingsApi from "@/features/bookings/api";
import type { BookingFormData } from "@/features/bookings/types";
import { Button } from "@hotel-booking/ui";
import { Input } from "@hotel-booking/ui";
import { Label } from "@hotel-booking/ui";
import { CardContent, CardHeader, CardTitle } from "@hotel-booking/ui";
import {
  User,
  Phone,
  MessageSquare,
  CreditCard,
  Shield,
  CheckCircle,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { stripePromise } from "@/shared/lib/stripe";
import {
  bookingReferenceOf,
  loadCheckoutDraft,
  saveCheckoutDraft,
} from "@/features/bookings/lib/checkout";
import { interpretPaymentResult, UNCERTAIN_MESSAGE } from "@/features/bookings/lib/payment-result";

type Stay = {
  checkIn: Date;
  checkOut: Date;
  adultCount: number;
  childCount: number;
};

type Props = {
  currentUser: UserType;
  hotelId: string;
  stay: Stay;
  /** Called once payment has been submitted (or its outcome is unknown) so the page can poll. */
  onPaymentSubmitted: (reference: string) => void;
};

const returnUrlFor = (hotelId: string, booking: BookingCreationType): string =>
  `${window.location.origin}/hotel/${hotelId}/booking/return?reference=${encodeURIComponent(
    bookingReferenceOf(booking),
  )}`;

const checkoutErrorMessage = (error: unknown): string => {
  if (getErrorStatus(error) === 409) {
    return "This price has expired. Please go back and start the checkout again to get a fresh quote.";
  }
  return apiErrorMessage(
    error,
    "We couldn't create your booking. Please check your details and try again.",
  );
};

type PaymentStepProps = {
  booking: BookingCreationType;
  hotelId: string;
  onPaymentSubmitted: (reference: string) => void;
};

/**
 * The card form lives inside the Elements provider that was created with the booking's client
 * secret. It is mounted only after the booking exists, so a guest can never pay against a
 * PaymentIntent that does not belong to a durable booking record.
 */
const PaymentStep = ({ booking, hotelId, onPaymentSubmitted }: PaymentStepProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  // State updates are async; the ref closes the window between two rapid clicks.
  const confirming = useRef(false);

  const pay = async (event: FormEvent) => {
    event.preventDefault();
    setPaymentError(null);
    if (confirming.current || submitted || !stripe || !elements) return;

    confirming.current = true;
    setIsConfirming(true);

    let outcome;
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrlFor(hotelId, booking) },
        // No redirect for ordinary cards; 3-D Secure sends the guest to the return URL above.
        redirect: "if_required",
      });
      outcome = interpretPaymentResult(result);
    } catch {
      // The request may have reached Stripe. Never invite a retry: poll the booking instead.
      outcome = { kind: "uncertain" as const, message: UNCERTAIN_MESSAGE };
    }

    setIsConfirming(false);

    if (outcome.kind === "failed") {
      confirming.current = false;
      setPaymentError(outcome.message);
      return;
    }

    // Succeeded, processing or unknown: lock the form and let the page poll the booking.
    setSubmitted(true);
    onPaymentSubmitted(bookingReferenceOf(booking));
  };

  const locked = submitted || isConfirming;

  return (
    <form onSubmit={pay} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-600" />
          Price Summary
        </h3>

        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-700 font-medium">Total Cost</span>
            <span className="text-lg md:text-2xl font-medium text-blue-600">
              £{booking.totalCost.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <CheckCircle className="h-3 w-3 text-green-500" />
            Calculated by the server for this stay
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Payment Details
        </h3>
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
          <PaymentElement options={{ layout: "tabs" }} />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Shield className="h-3 w-3 text-green-500" />
          Your payment information is secure and encrypted
        </div>
      </div>

      {paymentError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <p>{paymentError}</p>
        </div>
      )}

      {submitted && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-blue-600" />
          <p>Please don't pay again. We're confirming your booking.</p>
        </div>
      )}

      <div className="pt-4">
        <Button
          disabled={locked || !stripe || !elements}
          type="submit"
          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3 px-6 rounded-xl shadow-xl transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConfirming ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Confirming payment...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Pay & confirm booking
            </div>
          )}
        </Button>
      </div>
    </form>
  );
};

const BookingForm = ({ currentUser, hotelId, stay, onPaymentSubmitted }: Props) => {
  const draft = loadCheckoutDraft();
  const [phone, setPhone] = useState<string>(draft.phone);
  const [specialRequests, setSpecialRequests] = useState<string>(draft.specialRequests);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingCreationType | null>(null);

  const { mutateAsync: createBooking, isPending: isCreating } = useMutation({
    mutationFn: bookingsApi.createBooking,
  });

  const {
    handleSubmit,
    register,
    formState: { isSubmitting },
  } = useForm<BookingFormData>({
    defaultValues: {
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      email: currentUser.email,
      adultCount: stay.adultCount,
      childCount: stay.childCount,
      checkIn: stay.checkIn.toISOString(),
      checkOut: stay.checkOut.toISOString(),
      hotelId,
    },
    mode: "onChange",
    shouldUnregister: false,
  });

  const updatePhone = (value: string) => {
    setPhone(value);
    saveCheckoutDraft({ phone: value, specialRequests });
  };

  const updateSpecialRequests = (value: string) => {
    setSpecialRequests(value);
    saveCheckoutDraft({ phone, specialRequests: value });
  };

  const handleCopyCredentials = async () => {
    const credentials = `Card: 4242 4242 4242 4242
MM/YY: 12/35 CVC: 123`;

    try {
      await navigator.clipboard.writeText(credentials);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy credentials:", err);
    }
  };

  const onSubmit = async (formData: BookingFormData) => {
    if (booking) return;
    setPaymentError(null);
    saveCheckoutDraft({ phone, specialRequests });

    try {
      const created = await createBooking({
        ...formData,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(specialRequests.trim() ? { specialRequests: specialRequests.trim() } : {}),
      });
      if (!created.clientSecret) {
        setPaymentError(
          "Your booking was saved, but the payment form could not be opened. Check My Bookings before trying again.",
        );
        return;
      }
      setBooking(created);
    } catch (error) {
      setPaymentError(checkoutErrorMessage(error));
    }
  };

  const isBusy = isSubmitting || isCreating;

  return (
    <div className="p-6">
      <CardHeader className="pb-6">
        <CardTitle className="flex items-center gap-2 text-lg md:text-2xl font-medium text-gray-700">
          <User className="h-6 w-6 text-blue-600" />
          Confirm Your Details
        </CardTitle>
        <p className="text-gray-600 mt-2">Please review and complete your booking information</p>
      </CardHeader>

      <CardContent className="space-y-6">
        {!booking && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2">
                <User className="h-5 w-5 text-blue-600" />
                Personal Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">First Name</Label>
                  <Input
                    type="text"
                    readOnly
                    disabled
                    className="bg-gray-50 text-gray-600"
                    {...register("firstName")}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Last Name</Label>
                  <Input
                    type="text"
                    readOnly
                    disabled
                    className="bg-gray-50 text-gray-600"
                    {...register("lastName")}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Email</Label>
                  <Input
                    type="email"
                    readOnly
                    disabled
                    className="bg-gray-50 text-gray-600"
                    {...register("email")}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone (Optional)
                  </Label>
                  <Input
                    type="tel"
                    placeholder="Enter your phone number"
                    className="focus:ring-2 focus:ring-blue-500"
                    value={phone}
                    onChange={(event) => updatePhone(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                Special Requests (Optional)
              </h3>

              <div className="space-y-2">
                <textarea
                  rows={4}
                  placeholder="Any special requests, preferences, or additional information..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  value={specialRequests}
                  onChange={(event) => updateSpecialRequests(event.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Let us know if you have any special requirements or preferences for your stay.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="flex items-center gap-2 font-medium">
                <Shield className="h-4 w-4" />
                Price confirmed before payment
              </p>
              <p className="mt-1 text-blue-700">
                We freeze the price and cancellation terms on the server. You will see the exact
                total on the payment step, and your card is only charged after you confirm.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-yellow-800 mb-2">
                      For Testing Purpose
                    </h4>
                    <p className="text-sm text-yellow-700 mb-3">
                      You can use these dummy credentials to complete checkout and see the booking
                      status page, analytical page, or other pages to see the interactive results:
                    </p>
                    <div className="bg-white border border-yellow-300 rounded-xl p-3 relative">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-mono text-gray-700">
                          <div>Card: 4242 4242 4242 4242</div>
                          <div>MM/YY: 12/35 CVC: 123 ZIP: 12345</div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyCredentials}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded transition-colors duration-200"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3 text-green-600" />
                              <span className="text-green-600">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {paymentError && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
                <p>{paymentError}</p>
              </div>
            )}

            <div className="pt-4">
              <Button
                disabled={isBusy}
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3 px-6 rounded-xl shadow-xl transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBusy ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Preparing payment...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Continue to payment
                  </div>
                )}
              </Button>
            </div>
          </form>
        )}

        {booking && booking.clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: booking.clientSecret }}
            key={booking.clientSecret}
          >
            <PaymentStep
              booking={booking}
              hotelId={hotelId}
              onPaymentSubmitted={onPaymentSubmitted}
            />
          </Elements>
        )}

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-green-500" />
              Secure Payment
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              Instant Confirmation
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3 text-green-500" />
              24/7 Support
            </div>
          </div>
        </div>
      </CardContent>
    </div>
  );
};

export default BookingForm;
