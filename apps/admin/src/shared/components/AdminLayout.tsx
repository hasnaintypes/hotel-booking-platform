import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@hotel-booking/ui";
import {
  Activity,
  ArrowLeft,
  Building2,
  Calendar,
  LayoutDashboard,
  LogOut,
  Menu,
  Star,
  Users,
  X,
} from "lucide-react";
import useAuth from "@/features/auth/hooks/useAuth";
import { signOut } from "@/features/auth/api";
import { getUserDetails } from "@/features/auth/auth-storage";
import { getWebUrl } from "@/shared/lib/app-urls";

const nav = [
  { to: "/", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/hotels", label: "Hotels", icon: Building2 },
  { to: "/users", label: "Users", icon: Users },
  { to: "/reviews", label: "Reviews", icon: Star },
  { to: "/bookings", label: "Bookings", icon: Calendar },
  { to: "/activity", label: "Activity", icon: Activity },
];

const AdminLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const { user } = useAuth();
  const { email, name } = getUserDetails();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      queryClient.clear();
      navigate("/sign-in", { replace: true });
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Admin</p>
        <p className="font-medium text-slate-900">Hotel Booking</p>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {nav.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-primary-50 text-primary-700" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <a
          href={getWebUrl()}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to site
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative z-50 h-full w-64 border-r border-slate-200 bg-white">
            <div className="absolute right-2 top-2">
              <Button type="button" variant="ghost" size="icon" onClick={() => setMenuOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="text-sm">
              <p className="font-medium text-slate-900">{name || user?.firstName || "Admin"}</p>
              <p className="text-xs text-slate-500">{email || user?.email || ""}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {signOutError && (
              <span className="hidden text-xs text-red-600 sm:inline">{signOutError}</span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={signingOut}
              onClick={handleSignOut}
            >
              <LogOut className="mr-1 h-4 w-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto px-4 py-6 xl:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
