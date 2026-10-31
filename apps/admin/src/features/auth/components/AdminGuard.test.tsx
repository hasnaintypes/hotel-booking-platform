import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminGuard from "./AdminGuard";

const authState = vi.hoisted(() => ({
  value: {
    isLoggedIn: true,
    user: { role: "admin" },
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
}));

vi.mock("../hooks/useAuth", () => ({
  default: () => authState.value,
}));

vi.mock("../api", () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

const renderGuard = (initialPath = "/") => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/"
            element={
              <AdminGuard>
                <div>Protected admin content</div>
              </AdminGuard>
            }
          />
          <Route path="/sign-in" element={<div>Admin sign in</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("AdminGuard", () => {
  beforeEach(() => {
    authState.value = {
      isLoggedIn: true,
      user: { role: "admin" },
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    };
  });

  it("renders children for an admin session", () => {
    renderGuard();
    expect(screen.getByText("Protected admin content")).toBeInTheDocument();
  });

  it("redirects unauthenticated visitors to sign in", () => {
    authState.value.isLoggedIn = false;
    renderGuard();
    expect(screen.getByText("Admin sign in")).toBeInTheDocument();
  });

  it("redirects expired sessions to sign in", () => {
    authState.value.isLoggedIn = false;
    authState.value.isError = true;
    authState.value.error = { response: { status: 401 } };
    renderGuard();
    expect(screen.getByText("Admin sign in")).toBeInTheDocument();
  });

  it("blocks authenticated non-admin users", () => {
    authState.value.user = { role: "user" };
    renderGuard();
    expect(screen.getByText("Admin access required")).toBeInTheDocument();
    expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument();
  });

  it("offers a retry for non-auth verification failures", () => {
    authState.value.isLoggedIn = false;
    authState.value.isError = true;
    authState.value.error = { response: { status: 503 } };

    renderGuard();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Could not verify your session")).toBeInTheDocument();
    expect(authState.value.refetch).toHaveBeenCalledTimes(1);
  });
});
