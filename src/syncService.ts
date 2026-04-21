/**
 * V1.7 数据同步服务
 * Supabase Auth + 单用户快照同步
 */

import { createClient, type SupabaseClient, type AuthError } from "@supabase/supabase-js";
import type {
  AppSnapshot,
  ThoughtRecord,
  Synthesis,
  ProjectBrief,
  AIPreferences,
  SyncConfig,
  SyncSession,
  SyncAction,
  CloudSyncState,
} from "./types";
import {
  getSyncConfig,
  saveSyncConfig,
  getSyncSession,
  saveSyncSession,
  clearSyncSession,
  getDeviceId,
  getDeviceName,
  CURRENT_SCHEMA_VERSION,
  APP_VERSION,
  addSyncLogEntry,
  updateSyncMeta,
} from "./syncConfig";
import { loadRecords, saveRecords } from "./storage";
import { loadSyntheses, saveSyntheses } from "./synthesisStorage";
import { loadBriefs, saveBriefs } from "./briefStorage";
import { loadPreferences } from "./preferences";

// ============================================================
// Supabase 客户端管理
// ============================================================

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const config = getSyncConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }

  try {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    return supabaseClient;
  } catch (error) {
    console.error("Failed to create Supabase client:", error);
    return null;
  }
}

export function resetSupabaseClient(): void {
  supabaseClient = null;
}

// ============================================================
// 快照打包与解析
// ============================================================

export async function createLocalSnapshot(): Promise<AppSnapshot> {
  const records = loadRecords();
  const syntheses = loadSyntheses();
  const briefs = loadBriefs();
  const preferences = loadPreferences();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
    appVersion: APP_VERSION,
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

export async function applySnapshot(snapshot: AppSnapshot): Promise<void> {
  // 验证 schema 版本
  if (snapshot.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`不支持的快照版本: ${snapshot.schemaVersion}`);
  }

  // 应用数据（保留本地 AI 配置）
  if (snapshot.records) {
    saveRecords(snapshot.records);
  }
  if (snapshot.syntheses) {
    saveSyntheses(snapshot.syntheses);
  }
  if (snapshot.briefs) {
    saveBriefs(snapshot.briefs);
  }
  // preferences 不同步，保持本地
}

// ============================================================
// 快照合并策略
// ============================================================

export interface MergeResult {
  mergedSnapshot: AppSnapshot;
  stats: {
    recordsAdded: number;
    recordsUpdated: number;
    recordsDeleted: number;
    synthesesAdded: number;
    synthesesUpdated: number;
    synthesesDeleted: number;
    briefsAdded: number;
    briefsUpdated: number;
    briefsDeleted: number;
  };
}

