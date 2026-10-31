import { Button } from "@hotel-booking/ui";
import UsernameMenu from "@/features/auth/components/UsernameMenu";
import { Link } from "react-router-dom";
import useAuth from "@/features/auth/hooks/useAuth";
import { getHotelsSearchUrl } from "@/shared/lib/nav-utils";
import { prefetchBusinessInsightsQueries } from "@/features/analytics/lib/prefetch";
import { queryClient } from "@hotel-booking/api-client";
import * as bookingsApi from "@/features/bookings/api";
import * as hotelManagementApi from "@/features/hotel-management/api";
import { bookingKeys, hotelKeys } from "@/shared/lib/query-keys";
import {
  prefetchAnalyticsRoute,
  prefetchMyBookingsRoute,
  prefetchMyHotelsRoute,
  prefetchSearchRoute,
} from "@/shared/lib/route-prefetch";

const NAV_AUTH_WIDTH = "min-w-[120px]";

const navLinkClass =
  "flex items-center text-sm font-normal text-white/90 hover:text-white px-4 py-2 rounded-xl hover:bg-white/10 transition-all duration-200";

const MainNav = () => {
  const { isLoggedIn } = useAuth();

  // Prefetch route chunks and owner lists on hover so chrome + data arrive faster
  const prefetchMyBookings = () => {
    prefetchMyBookingsRoute();
    if (!isLoggedIn) return;
    void queryClient.prefetchQuery({
      queryKey: bookingKeys.mine(),
      queryFn: bookingsApi.fetchMyBookings,
    });
  };

  const prefetchMyHotels = () => {
    prefetchMyHotelsRoute();
    if (!isLoggedIn) return;
    void queryClient.prefetchQuery({
      queryKey: hotelKeys.mine(),
      queryFn: hotelManagementApi.fetchMyHotels,
    });
  };

  const prefetchInsights = () => {
    prefetchAnalyticsRoute();
    prefetchBusinessInsightsQueries(queryClient);
  };

  return (
    <nav className="flex items-center gap-1 lg:gap-2">
      <Link
        to={getHotelsSearchUrl()}
        className={navLinkClass}
        onMouseEnter={prefetchSearchRoute}
        onFocus={prefetchSearchRoute}
      >
        Hotels
      </Link>
      <Link
        to="/my-bookings"
        className={navLinkClass}
        onMouseEnter={prefetchMyBookings}
        onFocus={prefetchMyBookings}
      >
        My Bookings
      </Link>
      <Link
        to="/business-insights"
        className={navLinkClass}
        onMouseEnter={prefetchInsights}
        onFocus={prefetchInsights}
      >
        Business Insights
      </Link>
      <Link
        to="/my-hotels"
        className={navLinkClass}
        onMouseEnter={prefetchMyHotels}
        onFocus={prefetchMyHotels}
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
