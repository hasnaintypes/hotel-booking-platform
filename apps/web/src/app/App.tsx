import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import Layout from "@/shared/components/layout/Layout";
import AuthLayout from "@/shared/components/layout/AuthLayout";
import ScrollToTop from "@/shared/components/layout/ScrollToTop";
import { Toaster } from "@hotel-booking/ui";
import useAuth from "@/features/auth/hooks/useAuth";

const Register = lazy(() => import("@/features/auth/pages/RegisterPage"));
const SignIn = lazy(() => import("@/features/auth/pages/SignInPage"));
const AddHotel = lazy(() => import("@/features/hotel-management/pages/AddHotelPage"));
const MyHotels = lazy(() => import("@/features/hotel-management/pages/MyHotelsPage"));
const EditHotel = lazy(() => import("@/features/hotel-management/pages/EditHotelPage"));
const Search = lazy(() => import("@/features/hotels/pages/SearchPage"));
const Detail = lazy(() => import("@/features/hotels/pages/HotelDetailPage"));
const Booking = lazy(() => import("@/features/bookings/pages/BookingPage"));
const MyBookings = lazy(() => import("@/features/bookings/pages/MyBookingsPage"));
const Home = lazy(() => import("@/features/hotels/pages/HomePage"));
const ApiDocs = lazy(() => import("@/features/status/pages/ApiDocsPage"));
const ApiStatus = lazy(() => import("@/features/status/pages/ApiStatusPage"));
const AuthCallback = lazy(() => import("@/features/auth/pages/AuthCallbackPage"));

const App = () => {
  const { isLoggedIn } = useAuth();
  return (
    <Router>
      <ScrollToTop />
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-10 w-48 animate-pulse rounded-xl bg-slate-200" />
          </div>
        }
      >
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
      </Suspense>
      <Toaster />
    </Router>
  );
};

export default App;