export function mergeSnapshots(local: AppSnapshot, remote: AppSnapshot): MergeResult {
  const stats = {
    recordsAdded: 0,
    recordsUpdated: 0,
    recordsDeleted: 0,
    synthesesAdded: 0,
    synthesesUpdated: 0,
    synthesesDeleted: 0,
    briefsAdded: 0,
    briefsUpdated: 0,
    briefsDeleted: 0,
  };

  // 合并 Records
  const recordMap = new Map<string, ThoughtRecord>();
  local.records.forEach(r => recordMap.set(r.id, r));

  remote.records.forEach(remoteRecord => {
    const localRecord = recordMap.get(remoteRecord.id);
    if (!localRecord) {
      // 远程有，本地没有
      if (!remoteRecord.deletedAt) {
        recordMap.set(remoteRecord.id, remoteRecord);
        stats.recordsAdded++;
      }
      return;
    }

    // 两端都有
    const localTime = new Date(localRecord.updatedAt).getTime();
    const remoteTime = new Date(remoteRecord.updatedAt).getTime();

    // 删除操作优先：任一方删除，保留删除状态，不再比较时间戳
    if (localRecord.deletedAt) {
      // 本地已删除 → 始终保留本地删除状态
      return;
    }
    if (remoteRecord.deletedAt) {
      // 远程已删除，本地未删除 → 采用远程删除
      recordMap.set(remoteRecord.id, remoteRecord);
      stats.recordsDeleted++;
      return;
    }

    // 都未删除，按时间戳比较
    if (remoteTime > localTime) {
      recordMap.set(remoteRecord.id, remoteRecord);
      stats.recordsUpdated++;
    }
  });

  // 合并 Syntheses
  const synthesisMap = new Map<string, Synthesis>();
  local.syntheses.forEach(s => synthesisMap.set(s.id, s));

  remote.syntheses.forEach(remoteSynthesis => {
    const localSynthesis = synthesisMap.get(remoteSynthesis.id);
    if (!localSynthesis) {
      if (!remoteSynthesis.deletedAt) {
        synthesisMap.set(remoteSynthesis.id, remoteSynthesis);
        stats.synthesesAdded++;
      }
      return;
    }

    const localTime = new Date(localSynthesis.updatedAt).getTime();
    const remoteTime = new Date(remoteSynthesis.updatedAt).getTime();

    if (localSynthesis.deletedAt) {
      return;
    }
    if (remoteSynthesis.deletedAt) {
      synthesisMap.set(remoteSynthesis.id, remoteSynthesis);
      stats.synthesesDeleted++;
      return;
    }

    if (remoteTime > localTime) {
      synthesisMap.set(remoteSynthesis.id, remoteSynthesis);
      stats.synthesesUpdated++;
    }
  });

  // 合并 Briefs
  const briefMap = new Map<string, ProjectBrief>();
  local.briefs.forEach(b => briefMap.set(b.id, b));

  remote.briefs.forEach(remoteBrief => {
    const localBrief = briefMap.get(remoteBrief.id);
    if (!localBrief) {
      if (!remoteBrief.deletedAt) {
        briefMap.set(remoteBrief.id, remoteBrief);
        stats.briefsAdded++;
      }
      return;
    }

    const localTime = new Date(localBrief.updatedAt).getTime();
    const remoteTime = new Date(remoteBrief.updatedAt).getTime();

    if (localBrief.deletedAt) {
      return;
    }
    if (remoteBrief.deletedAt) {
      briefMap.set(remoteBrief.id, remoteBrief);
      stats.briefsDeleted++;
      return;
    }

    if (remoteTime > localTime) {
      briefMap.set(remoteBrief.id, remoteBrief);
      stats.briefsUpdated++;
    }
  });

  // 合并 AIPreferences（简单合并策略）
  const mergedPreferences = mergePreferences(local.preferences, remote.preferences);

  const mergedSnapshot: AppSnapshot = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
    appVersion: APP_VERSION,
    records: Array.from(recordMap.values()),
    syntheses: Array.from(synthesisMap.values()),
    briefs: Array.from(briefMap.values()),
    preferences: mergedPreferences,
    meta: {
      recordCount: recordMap.size,
      synthesisCount: synthesisMap.size,
      briefCount: briefMap.size,
    },
  };

  return { mergedSnapshot, stats };
}

