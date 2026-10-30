import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as authApi from "@/features/auth/api";
import useAuth from "@/features/auth/hooks/useAuth";

type Props = {
  children: React.ReactNode;
};

/** Gate: must be logged in and role === admin (from GET /api/users/me) */
const AdminRoute = ({ children }: Props) => {
  const { isLoggedIn } = useAuth();

  const { data: user, isLoading } = useQuery({
    queryKey: ["fetchCurrentUser"],
    queryFn: authApi.fetchCurrentUser,
    enabled: isLoggedIn,
  });

  if (!isLoggedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-10 w-48 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
