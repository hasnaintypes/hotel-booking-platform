import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@hotel-booking/api-client";
import { ErrorBoundary } from "@hotel-booking/ui";
import App from "@/app/App";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { createErrorReporter } from "@/shared/lib/error-reporter";
import "@/styles/index.css";

const errorReporter = createErrorReporter({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_RELEASE ?? "development",
});

// Sentry is loaded after the first frame so it lands in its own chunk instead of the entry bundle.
requestAnimationFrame(() => {
  void errorReporter.start();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary onError={errorReporter.report}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