function mergePreferences(local: AIPreferences, remote: AIPreferences): AIPreferences {
  // 合并 bannedGenericTags（去重）
  const bannedSet = new Set([...local.bannedGenericTags, ...remote.bannedGenericTags]);
  
  // 合并 preferredTopicAliases（按 count 累加，同名取 count 大的）
  const aliasMap = new Map<string, { from: string; to: string; count: number }>();
  local.preferredTopicAliases.forEach(a => {
    aliasMap.set(a.from, { ...a });
  });
  remote.preferredTopicAliases.forEach(a => {
    const existing = aliasMap.get(a.from);
    if (!existing || a.count > existing.count) {
      aliasMap.set(a.from, { ...a });
    } else {
      existing.count += a.count;
    }
  });

  // 合并 preferredTagsByTopic（按 topic 合并 tags，去重）
  const tagsMap = new Map<string, { topic: string; tags: Set<string>; count: number }>();
  local.preferredTagsByTopic.forEach(t => {
    tagsMap.set(t.topic, { topic: t.topic, tags: new Set(t.tags), count: t.count });
  });
  remote.preferredTagsByTopic.forEach(t => {
    const existing = tagsMap.get(t.topic);
    if (!existing) {
      tagsMap.set(t.topic, { topic: t.topic, tags: new Set(t.tags), count: t.count });
    } else {
      t.tags.forEach(tag => existing.tags.add(tag));
      existing.count = Math.max(existing.count, t.count);
    }
  });

  // 合并 acceptedExamples（去重后保留最近 30 条）
  const exampleMap = new Map<string, typeof local.acceptedExamples[0]>();
  local.acceptedExamples.forEach(e => exampleMap.set(e.id, e));
  remote.acceptedExamples.forEach(e => exampleMap.set(e.id, e));
  const mergedExamples = Array.from(exampleMap.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);

  // 合并黑名单（去重）
  const titleBlacklist = new Set([...local.titleBlacklistPatterns, ...remote.titleBlacklistPatterns]);
  const suggestionBlacklist = new Set([...local.suggestionBlacklistPatterns, ...remote.suggestionBlacklistPatterns]);

  return {
    bannedGenericTags: Array.from(bannedSet),
    preferredTopicAliases: Array.from(aliasMap.values()),
    preferredTagsByTopic: Array.from(tagsMap.values()).map(t => ({
      topic: t.topic,
      tags: Array.from(t.tags),
      count: t.count,
    })),
    titleBlacklistPatterns: Array.from(titleBlacklist),
    suggestionBlacklistPatterns: Array.from(suggestionBlacklist),
    acceptedExamples: mergedExamples,
    lastUpdatedAt: new Date().toISOString(),
  };
}

// ============================================================
// 云端同步操作
// ============================================================

export interface SyncOperationResult {
  success: boolean;
  action: SyncAction;
  message: string;
  stats?: MergeResult["stats"];
  error?: string;
}

function formatSyncError(error: unknown): { message: string; hint?: string } {
  if (error instanceof Error) {
    const msg = error.message;
    // Supabase 常见错误码
    if (msg.includes("42P01") || msg.includes("relation") || msg.includes("does not exist")) {
      return {
        message: "云端数据表不存在",
        hint: "请在 Supabase Dashboard → SQL Editor 中执行 schema.sql 建表脚本",
      };
    }
    if (msg.includes("new row violates row-level security policy") || msg.includes("violates row-level")) {
      return {
        message: "权限被拒绝（RLS）",
        hint: "请检查 Supabase 中 RLS 策略是否已正确配置",
      };
    }
    if (msg.includes("JWT") || msg.includes("token") || msg.includes("Unauthorized")) {
      return {
        message: "登录已过期",
        hint: "请退出后重新登录",
      };
    }
    if (msg.includes("timeout") || msg.includes("ETIMEDOUT") || msg.includes("fetch")) {
      return {
        message: "网络连接超时",
        hint: "请检查网络连接，国内访问 Supabase 可能需要 VPN",
      };
    }
    return { message: msg };
  }
  return { message: "未知错误" };
}

