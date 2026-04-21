import type { AIProfile, AIConfig, ProviderType } from "./types";

const PROFILES_KEY = "thoughtbox_ai_profiles";
const ACTIVE_KEY = "thoughtbox_ai_active_profile_id";
// 旧版单一配置 key（用于迁移）
const LEGACY_CONFIG_KEY = "thoughtbox_ai_config";

// ============================================================
// 生成 ID
// ============================================================

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================================================
// 创建默认 Profile
// ============================================================

function createDefaultProfile(overrides?: Partial<AIProfile>): AIProfile {
  return {
    id: genId(),
    name: "默认配置",
    enabled: false,
    isActive: true,
    apiBaseUrl: "https://api.bltcy.ai",
    apiKey: "",
    model: "gpt-5.4-nano-2026-03-17",
    timeoutMs: 20000,
    fallbackToMock: true,
    allowAsBackup: false,
    providerType: "openai_compatible" as ProviderType,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestStatus: "untested",
    ...overrides,
  };
}

// ============================================================
// 从旧版 AIConfig 迁移
// ============================================================

function migrateFromLegacy(): AIProfile[] {
  try {
    const raw = localStorage.getItem(LEGACY_CONFIG_KEY);
    if (!raw) return [];
    const old: AIConfig = JSON.parse(raw);

    // 只有真正配置过才迁移
    if (!old.apiKey && !old.enabled) return [];

    const profile = createDefaultProfile({
      name: "迁移配置",
      enabled: old.enabled,
      isActive: true,
      apiBaseUrl: old.apiBaseUrl || "https://api.bltcy.ai",
      apiKey: old.apiKey || "",
      model: old.model || "gpt-5.4-nano-2026-03-17",
      timeoutMs: old.timeoutMs || 20000,
      fallbackToMock: old.fallbackToMock !== false,
    });

    // 清除旧配置
    localStorage.removeItem(LEGACY_CONFIG_KEY);

    return [profile];
  } catch {
    return [];
  }
}

// ============================================================
// 加载全部 Profiles
// ============================================================

export function loadProfiles(): AIProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const profiles: AIProfile[] = JSON.parse(raw);
      if (profiles.length > 0) return profiles;
    }
  } catch {
    // 解析失败，忽略
  }

  // 尝试从旧配置迁移
  const migrated = migrateFromLegacy();
  if (migrated.length > 0) {
    saveProfiles(migrated);
  }
  return migrated;
}

