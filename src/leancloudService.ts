import AV from "leancloud-storage";
import type { AppSnapshot, Record, Synthesis, ProjectBrief, AIPreferences } from "./types";
import {
  getLCConfig,
  saveLCSession,
  clearLCSession,
  saveLCMeta,
  addLCLogEntry,
  getLCMeta,
} from "./leancloudConfig";
import { loadAllRecords } from "./storage";
import { loadAllSyntheses } from "./synthesisStorage";
import { loadAllBriefs } from "./briefStorage";
import { loadPreferences } from "./preferences";
import { applySnapshot } from "./syncService";

let isInitialized = false;

export function initLeanCloud(): boolean {
  if (isInitialized) return true;
  
  const config = getLCConfig();
  if (!config.appId || !config.appKey) {
    return false;
  }

  try {
    AV.init({
      appId: config.appId,
      appKey: config.appKey,
      serverURL: config.serverURL,
    });
    isInitialized = true;
    return true;
  } catch (error) {
    console.error("LeanCloud init failed:", error);
    return false;
  }
}

export function resetLeanCloud(): void {
  isInitialized = false;
}

export async function loginWithEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!initLeanCloud()) {
    return { success: false, error: "LeanCloud 未配置" };
  }

  try {
    const user = await AV.User.loginWithEmail(email, password);
    saveLCSession(user.id, user.getSessionToken(), email);
    addLCLogEntry({
      action: "login",
      status: "success",
      details: `用户 ${email} 登录成功`,
    });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "登录失败";
    addLCLogEntry({
      action: "login",
      status: "failed",
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

export async function signupWithEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!initLeanCloud()) {
    return { success: false, error: "LeanCloud 未配置" };
  }

  try {
    const user = new AV.User();
    user.setUsername(email);
    user.setPassword(password);
    user.setEmail(email);
    await user.signUp();
    saveLCSession(user.id, user.getSessionToken(), email);
    addLCLogEntry({
      action: "signup",
      status: "success",
      details: `用户 ${email} 注册成功`,
    });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "注册失败";
    addLCLogEntry({
      action: "signup",
      status: "failed",
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

export async function logoutLC(): Promise<void> {
  if (!initLeanCloud()) return;
  
  try {
    await AV.User.logOut();
    clearLCSession();
    addLCLogEntry({
      action: "logout",
      status: "success",
    });
  } catch (error) {
    console.error("Logout error:", error);
  }
}

export async function getCurrentLCUser(): Promise<{ id: string; email: string } | null> {
  if (!initLeanCloud()) return null;

  try {
    const user = AV.User.current();
    if (user) {
      return {
        id: user.id,
        email: user.getEmail() || user.getUsername(),
      };
    }
  } catch (error) {
    console.error("Get current user error:", error);
  }
  return null;
}

export interface SyncOperationResult {
  success: boolean;
  message: string;
  error?: string;
  stats?: {
    recordsAdded: number;
    recordsUpdated: number;
    synthesesAdded: number;
    synthesesUpdated: number;
    briefsAdded: number;
    briefsUpdated: number;
  };
}

export async function pushToLeanCloud(): Promise<SyncOperationResult> {
  if (!initLeanCloud()) {
    return { success: false, message: "", error: "LeanCloud 未配置" };
  }

  const user = AV.User.current();
  if (!user) {
    return { success: false, message: "", error: "未登录" };
  }

  try {
    const snapshot = await createLocalSnapshot();
    const SnapshotClass = AV.Object.extend("UserSnapshot");
    const snapshotObj = new SnapshotClass();
    
    snapshotObj.set("user", user);
    snapshotObj.set("payload", JSON.stringify(snapshot));
    snapshotObj.set("schemaVersion", snapshot.schemaVersion);
    snapshotObj.set("deviceId", snapshot.deviceId);
    snapshotObj.set("recordCount", snapshot.meta.recordCount);
    snapshotObj.set("synthesisCount", snapshot.meta.synthesisCount);
    snapshotObj.set("briefCount", snapshot.meta.briefCount);

    await snapshotObj.save();

    saveLCMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "push",
      lastSyncStatus: "success",
    });

    addLCLogEntry({
      action: "push",
      status: "success",
      details: `上传成功: ${snapshot.meta.recordCount} 条记录`,
    });

    return {
      success: true,
      message: `上传成功: ${snapshot.meta.recordCount} 条记录, ${snapshot.meta.synthesisCount} 条汇总, ${snapshot.meta.briefCount} 条推进卡`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "上传失败";
    saveLCMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "push",
      lastSyncStatus: "failed",
      lastSyncError: errorMessage,
    });
    addLCLogEntry({
      action: "push",
      status: "failed",
      error: errorMessage,
    });
    return { success: false, message: "", error: errorMessage };
  }
}

export async function pullFromLeanCloud(): Promise<SyncOperationResult> {
  if (!initLeanCloud()) {
    return { success: false, message: "", error: "LeanCloud 未配置" };
  }

  const user = AV.User.current();
  if (!user) {
    return { success: false, message: "", error: "未登录" };
  }

  try {
    const query = new AV.Query("UserSnapshot");
    query.equalTo("user", user);
    query.descending("createdAt");
    const snapshotObj = await query.first();

    if (!snapshotObj) {
      return { success: false, message: "", error: "云端没有数据" };
    }

    const payload = snapshotObj.get("payload");
    const remoteSnapshot: AppSnapshot = JSON.parse(payload);

    // 应用快照
    const stats = applySnapshot(remoteSnapshot);

    saveLCMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "pull",
      lastSyncStatus: "success",
    });

    addLCLogEntry({
      action: "pull",
      status: "success",
      details: `拉取成功: ${stats.recordsAdded + stats.recordsUpdated} 条记录`,
    });

    return {
      success: true,
      message: `拉取成功`,
      stats,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "拉取失败";
    saveLCMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "pull",
      lastSyncStatus: "failed",
      lastSyncError: errorMessage,
    });
    addLCLogEntry({
      action: "pull",
      status: "failed",
      error: errorMessage,
    });
    return { success: false, message: "", error: errorMessage };
  }
}

