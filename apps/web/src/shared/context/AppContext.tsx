import React, { useState } from "react";
import LoadingSpinner from "@/shared/components/feedback/LoadingSpinner";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { toast as sonnerToast } from "sonner";
import type { ToastPayload } from "@/shared/lib/toast-messages";

const STRIPE_PUB_KEY = import.meta.env.VITE_STRIPE_PUB_KEY || "";

type ToastMessage = ToastPayload;

export type AppContext = {
  showToast: (toastMessage: ToastMessage) => void;
  stripePromise: Promise<Stripe | null>;
  showGlobalLoading: (message?: string) => void;
  hideGlobalLoading: () => void;
  isGlobalLoading: boolean;
  globalLoadingMessage: string;
};

export const AppContext = React.createContext<AppContext | undefined>(
  undefined
);

const stripePromise = loadStripe(STRIPE_PUB_KEY);

export const AppContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [globalLoadingMessage, setGlobalLoadingMessage] = useState(
    "Hotel room is getting ready..."
  );
  /** Central toast API — Sonner; all CRUD/auth mutations use this */
  const showToast = (toastMessage: ToastMessage) => {
    const opts = {
      description: toastMessage.description,
    };
    if (toastMessage.type === "SUCCESS") {
      sonnerToast.success(toastMessage.title, opts);
    } else if (toastMessage.type === "ERROR") {
      sonnerToast.error(toastMessage.title, opts);
    } else {
      sonnerToast.message(toastMessage.title, opts);
    }
  };

  const showGlobalLoading = (message?: string) => {
    if (message) {
      setGlobalLoadingMessage(message);
    }
    setIsGlobalLoading(true);
  };

  const hideGlobalLoading = () => {
    setIsGlobalLoading(false);
  };

  return (
    <AppContext.Provider
      value={{
        showToast,
        stripePromise,
        showGlobalLoading,
        hideGlobalLoading,
        isGlobalLoading,
        globalLoadingMessage,
      }}
    >
      {isGlobalLoading && <LoadingSpinner message={globalLoadingMessage} />}
      {children}
    </AppContext.Provider>
  );
};