export async function pushToCloud(snapshot?: AppSnapshot): Promise<SyncOperationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, action: "push", message: "Supabase 未配置", error: "未配置同步服务" };
  }

  const session = getSyncSession();
  if (!session) {
    return { success: false, action: "push", message: "未登录", error: "请先登录同步账号" };
  }

  try {
    const data = snapshot || await createLocalSnapshot();

    const cloudState: Omit<CloudSyncState, "user_id"> = {
      payload_json: data,
      schema_version: CURRENT_SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
      updated_by_device_id: getDeviceId(),
      item_counts: {
        records: data.records.length,
        syntheses: data.syntheses.length,
        briefs: data.briefs.length,
      },
    };

    const { error } = await client
      .from("user_sync_state")
      .upsert({
        user_id: session.userId,
        ...cloudState,
      }, { onConflict: "user_id" });

    if (error) {
      throw error;
    }

    // 更新本地元数据
    updateSyncMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "push",
      lastSyncStatus: "success",
      lastSyncDetails: {
        recordsAdded: 0,
        recordsUpdated: data.records.length,
        recordsDeleted: 0,
        synthesesAdded: 0,
        synthesesUpdated: data.syntheses.length,
        synthesesDeleted: 0,
        briefsAdded: 0,
        briefsUpdated: data.briefs.length,
        briefsDeleted: 0,
      },
    });

    addSyncLogEntry({
      timestamp: new Date().toISOString(),
      action: "push",
      status: "success",
      details: `上传了 ${data.records.length} 条记录, ${data.syntheses.length} 个汇总, ${data.briefs.length} 个推进卡`,
    });

    return {
      success: true,
      action: "push",
      message: "上传成功",
      stats: {
        recordsAdded: 0,
        recordsUpdated: data.records.length,
        recordsDeleted: 0,
        synthesesAdded: 0,
        synthesesUpdated: data.syntheses.length,
        synthesesDeleted: 0,
        briefsAdded: 0,
        briefsUpdated: data.briefs.length,
        briefsDeleted: 0,
      },
    };
  } catch (error) {
    const formatted = formatSyncError(error);

    updateSyncMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "push",
      lastSyncStatus: "failed",
      lastSyncError: formatted.message,
    });

    addSyncLogEntry({
      timestamp: new Date().toISOString(),
      action: "push",
      status: "failed",
      error: formatted.message,
    });

    return {
      success: false,
      action: "push",
      message: formatted.message,
      error: formatted.hint || formatted.message,
    };
  }
}

export async function pullFromCloud(): Promise<SyncOperationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, action: "pull", message: "Supabase 未配置", error: "未配置同步服务" };
  }

  const session = getSyncSession();
  if (!session) {
    return { success: false, action: "pull", message: "未登录", error: "请先登录同步账号" };
  }

  try {
    const { data, error } = await client
      .from("user_sync_state")
      .select("payload_json, updated_at")
      .eq("user_id", session.userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { success: false, action: "pull", message: "云端无数据", error: "云端没有找到同步数据" };
      }
      throw error;
    }

    if (!data?.payload_json) {
      return { success: false, action: "pull", message: "云端数据为空", error: "云端数据为空" };
    }

    const remoteSnapshot = data.payload_json as AppSnapshot;
    
    // 直接应用远程快照（覆盖本地）
    await applySnapshot(remoteSnapshot);

    // 更新本地元数据
    updateSyncMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "pull",
      lastSyncStatus: "success",
      lastSyncDetails: {
        recordsAdded: remoteSnapshot.records.length,
        recordsUpdated: 0,
        recordsDeleted: 0,
        synthesesAdded: remoteSnapshot.syntheses.length,
        synthesesUpdated: 0,
        synthesesDeleted: 0,
        briefsAdded: remoteSnapshot.briefs.length,
        briefsUpdated: 0,
        briefsDeleted: 0,
      },
    });

    addSyncLogEntry({
      timestamp: new Date().toISOString(),
      action: "pull",
      status: "success",
      details: `拉取了 ${remoteSnapshot.records.length} 条记录, ${remoteSnapshot.syntheses.length} 个汇总, ${remoteSnapshot.briefs.length} 个推进卡`,
    });

    return {
      success: true,
      action: "pull",
      message: "拉取成功",
      stats: {
        recordsAdded: remoteSnapshot.records.length,
        recordsUpdated: 0,
        recordsDeleted: 0,
        synthesesAdded: remoteSnapshot.syntheses.length,
        synthesesUpdated: 0,
        synthesesDeleted: 0,
        briefsAdded: remoteSnapshot.briefs.length,
        briefsUpdated: 0,
        briefsDeleted: 0,
      },
    };
  } catch (error) {
    const formatted = formatSyncError(error);

    updateSyncMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "pull",
      lastSyncStatus: "failed",
      lastSyncError: formatted.message,
    });

    addSyncLogEntry({
      timestamp: new Date().toISOString(),
      action: "pull",
      status: "failed",
      error: formatted.message,
    });

    return {
      success: false,
      action: "pull",
      message: formatted.message,
      error: formatted.hint || formatted.message,
    };
  }
}

