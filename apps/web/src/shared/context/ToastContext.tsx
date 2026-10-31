import React, { createContext, useCallback, useContext, useMemo } from "react";
import { toast as sonnerToast } from "sonner";
import type { ToastPayload } from "@/shared/lib/toast-messages";

type ToastContextValue = {
  showToast: (toastMessage: ToastPayload) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const showToast = useCallback((toastMessage: ToastPayload) => {
    const opts = { description: toastMessage.description };

    if (toastMessage.type === "SUCCESS") {
      sonnerToast.success(toastMessage.title, opts);
    } else if (toastMessage.type === "ERROR") {
      sonnerToast.error(toastMessage.title, opts);
    } else {
      sonnerToast.message(toastMessage.title, opts);
    }
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
