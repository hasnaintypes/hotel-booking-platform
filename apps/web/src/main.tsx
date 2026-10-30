import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import "@/styles/index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppContextProvider } from "@/shared/context/AppContext";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { queryClient } from "@/shared/api/query-client";
import { SearchContextProvider } from "@/features/hotels/context/SearchContext";
import { installScrollLockGapFix } from "@/shared/lib/scroll-lock-fix";

// Neutralize RemoveScroll + scrollbar-gutter double gap (Select/Dialog)
installScrollLockGapFix();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppContextProvider>
        <AuthProvider>
          <SearchContextProvider>
            <App />
          </SearchContextProvider>
        </AuthProvider>
      </AppContextProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
