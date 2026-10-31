import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@hotel-booking/ui";
import AdminGuard from "@/features/auth/components/AdminGuard";
import AdminLayout from "@/shared/components/AdminLayout";

const SignInPage = lazy(() => import("@/features/auth/pages/SignInPage"));
const DashboardPage = lazy(() => import("@/features/dashboard/pages/DashboardPage"));
const HotelsPage = lazy(() => import("@/features/hotels/pages/HotelsPage"));
const UsersPage = lazy(() => import("@/features/users/pages/UsersPage"));
const ReviewsPage = lazy(() => import("@/features/reviews/pages/ReviewsPage"));
const BookingsPage = lazy(() => import("@/features/bookings/pages/BookingsPage"));
const ActivityPage = lazy(() => import("@/features/activity/pages/ActivityPage"));

const App = () => (
  <BrowserRouter>
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-10 w-48 animate-pulse rounded-xl bg-slate-200" />
        </div>
      }
    >
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route
          element={
            <AdminGuard>
              <AdminLayout />
            </AdminGuard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="/hotels" element={<HotelsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    <Toaster />
  </BrowserRouter>
);

export default App;
