import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Register offline service worker (best-effort, no-op on failure / file://).
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

/**
 * Top-level error boundary. Without it, a single render error anywhere in the
 * app unmounts the *entire* React tree and leaves a permanent blank screen that
 * can't be recovered (a common cause was the drill preview's pan/zoom state).
 * With it, an error shows a recoverable overlay instead and hands back control.
 */
class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: 24,
            background: "#070b12",
            color: "#e2e8f0",
            fontFamily: "Arial, sans-serif",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 26 }}>Something went wrong</h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 13, lineHeight: 1.5, color: "#94a3b8" }}>
            An unexpected error occurred while rendering. Use the button below to reload — none of your
            saved projects are affected.
          </p>
          <pre
            style={{
              maxWidth: 720,
              maxHeight: 160,
              overflow: "auto",
              padding: 10,
              borderRadius: 8,
              background: "#0f172a",
              border: "1px solid #334155",
              color: "#f87171",
              fontSize: 11,
              whiteSpace: "pre-wrap",
            }}
          >
            {String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: 0,
              background: "#f5b33c",
              color: "#1a1105",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </StrictMode>
);