export async function bidirectionalSync(): Promise<SyncOperationResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, action: "merge", message: "Supabase 未配置", error: "未配置同步服务" };
  }

  const session = getSyncSession();
  if (!session) {
    return { success: false, action: "merge", message: "未登录", error: "请先登录同步账号" };
  }

  try {
    // 1. 获取本地快照
    const localSnapshot = await createLocalSnapshot();

    // 2. 获取云端快照
    const { data, error } = await client
      .from("user_sync_state")
      .select("payload_json")
      .eq("user_id", session.userId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    let result: MergeResult;

    if (!data?.payload_json) {
      // 云端无数据，直接上传本地
      result = {
        mergedSnapshot: localSnapshot,
        stats: {
          recordsAdded: 0,
          recordsUpdated: localSnapshot.records.length,
          recordsDeleted: 0,
          synthesesAdded: 0,
          synthesesUpdated: localSnapshot.syntheses.length,
          synthesesDeleted: 0,
          briefsAdded: 0,
          briefsUpdated: localSnapshot.briefs.length,
          briefsDeleted: 0,
        },
      };
    } else {
      // 3. 合并快照
      const remoteSnapshot = data.payload_json as AppSnapshot;
      result = mergeSnapshots(localSnapshot, remoteSnapshot);
    }

    // 4. 应用合并结果到本地
    await applySnapshot(result.mergedSnapshot);

    // 5. 上传合并结果到云端
    const { error: upsertError } = await client
      .from("user_sync_state")
      .upsert({
        user_id: session.userId,
        payload_json: result.mergedSnapshot,
        schema_version: CURRENT_SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
        updated_by_device_id: getDeviceId(),
        item_counts: {
          records: result.mergedSnapshot.records.length,
          syntheses: result.mergedSnapshot.syntheses.length,
          briefs: result.mergedSnapshot.briefs.length,
        },
      }, { onConflict: "user_id" });

    if (upsertError) {
      throw upsertError;
    }

    // 6. 更新本地元数据
    updateSyncMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "merge",
      lastSyncStatus: "success",
      lastSyncDetails: result.stats,
    });

    const localCount = localSnapshot.records.filter(r => !r.deletedAt).length;
    const cloudCount = (data?.payload_json as AppSnapshot)?.records?.filter(r => !r.deletedAt).length || 0;
    const mergedCount = result.mergedSnapshot.records.filter(r => !r.deletedAt).length;

    addSyncLogEntry({
      timestamp: new Date().toISOString(),
      action: "merge",
      status: "success",
      details: `本地${localCount}条 → 云端${cloudCount}条 → 合并后${mergedCount}条 | 新增${result.stats.recordsAdded} 更新${result.stats.recordsUpdated} 删除${result.stats.recordsDeleted}`,
    });

    return {
      success: true,
      action: "merge",
      message: "双向同步成功",
      stats: result.stats,
      details: `本地${localCount}条 → 云端${cloudCount}条 → 合并后${mergedCount}条`,
    };
  } catch (error) {
    const formatted = formatSyncError(error);

    updateSyncMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncAction: "merge",
      lastSyncStatus: "failed",
      lastSyncError: formatted.message,
    });

    addSyncLogEntry({
      timestamp: new Date().toISOString(),
      action: "merge",
      status: "failed",
      error: formatted.message,
    });

    return {
      success: false,
      action: "merge",
      message: formatted.message,
      error: formatted.hint || formatted.message,
    };
  }
}

