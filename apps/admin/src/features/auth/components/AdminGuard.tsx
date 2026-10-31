import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@hotel-booking/ui";
import { getErrorStatus } from "@/shared/lib/api-error";
import { getWebUrl } from "@/shared/lib/app-urls";
import { signOut } from "../api";
import useAuth from "../hooks/useAuth";

const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { isLoggedIn, user, isLoading, isError, error, refetch } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (isError) {
    if (getErrorStatus(error) === 401) {
      return <Navigate to="/sign-in" replace />;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-lg font-medium text-slate-900">Could not verify your session</h1>
          <p className="mt-2 text-sm text-slate-500">Check your connection and try again.</p>
          <Button className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (user?.role !== "admin") {
    const handleLeave = async () => {
      await signOut();
      queryClient.clear();
      navigate("/sign-in", { replace: true });
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-lg font-medium text-slate-900">Admin access required</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your account does not have permission to use this console.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={handleLeave}>
              Sign out
            </Button>
            <Button asChild>
              <a href={getWebUrl()}>Back to site</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminGuard;
