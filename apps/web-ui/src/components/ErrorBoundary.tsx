"use client";

import { Component, type ReactNode } from "react";
import { strings } from "@/lib/strings";

type TErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type TErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<TErrorBoundaryProps, TErrorBoundaryState> {
  constructor(props: TErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): TErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-6 text-center">
            <p className="font-display text-2xl font-light text-white/60">
              {strings.radio.errorTitle}
            </p>
            <p className="mt-3 font-body text-sm text-white/30">
              {strings.radio.errorBody}
            </p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
