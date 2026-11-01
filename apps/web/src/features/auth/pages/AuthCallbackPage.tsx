import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/context/ToastContext";
import { welcomeBackToast } from "@/shared/lib/toast-messages";
import { authSession } from "@hotel-booking/api-client";
import * as authApi from "@/features/auth/api";
import { oauthErrorMessage } from "@/features/auth/lib/oauth-errors";
import { authKeys } from "@/shared/lib/query-keys";
import { Loader2 } from "lucide-react";

/**
 * Google sign-in return. The API has already set the session cookie and sends only
 * `?authenticated=1` (or `?error=<reason>`); nothing about the person is in the URL. The profile is
 * read from the API instead.
 */
const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      showToast({
        title: "Sign-in failed",
        description: oauthErrorMessage(error),
        type: "ERROR",
      });
      navigate("/sign-in", { replace: true });
      return;
    }

    if (!searchParams.get("authenticated")) {
      navigate("/sign-in", { replace: true });
      return;
    }

    let cancelled = false;
    authSession.set();

    authApi
      .fetchCurrentUser()
      .then((user) => {
        if (cancelled) return;
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
        localStorage.setItem("user_id", user._id);
        localStorage.setItem("user_email", user.email);
        if (name) localStorage.setItem("user_name", name);
        if (user.image) localStorage.setItem("user_image", user.image);

        void queryClient.invalidateQueries({ queryKey: authKeys.currentUser() });
        showToast(welcomeBackToast(name));
        navigate("/", { replace: true });
      })
      .catch(() => {
        if (cancelled) return;
        authApi.clearAuthStorage();
        showToast({
          title: "Sign-in failed",
          description: oauthErrorMessage(undefined),
          type: "ERROR",
        });
        navigate("/sign-in", { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, queryClient, showToast]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary-600" />
        <p className="text-sm text-gray-600">Completing sign-in…</p>
      </div>
    </div>
  );
};

export default AuthCallback;
