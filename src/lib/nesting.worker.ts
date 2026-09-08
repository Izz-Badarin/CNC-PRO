import { runNesting, type NestRunProgress } from "./nesting";
import type { Part, Settings } from "../types";

/**
 * Nesting Web Worker — runs the whole 52-strategy optimizer OFF the main thread
 * so the UI never freezes on big kitchens. Bundled with `?worker&inline` so it
 * stays inside the single offline HTML file.
 */

let stop = false;
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: string; parts?: Part[]; settings?: Settings };
  if (msg.type === "stop") {
    stop = true;
    return;
  }
  if (msg.type === "run" && msg.parts && msg.settings) {
    stop = false;
    runNesting(msg.parts, msg.settings, (p: NestRunProgress) => post({ type: "progress", p }), () => stop)
      .then(() => post({ type: "done" }))
      .catch((err) => post({ type: "error", message: String(err) }));
  }
};
