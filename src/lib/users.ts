/**
 * CNC-PRO — offline multi-user profiles.
 *
 * Each user owns a separate project blob in localStorage:
 *   cnc-cabinet-designer-pro-v{ver}-u-{id}
 * Shared registry keys:
 *   cnc-users-v{ver}        — the user list
 *   cnc-active-user-v{ver}  — id of the active user
 * Fully offline (localStorage only). A legacy single-user install is adopted
 * into a "Default" user on first run — nothing is lost.
 */
import type { User } from "../types";
import { uid } from "./defaults";

const usersKey = (version: number) => `cnc-users-v${version}`;
const activeUserKey = (version: number) => `cnc-active-user-v${version}`;

/** the localStorage key holding ONE user's full project blob */
export const userStorageKey = (id: string, version: number) => `cnc-cabinet-designer-pro-v${version}-u-${id}`;

function readUsers(version: number): User[] {
  try {
    const raw = localStorage.getItem(usersKey(version));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u: any) => u && typeof u.id === "string" && typeof u.name === "string") : [];
  } catch {
    return [];
  }
}

/** all users, most-recently-used first */
export function listUsers(version: number): User[] {
  return readUsers(version).sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0));
}

function saveUsers(users: User[], version: number) {
  try {
    localStorage.setItem(usersKey(version), JSON.stringify(users));
  } catch {}
}

export function getActiveUserId(version: number): string | null {
  try {
    return localStorage.getItem(activeUserKey(version));
  } catch {
    return null;
  }
}

/** mark a user active + bump its lastActive (MRU order in the picker) */
export function setActiveUserId(id: string, version: number) {
  try {
    localStorage.setItem(activeUserKey(version), id);
  } catch {}
  const users = readUsers(version);
  const u = users.find((x) => x.id === id);
  if (u) {
    u.lastActive = Date.now();
    saveUsers(users, version);
  }
}

/** create a user and make it active */
export function createUser(name: string, version: number): User {
  const user: User = { id: uid(), name: name.trim() || "User", createdAt: Date.now(), lastActive: Date.now() };
  const users = readUsers(version);
  users.push(user);
  saveUsers(users, version);
  setActiveUserId(user.id, version);
  return user;
}

export function renameUser(id: string, name: string, version: number) {
  const users = readUsers(version);
  const u = users.find((x) => x.id === id);
  if (!u) return;
  u.name = name.trim() || u.name;
  saveUsers(users, version);
}

/** delete a user AND their whole saved project blob */
export function deleteUser(id: string, version: number) {
  saveUsers(
    readUsers(version).filter((u) => u.id !== id),
    version,
  );
  try {
    localStorage.removeItem(userStorageKey(id, version));
  } catch {}
  if (getActiveUserId(version) === id) {
    try {
      localStorage.removeItem(activeUserKey(version));
    } catch {}
  }
}

/**
 * Make sure a user exists and is active. Migration paths:
 *  · no registry + legacy blob exists → create a "Default" user that adopts it
 *  · no registry + nothing stored     → create a fresh "Default" user
 *  · registry exists, marker missing  → activate the MRU user
 */
export function ensureActiveUser(
  version: number,
  legacyDataExists: boolean,
): { user: User; users: User[]; migratedFromLegacy: boolean } {
  let users = listUsers(version);
  let activeId = getActiveUserId(version);
  let migratedFromLegacy = false;

  if (!users.length) {
    const user: User = { id: uid(), name: "Default", createdAt: Date.now(), lastActive: Date.now() };
    users = [user];
    saveUsers(users, version);
    activeId = user.id;
    migratedFromLegacy = legacyDataExists;
    try {
      localStorage.setItem(activeUserKey(version), user.id);
    } catch {}
  } else if (!activeId || !users.some((u) => u.id === activeId)) {
    activeId = users[0].id;
    try {
      localStorage.setItem(activeUserKey(version), activeId);
    } catch {}
  }

  const user = users.find((u) => u.id === activeId) ?? users[0];
  return { user, users, migratedFromLegacy };
}