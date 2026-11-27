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
import { createErrorReporter } from "@/shared/lib/error-reporter";
import { ErrorBoundary } from "@hotel-booking/ui";

const errorReporter = createErrorReporter({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_RELEASE ?? "development",
});

// Sentry is loaded after the first frame so it lands in its own chunk instead of the entry bundle,
// which is already close to the size budget.
requestAnimationFrame(() => {
  void errorReporter.start();
});

// Neutralize RemoveScroll + scrollbar-gutter double gap (Select/Dialog)
installScrollLockGapFix();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary onError={errorReporter.report}>
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
