import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import "@/styles/index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/shared/context/ToastContext";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { queryClient } from "@hotel-booking/api-client";
import { SearchContextProvider } from "@/features/hotels/context/SearchContext";
import { installScrollLockGapFix } from "@/shared/lib/scroll-lock-fix";
import { ErrorBoundary } from "@hotel-booking/ui";

// Neutralize RemoveScroll + scrollbar-gutter double gap (Select/Dialog)
installScrollLockGapFix();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <SearchContextProvider>
              <App />
            </SearchContextProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