export async function bidirectionalSyncLC(): Promise<SyncOperationResult> {
  if (!initLeanCloud()) {
    return { success: false, message: "", error: "LeanCloud 未配置" };
  }

  const user = AV.User.current();
  if (!user) {
    return { success: false, message: "", error: "未登录" };
  }

  try {
    // 1. 获取云端数据
    const query = new AV.Query("UserSnapshot");
    query.equalTo("user", user);
    query.descending("createdAt");
    const snapshotObj = await query.first();

    // 2. 获取本地数据
    const localSnapshot = await createLocalSnapshot();

    let mergedSnapshot: AppSnapshot;

    if (!snapshotObj) {
      // 云端没有数据，直接上传本地
      mergedSnapshot = localSnapshot;
    } else {
      // 合并数据
      const payload = snapshotObj.get("payload");
      const remoteSnapshot: AppSnapshot = JSON.parse(payload);
      mergedSnapshot = mergeSnapshots(localSnapshot, remoteSnapshot);
    }

    // 3. 应用合并后的数据到本地
    const stats = applySnapshot(mergedSnapshot);

    // 4. 上传合并后的数据到云端
    const SnapshotClass = AV.Object.extend("UserSnapshot");
    const newSnapshotObj = new SnapshotClass();
    newSnapshotObj.set("user", user);
    newSnapshotObj.set("payload", JSON.stringify(mergedSnapshot));
    newSnapshotObj.set("schemaVersion", mergedSnapshot.schemaVersion);
    newSnapshotObj.set("deviceId", mergedSnapshot.deviceId);
    newSnapshotObj.set("recordCount", mergedSnapshot.meta.recordCount);
    newSnapshotObj.set("synthesisCount", mergedSnapshot.meta.synthesisCount);
    newSnapshotObj.set("briefCount", mergedSnapshot.meta.briefCount);
    await newSnapshotObj.save();

    saveLCMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "merge",
      lastSyncStatus: "success",
    });

    addLCLogEntry({
      action: "merge",
      status: "success",
      details: `双向同步成功`,
    });

    return {
      success: true,
      message: `双向同步成功`,
      stats,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "同步失败";
    saveLCMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "merge",
      lastSyncStatus: "failed",
      lastSyncError: errorMessage,
    });
    addLCLogEntry({
      action: "merge",
      status: "failed",
      error: errorMessage,
    });
    return { success: false, message: "", error: errorMessage };
  }
}

async function createLocalSnapshot(): Promise<AppSnapshot> {
  const records = loadAllRecords();
  const syntheses = loadAllSyntheses();
  const briefs = loadAllBriefs();
  const preferences = loadPreferences();
  const meta = getLCMeta();

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    deviceId: meta.deviceId,
    appVersion: "1.7.0",
    records,
    syntheses,
    briefs,
    preferences,
    meta: {
      recordCount: records.length,
      synthesisCount: syntheses.length,
      briefCount: briefs.length,
    },
  };
}

function mergeSnapshots(local: AppSnapshot, remote: AppSnapshot): AppSnapshot {
  // 合并策略：latest wins
  const mergedRecords = mergeEntities(local.records, remote.records);
  const mergedSyntheses = mergeEntities(local.syntheses, remote.syntheses);
  const mergedBriefs = mergeEntities(local.briefs, remote.briefs);
  const mergedPreferences = mergePreferences(local.preferences, remote.preferences);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    deviceId: local.deviceId,
    appVersion: local.appVersion,
    records: mergedRecords,
    syntheses: mergedSyntheses,
    briefs: mergedBriefs,
    preferences: mergedPreferences,
    meta: {
      recordCount: mergedRecords.length,
      synthesisCount: mergedSyntheses.length,
      briefCount: mergedBriefs.length,
    },
  };
}

function mergeEntities<T extends { id: string; updatedAt?: string; deletedAt?: string }>(
  local: T[],
  remote: T[]
): T[] {
  const map = new Map<string, T>();

  // 添加本地数据
  local.forEach((item) => map.set(item.id, item));

  // 合并远程数据
  remote.forEach((remoteItem) => {
    const localItem = map.get(remoteItem.id);
    if (!localItem) {
      map.set(remoteItem.id, remoteItem);
    } else {
      // 比较 updatedAt，取较新的
      const localTime = new Date(localItem.updatedAt || 0).getTime();
      const remoteTime = new Date(remoteItem.updatedAt || 0).getTime();
      if (remoteTime > localTime) {
        map.set(remoteItem.id, remoteItem);
      }
    }
  });

  return Array.from(map.values());
}

function mergePreferences(local: AIPreferences, remote: AIPreferences): AIPreferences {
  return {
    bannedGenericTags: [...new Set([...local.bannedGenericTags, ...remote.bannedGenericTags])],
    preferredTopicAliases: { ...local.preferredTopicAliases, ...remote.preferredTopicAliases },
    preferredTagsByTopic: { ...local.preferredTagsByTopic, ...remote.preferredTagsByTopic },
    titleBlacklistPatterns: [...new Set([...local.titleBlacklistPatterns, ...remote.titleBlacklistPatterns])],
    suggestionBlacklistPatterns: [...new Set([...local.suggestionBlacklistPatterns, ...remote.suggestionBlacklistPatterns])],
    acceptedExamples: [...local.acceptedExamples, ...remote.acceptedExamples].slice(-30),
  };
}
