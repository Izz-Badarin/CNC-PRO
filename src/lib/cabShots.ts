import type { Cabinet, PanelItem, Settings } from "../types";
import { CabinetViewer } from "../three/scene";

/** the three automatic photos captured per cabinet: ISO + front + left */
export interface CabShots {
  iso: string;
  front: string;
  left: string;
}

/**
 * Capture ISO / front / left photos of ONE cabinet headlessly — the same
 * CabinetViewer the user orbits in the 3D tab, driven off-screen at a fixed
 * size (640×480) with one fresh render per view. No user screenshots needed.
 * Returns "" for every view when WebGL is unavailable.
 */
export async function captureCabinetShots(
  cab: Cabinet,
  S: Settings,
  opts?: { spacing?: number; showDims?: boolean; panels?: PanelItem[] },
): Promise<CabShots> {
  const empty: CabShots = { iso: "", front: "", left: "" };
  if (typeof document === "undefined" || typeof window === "undefined") return empty;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:640px;height:480px;pointer-events:none;visibility:hidden;";
  document.body.appendChild(host);
  let viewer: CabinetViewer | null = null;
  try {
    viewer = new CabinetViewer(host);
    viewer.doorsOpen = false;
    viewer.drawersOpen = false;
    viewer.setData([{ ...cab, qty: 1 }], S, {
      spacing: opts?.spacing ?? 200,
      showDims: opts?.showDims ?? false,
      followLayout: false,
      panels: opts?.panels ?? [],
    });
    const take = (preset: "iso" | "front" | "left"): string => {
      viewer!.setView(preset);
      return viewer!.snapshot("image/jpeg", 0.82);
    };
    // one microtask between captures so the GL pipeline can settle; each
    // snapshot re-renders synchronously, so one frame per view is enough
    const shots: CabShots = { iso: take("iso"), front: "", left: "" };
    await new Promise((r) => setTimeout(r, 0));
    shots.front = take("front");
    await new Promise((r) => setTimeout(r, 0));
    shots.left = take("left");
    return shots;
  } catch {
    return empty;
  } finally {
    try {
      viewer?.dispose();
    } catch {
      /* noop */
    }
    host.remove();
  }
}

/**
 * Capture the three photos for EVERY cabinet of the project, reusing one
 * hidden viewer across cabinets. `onProgress(done, total)` drives a progress
 * bar — capturing is async so the UI stays responsive.
 */
export async function captureAllCabinetShots(
  cabs: Cabinet[],
  S: Settings,
  opts?: { spacing?: number; showDims?: boolean; panels?: PanelItem[]; onProgress?: (done: number, total: number) => void },
): Promise<Record<string, CabShots>> {
  const out: Record<string, CabShots> = {};
  const total = Math.max(1, cabs.length);
  let done = 0;
  for (const cab of cabs) {
    out[cab.id] = await captureCabinetShots(cab, S, opts);
    done += 1;
    opts?.onProgress?.(done, total);
  }
  return out;
}
