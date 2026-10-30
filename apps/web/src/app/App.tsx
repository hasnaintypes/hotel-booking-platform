import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import Layout from "@/shared/components/layout/Layout";
import AuthLayout from "@/shared/components/layout/AuthLayout";
import ScrollToTop from "@/shared/components/layout/ScrollToTop";
import { Toaster } from "@/shared/components/ui/sonner";
import Register from "@/features/auth/pages/RegisterPage";
import SignIn from "@/features/auth/pages/SignInPage";
import AddHotel from "@/features/hotel-management/pages/AddHotelPage";
import useAuth from "@/features/auth/hooks/useAuth";
import MyHotels from "@/features/hotel-management/pages/MyHotelsPage";
import EditHotel from "@/features/hotel-management/pages/EditHotelPage";
import Search from "@/features/hotels/pages/SearchPage";
import Detail from "@/features/hotels/pages/HotelDetailPage";
import Booking from "@/features/bookings/pages/BookingPage";
import MyBookings from "@/features/bookings/pages/MyBookingsPage";
import Home from "@/features/hotels/pages/HomePage";
import ApiDocs from "@/features/status/pages/ApiDocsPage";
import ApiStatus from "@/features/status/pages/ApiStatusPage";
import AnalyticsDashboard from "@/features/analytics/pages/AnalyticsDashboardPage";
import AuthCallback from "@/features/auth/pages/AuthCallbackPage";
import AdminRoute from "@/features/admin/components/AdminRoute";
import AdminLayout from "@/features/admin/components/AdminLayout";
import AdminDashboard from "@/features/admin/pages/AdminDashboardPage";
import AdminHotels from "@/features/admin/pages/AdminHotelsPage";
import AdminUsers from "@/features/admin/pages/AdminUsersPage";
import AdminReviews from "@/features/admin/pages/AdminReviewsPage";
import AdminBookings from "@/features/admin/pages/AdminBookingsPage";
import AdminActivity from "@/features/admin/pages/AdminActivityPage";

const App = () => {
  const { isLoggedIn } = useAuth();
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route
          path="/"
          element={
            <Layout>
              <Home />
            </Layout>
          }
        />
        <Route
          path="/search"
          element={
            <Layout>
              <Search />
            </Layout>
          }
        />
        <Route
          path="/detail/:hotelId"
          element={
            <Layout>
              <Detail />
            </Layout>
          }
        />
        <Route
          path="/api-docs"
          element={
            <Layout>
              <ApiDocs />
            </Layout>
          }
        />
        <Route
          path="/api-status"
          element={
            <Layout>
              <ApiStatus />
            </Layout>
          }
        />
        <Route
          path="/business-insights"
          element={
            <Layout>
              <AnalyticsDashboard />
            </Layout>
          }
        />
        <Route
          path="/register"
          element={
            <AuthLayout>
              <Register />
            </AuthLayout>
          }
        />
        <Route
          path="/sign-in"
          element={
            <AuthLayout>
              <SignIn />
            </AuthLayout>
          }
        />
        <Route
          path="/auth/callback"
          element={
            <Layout>
              <AuthCallback />
            </Layout>
          }
        />

        <Route
          path="/my-hotels"
          element={
            <Layout>
              <MyHotels />
            </Layout>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <Layout>
              <MyBookings />
            </Layout>
          }
        />

        {/* Hotel-domain admin shell — role gate via /users/me */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="hotels" element={<AdminHotels />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="bookings" element={<AdminBookings />} />
          <Route path="activity" element={<AdminActivity />} />
        </Route>

        {isLoggedIn && (
          <>
            <Route
              path="/hotel/:hotelId/booking"
              element={
                <Layout>
                  <Booking />
                </Layout>
              }
            />
            <Route
              path="/add-hotel"
              element={
                <Layout>
                  <AddHotel />
                </Layout>
              }
            />
            <Route
              path="/edit-hotel/:hotelId"
              element={
                <Layout>
                  <EditHotel />
                </Layout>
              }
            />
          </>
        )}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <Toaster />
    </Router>
  );
};

export default App;