// ============================================================
// 登录相关
// ============================================================

export function initSupabaseClient(): SupabaseClient | null {
  return getSupabaseClient();
}

export async function sendOtpEmail(email: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "同步服务未配置" };
  }

  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      throw error;
    }

    addSyncLogEntry({ action: "send_otp", status: "success", details: `验证码已发送: ${email}` });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "发送失败";
    addSyncLogEntry({ action: "send_otp", status: "failed", error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

export async function sendMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase 未配置" };
  }

  try {
    // 使用 OTP 模式（不设置 emailRedirectTo，强制发送数字验证码）
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // 不设置 emailRedirectTo，确保发送 OTP 而非 Magic Link
      },
    });

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "发送失败";
    return { success: false, error: errorMessage };
  }
}

export async function verifyOtp(email: string, token: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: "Supabase 未配置" };
  }

  try {
    const { data, error } = await client.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      throw error;
    }

    if (data.session) {
      const session: SyncSession = {
        userId: data.session.user.id,
        email: data.session.user.email || email,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at || Math.floor(Date.now() / 1000) + 3600,
      };
      saveSyncSession(session);
      
      // 更新配置中的邮箱
      const config = getSyncConfig();
      config.syncEmail = email;
      saveSyncConfig(config);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "验证失败";
    return { success: false, error: errorMessage };
  }
}

export async function handleAuthCallback(access_token: string, refresh_token: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    return false;
  }

  try {
    const { data, error } = await client.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error || !data.session) {
      return false;
    }

    const session: SyncSession = {
      userId: data.session.user.id,
      email: data.session.user.email || "",
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at || Math.floor(Date.now() / 1000) + 3600,
    };
    saveSyncSession(session);

    // 更新配置中的邮箱
    const config = getSyncConfig();
    config.syncEmail = data.session.user.email || "";
    saveSyncConfig(config);

    return true;
  } catch {
    return false;
  }
}

export async function logoutSync(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    await client.auth.signOut();
  }
  clearSyncSession();
}

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const session = getSyncSession();
  if (!session) {
    return null;
  }

  try {
    const { data, error } = await client.auth.getUser(session.accessToken);
    if (error || !data.user) {
      return null;
    }
    return {
      id: data.user.id,
      email: data.user.email || "",
    };
  } catch {
    return null;
  }
}

// ============================================================
// 本地备份
// ============================================================

const LOCAL_BACKUP_KEY_PREFIX = "thoughtbox_backup_";

export function createLocalBackup(reason: string): string {
  const snapshot = createLocalSnapshot();
  const backupId = `${LOCAL_BACKUP_KEY_PREFIX}${Date.now()}`;
  const backup = {
    id: backupId,
    timestamp: new Date().toISOString(),
    reason,
    snapshot,
  };
  localStorage.setItem(backupId, JSON.stringify(backup));
  
  // 清理旧备份（保留最近 5 个）
  cleanupOldLocalBackups();
  
  return backupId;
}

export function getLocalBackups(): Array<{ id: string; timestamp: string; reason: string }> {
  const backups: Array<{ id: string; timestamp: string; reason: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LOCAL_BACKUP_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || "{}");
        backups.push({
          id: key,
          timestamp: data.timestamp,
          reason: data.reason,
        });
      } catch {
        // 忽略解析失败的备份
      }
    }
  }
  return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function restoreFromLocalBackup(backupId: string): boolean {
  const backupData = localStorage.getItem(backupId);
  if (!backupData) {
    return false;
  }
  
  try {
    const backup = JSON.parse(backupData);
    if (backup.snapshot) {
      applySnapshot(backup.snapshot);
      return true;
    }
  } catch {
    // 恢复失败
  }
  return false;
}

function cleanupOldLocalBackups(): void {
  const backups = getLocalBackups();
  if (backups.length > 5) {
    const toDelete = backups.slice(5);
    toDelete.forEach(b => localStorage.removeItem(b.id));
  }
}
