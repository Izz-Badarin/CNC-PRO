import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// --- Offline reliability: service worker, error logging, online/offline ---

// SW registration: best-effort, works on https, http localhost, and any http(s) origin.
// file:// can't use SW — single-file build works without it.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        // auto-update: if new SW waiting, prompt via console and activate
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              // new version ready — will activate on next load, or we can force
              console.log("[CNC-PRO] New offline version ready — reload to update");
            }
          });
        });
      })
      .catch(() => {});
  });
}

// Global error logging to localStorage for plane-mode debugging
if (typeof window !== "undefined") {
  const LOG_KEY = "cnc-error-log";
  const pushLog = (msg: string) => {
    try {
      const now = new Date().toISOString();
      const prev = localStorage.getItem(LOG_KEY) || "";
      const entry = `[${now}] ${msg}\n`;
      // keep last 20KB
      const combined = (prev + entry).slice(-20000);
      localStorage.setItem(LOG_KEY, combined);
    } catch {}
  };

  window.addEventListener("error", (e) => {
    pushLog(`ERROR ${e.message} @ ${e.filename}:${e.lineno}:${e.colno} ${e.error ? String(e.error).slice(0, 500) : ""}`);
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    pushLog(`UNHANDLED_REJECTION ${String(e.reason).slice(0, 800)}`);
  });

  // Persist online status for UI
  window.addEventListener("online", () => {
    try {
      localStorage.setItem("cnc-last-online", new Date().toISOString());
    } catch {}
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
      const errStr = String(this.state.error);
      const reset = () => {
        // try to clear corrupted storage key if error mentions it
        try {
          if (errStr.includes("cnc-cabinet") || errStr.includes("localStorage")) {
            const k = localStorage.key(0);
            console.warn("[CNC-PRO] error may be storage-related", k);
          }
        } catch {}
        window.location.reload();
      };
      const hardReset = () => {
        if (confirm("Hard reset: clear local storage and reload? Your browser-saved projects will be lost (use Save files you exported). Continue?")) {
          try {
            // keep error log
            const log = localStorage.getItem("cnc-error-log");
            localStorage.clear();
            if (log) localStorage.setItem("cnc-error-log", log);
          } catch {}
          window.location.reload();
        }
      };
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
            An unexpected error occurred while rendering. Your saved projects are still in browser storage.
            Try reload — if it persists, use hard reset (exports you saved as .json are safe).
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
            {errStr}
          </pre>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={reset}
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
            <button
              onClick={hardReset}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#94a3b8",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Hard reset storage
            </button>
          </div>
          <p style={{ fontSize: 10, color: "#475569" }}>Plane mode: all data is local. If you have a .json export, you can re-import after reset.</p>
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
