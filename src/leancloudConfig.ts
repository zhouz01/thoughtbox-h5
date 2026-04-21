import type { LCUser } from "./types";

const LC_CONFIG_KEY = "thoughtbox_lc_config";
const LC_SESSION_KEY = "thoughtbox_lc_session";
const LC_META_KEY = "thoughtbox_lc_meta";
const LC_LOG_KEY = "thoughtbox_lc_log";

export interface LCConfig {
  appId: string;
  appKey: string;
  serverURL?: string;
}

export interface LCMeta {
  deviceId: string;
  deviceName: string;
  lastSyncAt?: string;
  lastSyncAction?: "push" | "pull" | "merge";
  lastSyncStatus?: "success" | "failed";
  lastSyncError?: string;
}

export interface LCLogEntry {
  id: string;
  timestamp: string;
  action: string;
  status: "success" | "failed";
  details?: string;
  error?: string;
}

export function getLCConfig(): LCConfig {
  try {
    const config = localStorage.getItem(LC_CONFIG_KEY);
    if (config) {
      return JSON.parse(config);
    }
  } catch {
    // ignore
  }
  return {
    appId: "",
    appKey: "",
  };
}

export function saveLCConfig(config: LCConfig): void {
  localStorage.setItem(LC_CONFIG_KEY, JSON.stringify(config));
}

export function clearLCConfig(): void {
  localStorage.removeItem(LC_CONFIG_KEY);
}

export function getLCSession(): { userId: string; sessionToken: string; email: string } | null {
  try {
    const session = localStorage.getItem(LC_SESSION_KEY);
    if (session) {
      return JSON.parse(session);
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveLCSession(userId: string, sessionToken: string, email: string): void {
  localStorage.setItem(LC_SESSION_KEY, JSON.stringify({ userId, sessionToken, email }));
}

export function clearLCSession(): void {
  localStorage.removeItem(LC_SESSION_KEY);
}

export function isLCLoggedIn(): boolean {
  return !!getLCSession();
}

export function getLCMeta(): LCMeta {
  try {
    const meta = localStorage.getItem(LC_META_KEY);
    if (meta) {
      return JSON.parse(meta);
    }
  } catch {
    // ignore
  }
  return {
    deviceId: generateDeviceId(),
    deviceName: getDeviceName(),
  };
}

export function saveLCMeta(meta: Partial<LCMeta>): void {
  const current = getLCMeta();
  const updated = { ...current, ...meta };
  localStorage.setItem(LC_META_KEY, JSON.stringify(updated));
}

export function getLCLog(): LCLogEntry[] {
  try {
    const log = localStorage.getItem(LC_LOG_KEY);
    if (log) {
      return JSON.parse(log);
    }
  } catch {
    // ignore
  }
  return [];
}

export function addLCLogEntry(entry: Omit<LCLogEntry, "id" | "timestamp">): void {
  const log = getLCLog();
  const newEntry: LCLogEntry = {
    ...entry,
    id: generateId(),
    timestamp: new Date().toISOString(),
  };
  log.unshift(newEntry);
  // 只保留最近 20 条
  localStorage.setItem(LC_LOG_KEY, JSON.stringify(log.slice(0, 20)));
}

function generateDeviceId(): string {
  const id = Math.random().toString(36).substring(2, 15);
  return id;
}

function getDeviceName(): string {
  const platform = navigator.platform || "Unknown";
  return `${platform} ${Math.floor(Math.random() * 1000)}`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
