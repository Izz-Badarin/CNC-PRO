import { useEffect, useState } from "react";
import { Wifi, WifiOff, HardDrive, ShieldCheck, Download } from "lucide-react";
import { storageInfo } from "../lib/storage";

export function OfflineBadge() {
  const [online, setOnline] = useState<boolean>(() => {
    try {
      return navigator.onLine;
    } catch {
      return true;
    }
  });
  const [info, setInfo] = useState(() => storageInfo());
  const [sw, setSw] = useState<"no" | "yes" | "file">("no");

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const id = window.setInterval(() => setInfo(storageInfo()), 5000);
    // detect file://
    if (location.protocol === "file:") setSw("file");
    else if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((r) => setSw(r ? "yes" : "no"));
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-[10.5px] font-mono">
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 border ${
          online
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
            : "border-amber-400/30 bg-amber-400/10 text-amber-200"
        }`}
        title={online ? "Online — but app works fully offline" : "Offline / plane mode — all features work locally"}
      >
        {online ? <Wifi size={12} /> : <WifiOff size={12} />}
        {online ? "ONLINE" : "OFFLINE"}
      </span>
      <span
        className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-ink-400"
        title={`Local storage: ${info.count} keys, ~${Math.round(info.used / 1024)} KB used (${info.percent}%)`}
      >
        <HardDrive size={12} /> {Math.round(info.used / 1024)}KB {info.percent > 80 ? "⚠" : ""}
      </span>
      {sw === "file" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-300" title="Opened via file:// — single-file offline build, no service worker needed">
          <ShieldCheck size={12} /> FILE:// OFFLINE
        </span>
      ) : sw === "yes" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300" title="Service worker active — app cached for offline PWA">
          <ShieldCheck size={12} /> PWA CACHED
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-ink-500" title="No service worker — still works offline because single-file build has everything inlined">
          <Download size={12} /> SINGLE-FILE
        </span>
      )}
    </div>
  );
}
