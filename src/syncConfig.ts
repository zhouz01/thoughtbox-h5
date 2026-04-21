/**
 * V1.7 数据同步配置管理
 * 本地优先 + 可选云同步
 */

import type { SyncConfig, SyncSession, SyncMeta, SyncLogEntry } from "./types";

const SYNC_CONFIG_KEY = "thoughtbox_sync_config";
const SYNC_SESSION_KEY = "thoughtbox_sync_session";
const SYNC_META_KEY = "thoughtbox_sync_meta";
const SYNC_LOG_KEY = "thoughtbox_sync_log";
const DEVICE_ID_KEY = "thoughtbox_device_id";

const CURRENT_SCHEMA_VERSION = 1;
const APP_VERSION = "1.7.0";

// ============================================================
// 设备 ID 管理
// ============================================================

export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function generateDeviceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `dev_${timestamp}_${random}`;
}

export function getDeviceName(): string {
  const platform = navigator.platform || "Unknown";
  const userAgent = navigator.userAgent || "";
  
  // 尝试识别设备类型
  let deviceType = "设备";
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    deviceType = "iPhone/iPad";
  } else if (/Android/.test(userAgent)) {
    deviceType = "Android";
  } else if (/Mac/.test(platform)) {
    deviceType = "Mac";
  } else if (/Win/.test(platform)) {
    deviceType = "Windows";
  } else if (/Linux/.test(platform)) {
    deviceType = "Linux";
  }
  
  return `${deviceType} ${getDeviceId().slice(-4)}`;
}

// ============================================================
// 同步配置管理
// ============================================================

export function getSyncConfig(): SyncConfig {
  const stored = localStorage.getItem(SYNC_CONFIG_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // 解析失败，返回默认配置
    }
  }
  return getDefaultSyncConfig();
}

export function saveSyncConfig(config: SyncConfig): void {
  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save sync config:", e);
  }
}

export function getDefaultSyncConfig(): SyncConfig {
  return {
    supabaseUrl: "",
    supabaseAnonKey: "",
    syncEmail: "",
    autoCheckOnOpen: false,
    autoBackupBeforeSync: true,
  };
}

export function clearSyncConfig(): void {
  localStorage.removeItem(SYNC_CONFIG_KEY);
}

// ============================================================
// 同步会话管理（登录状态）
// ============================================================

export function getSyncSession(): SyncSession | null {
  const stored = localStorage.getItem(SYNC_SESSION_KEY);
  if (stored) {
    try {
      const session: SyncSession = JSON.parse(stored);
      // 检查是否过期
      if (session.expiresAt && session.expiresAt > Date.now() / 1000) {
        return session;
      }
      // 已过期，清除
      clearSyncSession();
    } catch {
      clearSyncSession();
    }
  }
  return null;
}

export function saveSyncSession(session: SyncSession): void {
  localStorage.setItem(SYNC_SESSION_KEY, JSON.stringify(session));
}

export function clearSyncSession(): void {
  localStorage.removeItem(SYNC_SESSION_KEY);
}

export function isSyncLoggedIn(): boolean {
  return getSyncSession() !== null;
}

// ============================================================
// 同步元数据管理
// ============================================================

export function getSyncMeta(): SyncMeta {
  const stored = localStorage.getItem(SYNC_META_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // 解析失败，返回默认
    }
  }
  return getDefaultSyncMeta();
}

export function saveSyncMeta(meta: SyncMeta): void {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

export function updateSyncMeta(updates: Partial<SyncMeta>): void {
  const current = getSyncMeta();
  saveSyncMeta({ ...current, ...updates });
}

export function getDefaultSyncMeta(): SyncMeta {
  return {
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
  };
}

// ============================================================
// 同步日志管理
// ============================================================

export function getSyncLog(): SyncLogEntry[] {
  const stored = localStorage.getItem(SYNC_LOG_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}

export function addSyncLogEntry(entry: Omit<SyncLogEntry, "id">): void {
  const log = getSyncLog();
  const newEntry: SyncLogEntry = {
    ...entry,
    id: generateLogId(),
  };
  // 保留最近 50 条日志
  const updatedLog = [newEntry, ...log].slice(0, 50);
  localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(updatedLog));
}

function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function clearSyncLog(): void {
  localStorage.removeItem(SYNC_LOG_KEY);
}

// ============================================================
// 常量导出
// ============================================================

export { CURRENT_SCHEMA_VERSION, APP_VERSION };
