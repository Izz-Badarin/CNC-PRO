import { useEffect, useState } from "react";
import { Check, Plus, UserRound, X } from "lucide-react";
import type { User } from "../types";
import { cn } from "../utils/cn";

/** localStorage flag: skip the launch user-picker next time */
export const SKIP_USER_GATE_KEY = "cnc-skip-user-gate";

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("") || "?";

/**
 * User picker — no passwords, everything is local to this browser.
 *  · launch mode: choose a user (or create one) then press "Open"; offers a
 *    "don't ask next time" checkbox that skips this gate on future launches.
 *  · in-app mode: clicking a user switches to it immediately.
 */
export function UserSelectModal({
  open,
  onClose,
  users,
  activeUserId,
  onSelect,
  onCreate,
  launchMode = false,
  closable = false,
  title,
}: {
  open: boolean;
  onClose: () => void;
  users: User[];
  activeUserId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  launchMode?: boolean;
  /** show the close (X) even in launch mode — used when opened via Logout / switch from inside the app */
  closable?: boolean;
  title?: string;
}) {
  const [pickedId, setPickedId] = useState<string | null>(activeUserId);
  const [skipNext, setSkipNext] = useState(false);

  useEffect(() => {
    if (open) setPickedId(activeUserId ?? users[0]?.id ?? null);
  }, [open, activeUserId, users]);

  if (!open) return null;

  const picked = users.find((u) => u.id === pickedId) ?? null;

  const promptCreate = () => {
    const name = window.prompt("New user name — this user gets their own settings, cabinets and projects on this device", "");
    if (name && name.trim()) {
      onCreate(name.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-950/90 p-4 backdrop-blur-sm">
      <div className="anim-rise w-full max-w-[440px] rounded-2xl border border-white/[0.08] bg-ink-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="font-display text-[16px] font-bold text-ink-100">{title ?? "Choose user"}</h2>
            <p className="mt-0.5 text-[11px] text-ink-400">No password — each user's settings &amp; projects are saved in this browser.</p>
          </div>
          {(closable || !launchMode) && (
            <button className="text-ink-400 hover:text-ink-100" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="max-h-[320px] space-y-1.5 overflow-y-auto px-4 py-4">
          {users.map((u) => {
            const active = u.id === pickedId;
            return (
              <button
                key={u.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                  active ? "border-amber-400/50 bg-amber-400/10" : "border-white/[0.06] bg-ink-850/70 hover:border-white/20",
                )}
                onClick={() => {
                  setPickedId(u.id);
                  if (!launchMode) {
                    onSelect(u.id);
                    onClose();
                  }
                }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-600 font-display text-[13px] font-bold text-ink-950">
                  {initials(u.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[13.5px] font-semibold", active ? "text-amber-200" : "text-ink-100")}>{u.name}</span>
                  <span className="block font-mono text-[10px] text-ink-400">
                    {u.id === activeUserId ? "active now" : `last used ${new Date(u.lastActive).toLocaleString()}`}
                  </span>
                </span>
                {active && <Check size={15} className="shrink-0 text-amber-300" />}
              </button>
            );
          })}
          <button
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/[0.12] px-3 py-2.5 text-left text-ink-300 transition-all hover:border-amber-400/40 hover:text-amber-200"
            onClick={promptCreate}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-ink-800">
              <Plus size={15} />
            </span>
            <span className="text-[13.5px] font-semibold">New user…</span>
            <span className="ml-auto text-[10.5px] text-ink-500">own settings &amp; projects</span>
          </button>
        </div>

        {launchMode && (
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-400" title="Open the last user automatically next time">
              <input type="checkbox" className="chk !h-3.5 !w-3.5" checked={skipNext} onChange={(e) => setSkipNext(e.target.checked)} />
              Don't ask next time
            </label>
            <button
              disabled={!picked}
              onClick={() => {
                try {
                  if (skipNext) localStorage.setItem(SKIP_USER_GATE_KEY, "1");
                  else localStorage.removeItem(SKIP_USER_GATE_KEY);
                } catch {}
                if (picked) onSelect(picked.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2 text-[13px] font-semibold text-ink-950 shadow-[0_4px_16px_-4px_rgba(245,179,60,0.5)] transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
            >
              <UserRound size={14} /> Open
            </button>
          </div>
        )}
      </div>
    </div>
  );
}