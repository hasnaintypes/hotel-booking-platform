import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { authSession } from "@hotel-booking/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "./AuthCallbackPage";

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  fetchCurrentUser: vi.fn(),
  clearAuthStorage: vi.fn(),
}));

vi.mock("@/shared/context/ToastContext", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("@/features/auth/api", () => ({
  fetchCurrentUser: mocks.fetchCurrentUser,
  clearAuthStorage: mocks.clearAuthStorage,
}));

const grace = {
  _id: "user-1",
  email: "grace@example.test",
  firstName: "Grace",
  lastName: "Hopper",
  image: "https://img.test/grace.png",
};

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<div>home page</div>} />
          <Route path="/sign-in" element={<div>sign in page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    mocks.showToast.mockReset();
    mocks.fetchCurrentUser.mockReset();
    mocks.clearAuthStorage.mockReset();
    authSession.clear();
  });

  it("signs in, reads the profile from the API and goes home", async () => {
    mocks.fetchCurrentUser.mockResolvedValue(grace);
    renderAt("/auth/callback?authenticated=1");

    expect(await screen.findByText("home page")).toBeInTheDocument();

    expect(authSession.get()).toBe(true);
    expect(localStorage.getItem("user_id")).toBe("user-1");
    expect(localStorage.getItem("user_email")).toBe("grace@example.test");
    expect(localStorage.getItem("user_name")).toBe("Grace Hopper");
    expect(localStorage.getItem("user_image")).toBe("https://img.test/grace.png");
    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SUCCESS", title: expect.stringContaining("Grace Hopper") }),
    );
  });

  it("ignores any personal data in the URL and uses only what the API says", async () => {
    mocks.fetchCurrentUser.mockResolvedValue(grace);
    renderAt(
      "/auth/callback?authenticated=1&userId=666&email=evil@example.test&firstName=Evil&image=https://evil.test/x.png",
    );

    await screen.findByText("home page");

    expect(localStorage.getItem("user_id")).toBe("user-1");
    expect(localStorage.getItem("user_email")).toBe("grace@example.test");
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/evil/i);
  });

  it("does not sign anyone in from the old URL format that carried the profile", async () => {
    renderAt("/auth/callback?userId=666&email=evil@example.test");

    expect(await screen.findByText("sign in page")).toBeInTheDocument();
    expect(mocks.fetchCurrentUser).not.toHaveBeenCalled();
    expect(authSession.get()).toBe(false);
    expect(localStorage.getItem("user_email")).toBeNull();
  });

  it("returns to sign-in and clears local state when the session does not work", async () => {
    mocks.fetchCurrentUser.mockRejectedValue(new Error("401"));
    renderAt("/auth/callback?authenticated=1");

    expect(await screen.findByText("sign in page")).toBeInTheDocument();
    expect(mocks.clearAuthStorage).toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ type: "ERROR" }));
  });

  it.each([
    ["account_exists", /already exists/],
    ["email_unverified", /isn't verified/],
    ["oauth_state", /could not be verified/],
    ["something_else", /Something went wrong/],
  ])("explains the error %s and goes to sign-in", async (code, message) => {
    renderAt(`/auth/callback?error=${code}`);

    expect(await screen.findByText("sign in page")).toBeInTheDocument();
    expect(mocks.fetchCurrentUser).not.toHaveBeenCalled();
    expect(mocks.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ERROR", description: expect.stringMatching(message) }),
    );
  });

  it("goes to sign-in when it was reached with nothing to complete", async () => {
    renderAt("/auth/callback");

    await waitFor(() => expect(screen.getByText("sign in page")).toBeInTheDocument());
    expect(mocks.fetchCurrentUser).not.toHaveBeenCalled();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
