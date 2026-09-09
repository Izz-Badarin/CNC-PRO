import type { Cabinet, Settings } from "../types";
import { CabinetViewer } from "../three/scene";

/** the four automatic photos captured per cabinet: ISO + front + left + exploded */
export interface CabShots {
  iso: string;
  front: string;
  left: string;
  /** 3D exploded view — every part slid out of its seat (sides ±X, tops +Y, back −Z, doors/drawers +Z) */
  exploded: string;
}

/**
 * Capture ISO / front / left / exploded photos of ONE cabinet headlessly —
 * the same CabinetViewer the user orbits in the 3D tab, driven off-screen at
 * a fixed size (1280×960) with one fresh render per view. No user screenshots
 * needed. The photo shows ONLY this cabinet — project panels are never
 * included. Returns "" for every view when WebGL is unavailable.
 */
export async function captureCabinetShots(
  cab: Cabinet,
  S: Settings,
  opts?: { spacing?: number; showDims?: boolean },
): Promise<CabShots> {
  const empty: CabShots = { iso: "", front: "", left: "", exploded: "" };
  if (typeof document === "undefined" || typeof window === "undefined") return empty;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:1280px;height:960px;pointer-events:none;visibility:hidden;";
  document.body.appendChild(host);
  let viewer: CabinetViewer | null = null;
  try {
    viewer = new CabinetViewer(host);
    viewer.doorsOpen = false;
    viewer.drawersOpen = false;
    // `panels` is intentionally NOT passed — per-cabinet photos must show the
    // cabinet ALONE, never the project's loose panels
    viewer.setData([{ ...cab, qty: 1 }], S, {
      spacing: opts?.spacing ?? 200,
      showDims: opts?.showDims ?? false,
      followLayout: false,
    });
    const take = (preset: "iso" | "front" | "left"): string => {
      viewer!.setView(preset);
      return viewer!.snapshot("image/jpeg", 0.92);
    };
    const takeExploded = (): string => {
      viewer!.setExploded(1);
      viewer!.setView("iso");
      const shot = viewer!.snapshot("image/jpeg", 0.92);
      viewer!.setExploded(0);
      return shot;
    };
    // one microtask between captures so the GL pipeline can settle; each
    // snapshot re-renders synchronously, so one frame per view is enough
    const shots: CabShots = { iso: take("iso"), front: "", left: "", exploded: "" };
    await new Promise((r) => setTimeout(r, 0));
    shots.front = take("front");
    await new Promise((r) => setTimeout(r, 0));
    shots.left = take("left");
    await new Promise((r) => setTimeout(r, 0));
    shots.exploded = takeExploded();
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
 * Capture the four photos for EVERY cabinet of the project, reusing one
 * hidden viewer across cabinets. `onProgress(done, total)` drives a progress
 * bar — capturing is async so the UI stays responsive.
 */
export async function captureAllCabinetShots(
  cabs: Cabinet[],
  S: Settings,
  opts?: { spacing?: number; showDims?: boolean; onProgress?: (done: number, total: number) => void },
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