export function saveProfiles(profiles: AIProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

// ============================================================
// 当前激活 Profile
// ============================================================

export function getActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProfileId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getActiveProfile(): AIProfile | null {
  const profiles = loadProfiles();
  const activeId = getActiveProfileId();

  // 优先按 ID 找
  if (activeId) {
    const found = profiles.find((p) => p.id === activeId);
    if (found) return found;
  }

  // 回退：找 isActive=true 的
  const marked = profiles.find((p) => p.isActive);
  if (marked) return marked;

  // 回退：第一个启用的
  const enabled = profiles.find((p) => p.enabled);
  if (enabled) return enabled;

  // 兜底：第一个
  return profiles[0] || null;
}

// ============================================================
// CRUD 操作
// ============================================================

export function addProfile(profile: AIProfile): void {
  const profiles = loadProfiles();
  // 如果新 profile 是 active，先取消其他
  if (profile.isActive) {
    profiles.forEach((p) => (p.isActive = false));
    setActiveProfileId(profile.id);
  }
  profiles.push(profile);
  saveProfiles(profiles);
}

export function updateProfile(updated: AIProfile): void {
  const profiles = loadProfiles();
  const idx = profiles.findIndex((p) => p.id === updated.id);
  if (idx === -1) return;

  // 如果设为 active，先取消其他
  if (updated.isActive) {
    profiles.forEach((p) => (p.isActive = false));
    setActiveProfileId(updated.id);
  }

  profiles[idx] = { ...updated, updatedAt: new Date().toISOString() };
  saveProfiles(profiles);
}

export function deleteProfile(id: string): void {
  let profiles = loadProfiles();
  const target = profiles.find((p) => p.id === id);
  if (!target) return;

  profiles = profiles.filter((p) => p.id !== id);

  // 如果删的是当前 active，自动切换
  if (target.isActive && profiles.length > 0) {
    profiles[0].isActive = true;
    setActiveProfileId(profiles[0].id);
  }

  saveProfiles(profiles);
}

export function duplicateProfile(id: string): AIProfile | null {
  const profiles = loadProfiles();
  const source = profiles.find((p) => p.id === id);
  if (!source) return null;

  const dup: AIProfile = {
    ...source,
    id: genId(),
    name: source.name + "（副本）",
    isActive: false,
    lastTestStatus: "untested",
    lastTestAt: undefined,
    lastError: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  profiles.push(dup);
  saveProfiles(profiles);
  return dup;
}

export function switchActiveProfile(id: string): void {
  const profiles = loadProfiles();
  profiles.forEach((p) => {
    p.isActive = p.id === id;
  });
  setActiveProfileId(id);
  saveProfiles(profiles);
}

// ============================================================
// 备用 Profile 选择
// ============================================================

export function getBackupProfile(excludeId: string): AIProfile | null {
  const profiles = loadProfiles();
  const backups = profiles.filter(
    (p) => p.id !== excludeId && p.enabled && p.allowAsBackup
  );
  if (backups.length === 0) return null;

  // 优先选最近测试成功的
  const successBackup = backups.find((p) => p.lastTestStatus === "success");
  if (successBackup) return successBackup;

  // 否则按创建时间排序取第一个
  return backups.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )[0];
}

// ============================================================
// Endpoint 规范化（供 aiService 使用）
// ============================================================

export function normalizeApiEndpoint(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(url)) return url;
  if (/\/v1$/i.test(url)) return url + "/chat/completions";
  return url + "/v1/chat/completions";
}

// ============================================================
// 从 AIProfile 生成旧版 AIConfig（给 aiService 用）
// ============================================================

export function profileToConfig(profile: AIProfile): AIConfig {
  return {
    enabled: profile.enabled,
    apiBaseUrl: profile.apiBaseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
    fallbackToMock: profile.fallbackToMock,
  };
}

export function isProfileConfigured(profile: AIProfile): boolean {
  return profile.enabled && !!profile.apiKey && !!profile.apiBaseUrl && !!profile.model;
}

// ============================================================
// 兼容旧版 AIConfig 接口（用于过渡）
// ============================================================

export function loadAIConfig(): AIConfig {
  const active = getActiveProfile();
  if (active) return profileToConfig(active);
  return {
    enabled: false,
    apiBaseUrl: "https://api.bltcy.ai",
    apiKey: "",
    model: "gpt-5.4-nano-2026-03-17",
    timeoutMs: 20000,
    fallbackToMock: true,
  };
}

export function saveAIConfig(_config: AIConfig): void {
  // 旧版 save 不再生效，提示迁移
  console.warn("ThoughtBox: 请使用多 Profile 管理，旧版 AI 配置已弃用");
}

export function clearAIConfig(): void {
  localStorage.removeItem(PROFILES_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  localStorage.removeItem(LEGACY_CONFIG_KEY);
}

export function isAIConfigured(config: AIConfig): boolean {
  return config.enabled && !!config.apiKey && !!config.apiBaseUrl && !!config.model;
}

// ============================================================
// Profile 测试状态更新
// ============================================================

export function updateProfileTestStatus(
  id: string,
  status: "success" | "failed",
  error?: string
): void {
  const profiles = loadProfiles();
  const profile = profiles.find((p) => p.id === id);
  if (!profile) return;

  profile.lastTestStatus = status;
  profile.lastTestAt = new Date().toISOString();
  profile.lastError = status === "failed" ? error : undefined;
  saveProfiles(profiles);
}
