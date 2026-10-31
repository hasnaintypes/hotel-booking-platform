import { Component, type ErrorInfo, type ReactNode } from "react";

export type ErrorBoundaryProps = {
  children: ReactNode;
  /** Called once per caught render error. Wire error reporting here (Sentry arrives in M3). */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Replaces the default fallback screen. */
  fallback?: (reset: () => void) => ReactNode;
};

type ErrorBoundaryState = { hasError: boolean };

/** Catches render errors below it so a bug shows a message instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <h1 className="text-2xl font-semibold text-gray-800">Something went wrong</h1>
        <p className="max-w-md text-gray-600">
          An unexpected error stopped this page from loading. Reloading usually fixes it. If the
          problem continues, please try again later.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700"
        >
          Reload page
        </button>
      </div>
    );
  }
}
