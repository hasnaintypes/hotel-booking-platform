import { Button } from "@/shared/components/ui/button";
import UsernameMenu from "@/features/auth/components/UsernameMenu";
import { Link } from "react-router-dom";
import useAuth from "@/features/auth/hooks/useAuth";
import { getHotelsSearchUrl } from "@/shared/lib/nav-utils";
import { prefetchBusinessInsightsQueries } from "@/features/analytics/lib/prefetch";
import { queryClient } from "@/shared/api/query-client";
import * as bookingsApi from "@/features/bookings/api";
import * as hotelManagementApi from "@/features/hotel-management/api";

const NAV_AUTH_WIDTH = "min-w-[120px]";

const navLinkClass =
  "flex items-center text-sm font-normal text-white/90 hover:text-white px-4 py-2 rounded-xl hover:bg-white/10 transition-all duration-200";

const MainNav = () => {
  const { isLoggedIn } = useAuth();

  // Prefetch owner lists on hover so destination chrome + data arrive faster
  const prefetchMyHotels = () => {
    if (!isLoggedIn) return;
    void queryClient.prefetchQuery({ queryKey: ["fetchMyHotels"], queryFn: hotelManagementApi.fetchMyHotels });
  };
  const prefetchMyBookings = () => {
    if (!isLoggedIn) return;
    void queryClient.prefetchQuery({ queryKey: ["fetchMyBookings"], queryFn: bookingsApi.fetchMyBookings });
  };

  return (
    <nav className="flex items-center gap-1 lg:gap-2">
      <Link to={getHotelsSearchUrl()} className={navLinkClass}>
        Hotels
      </Link>
      <Link
        to="/my-bookings"
        className={navLinkClass}
        onMouseEnter={prefetchMyBookings}
      >
        My Bookings
      </Link>
      <Link
        to="/business-insights"
        className={navLinkClass}
        onMouseEnter={() => prefetchBusinessInsightsQueries(queryClient)}
      >
        Business Insights
      </Link>
      <Link
        to="/my-hotels"
        className={navLinkClass}
        onMouseEnter={prefetchMyHotels}
      >
        My Hotels
      </Link>

      <div className={`flex items-center justify-end ${NAV_AUTH_WIDTH}`}>
        {isLoggedIn ? (
          <UsernameMenu />
        ) : (
          <Link to="/sign-in">
            <Button
              variant="ghost"
              className="text-sm font-normal bg-white text-primary-600 hover:bg-primary-50 hover:text-primary-700 border-2 border-white/80"
            >
              Log In
            </Button>
          </Link>
        )}
      </div>
    </nav>
  );
};

export default MainNav;
