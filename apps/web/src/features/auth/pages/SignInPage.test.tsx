import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignIn from "./SignInPage";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("@/shared/context/ToastContext", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

function Search() {
  return <span data-testid="search">{useLocation().search}</span>;
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <SignIn />
        <Search />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SignInPage after Google sign-in", () => {
  beforeEach(() => mocks.showToast.mockReset());

  it.each([
    ["account_exists", /already exists/],
    ["email_unverified", /isn't verified/],
    ["oauth_state", /could not be verified/],
    ["access_denied", /cancelled/],
  ])("shows what went wrong for ?error=%s and removes it from the address", async (code, text) => {
    const { getByTestId } = renderAt(`/sign-in?error=${code}`);

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ERROR", description: expect.stringMatching(text) }),
      ),
    );
    await waitFor(() => expect(getByTestId("search")).toHaveTextContent(/^$/));
    expect(mocks.showToast).toHaveBeenCalledTimes(1);
  });

  it("does not repeat text taken from the address", async () => {
    renderAt("/sign-in?error=%3Cscript%3Ealert(1)%3C/script%3E");

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    // Checked against the payload itself, not the bare word "script": the JSON key
    // "description" also contains that substring ("de-script-ion").
    const serialized = JSON.stringify(mocks.showToast.mock.calls);
    expect(serialized).not.toContain("<script");
    expect(serialized).not.toContain("alert(1)");
  });

  it("shows nothing when there is no error", () => {
    renderAt("/sign-in");
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
