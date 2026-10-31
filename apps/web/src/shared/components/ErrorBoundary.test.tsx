import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@hotel-booking/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function Broken(): never {
  throw new Error("render failed");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs caught render errors; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("shows the fallback instead of a blank page when a child throws", () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.queryByText("render failed")).not.toBeInTheDocument();
  });

  it("reports the error through onError", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Broken />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("render failed");
  });

  it("supports a custom fallback that can reset the boundary", () => {
    let shouldThrow = true;
    function Sometimes() {
      if (shouldThrow) throw new Error("once");
      return <p>recovered</p>;
    }

    render(
      <ErrorBoundary
        fallback={(reset) => (
          <button type="button" onClick={reset}>
            try again
          </button>
        )}
      >
        <Sometimes />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "try again" }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });
});
