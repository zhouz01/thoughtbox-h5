export type RecordType = "灵感" | "项目" | "待办" | "参考" | "问题" | "复盘";
export type PromoteLevel = "仅保存" | "建议观察" | "建议行动" | "建议立项";
export type AiStatus = "pending" | "done";
export type OrganizeSource = "mock" | "ai";
export type ProviderType = "openai_compatible" | "custom";
export type TestStatus = "success" | "failed" | "untested";
export type FeedbackStatus = "未反馈" | "准确" | "一般" | "不合适";

// 同步状态类型
export type SyncStatus = "未配置" | "未登录" | "已连接" | "同步中" | "同步成功" | "同步失败";

export interface AIConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fallbackToMock: boolean;
}

export interface AIProfile {
  id: string;
  name: string;
  enabled: boolean;
  isActive: boolean;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fallbackToMock: boolean;
  allowAsBackup: boolean;
  providerType: ProviderType;
  createdAt: string;
  updatedAt: string;
  lastTestStatus?: TestStatus;
  lastTestAt?: string;
  lastError?: string;
}

export interface AIOriginalResult {
  title: string;
  summary: string;
  type: string;
  tags: string[];
  topic: string;
  promoteLevel: string;
  suggestions: string[];
}

export interface ThoughtRecord {
  id: string;
  rawText: string;
  createdAt: string;
  updatedAt: string;
  aiStatus: AiStatus;
  aiTitle: string;
  aiSummary: string;
  type: RecordType;
  tags: string[];
  topic: string;
  promoteLevel: PromoteLevel;
  suggestions: string[];
  archived: boolean;
  organizeSource?: OrganizeSource;
  organizeError?: string;
  aiProfileId?: string;
  aiProfileName?: string;
  aiModel?: string;
  // V1.4 编辑 + 反馈 + 偏好
  aiOriginalResult?: AIOriginalResult;
  userEdited?: boolean;
  userEditedAt?: string;
  editedFields?: string[];
  feedbackStatus?: FeedbackStatus;
  feedbackReasons?: string[];
  preferenceApplied?: boolean;
  // V1.7 软删除标记（用于同步）
  deletedAt?: string;
}

// ============================================================
// 本地偏好数据结构
// ============================================================

export interface TopicAlias {
  from: string;
  to: string;
  count: number;
}

export interface TagsByTopic {
  topic: string;
  tags: string[];
  count: number;
}

export interface AcceptedExample {
  id: string;
  rawText: string;
  result: {
    title: string;
    summary: string;
    type: string;
    tags: string[];
    topic: string;
    promoteLevel: string;
    suggestions: string[];
  };
  createdAt: string;
  source: "edited" | "liked";
}

export interface AIPreferences {
  bannedGenericTags: string[];
  preferredTopicAliases: TopicAlias[];
  preferredTagsByTopic: TagsByTopic[];
  titleBlacklistPatterns: string[];
  suggestionBlacklistPatterns: string[];
  acceptedExamples: AcceptedExample[];
  lastUpdatedAt: string;
}

export const RECORD_TYPES: RecordType[] = ["灵感", "项目", "待办", "参考", "问题", "复盘"];
export const PROMOTE_LEVELS: PromoteLevel[] = ["仅保存", "建议观察", "建议行动", "建议立项"];

export const FEEDBACK_REASONS = [
  "标题太泛",
  "摘要不清楚",
  "类型不对",
  "标签太泛",
  "主题不准",
  "建议太空",
  "推进等级不合适",
  "其他",
] as const;

/* 类型配色——更沉稳、低饱和度 */
export const TYPE_COLORS: Record<RecordType, string> = {
  灵感: "bg-violet-50 text-violet-600",
  项目: "bg-blue-50 text-blue-600",
  待办: "bg-amber-50 text-amber-600",
  参考: "bg-teal-50 text-teal-600",
  问题: "bg-rose-50 text-rose-600",
  复盘: "bg-slate-100 text-slate-600",
};

/* 推进等级配色——更克制 */
export const PROMOTE_COLORS: Record<PromoteLevel, string> = {
  仅保存: "bg-stone-50 text-stone-500",
  建议观察: "bg-amber-50 text-amber-600",
  建议行动: "bg-emerald-50 text-emerald-600",
  建议立项: "bg-blue-50 text-blue-600",
};

/* 推进等级指示色（左边竖线） */
export const PROMOTE_DOT: Record<PromoteLevel, string> = {
  仅保存: "bg-stone-300",
  建议观察: "bg-amber-400",
  建议行动: "bg-emerald-400",
  建议立项: "bg-blue-400",
};

// ============================================================
// 批量整理 / 周回顾：Synthesis 数据对象
// ============================================================

export type SynthesisMode = "selection" | "weekly_review";
export type SynthesisStatus = "pending" | "done" | "error";

export interface Synthesis {
  id: string;
  mode: SynthesisMode;
  title: string;
  overview: string;
  keyThemes: string[];
  repeatedPatterns: string[];
  openQuestions: string[];
  opportunities: string[];
  nextActions: string[];
  oneLineSummary: string;
  sourceRecordIds: string[];
  sourceRecordCount: number;
  weekKey?: string;         // 如 "2026-W17"，仅 weekly_review
  sourceTopic?: string;     // 仅 selection 从某个主题发起
  status: SynthesisStatus;
  source: "ai" | "mock";
  aiProfileId?: string;
  aiProfileName?: string;
  aiModel?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  // V1.7 软删除标记（用于同步）
  deletedAt?: string;
}

// ============================================================
// 推进卡 / Project Brief 数据对象
// ============================================================

export type BriefStatus = "草稿" | "进行中" | "暂停" | "已完成" | "已归档";
export type BriefSourceType = "record" | "synthesis";

export interface BriefActionItem {
  id: string;
  content: string;
  done: boolean;
  source: "ai" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface BriefOriginalResult {
  title: string;
  summary: string;
  problemStatement: string;
  objective: string;
  targetContext: string;
  whyNow: string;
  scopeNow: string[];
  scopeLater: string[];
  deliverables: string[];
  risksAndQuestions: string[];
  nextActions: string[];
}

export interface ProjectBrief {
  id: string;
  title: string;
  summary: string;
  problemStatement: string;
  objective: string;
  targetContext: string;
  whyNow: string;
  scopeNow: string[];
  scopeLater: string[];
  deliverables: string[];
  risksAndQuestions: string[];
  nextActions: BriefActionItem[];
  topic?: string;
  status: BriefStatus;
  sourceType: BriefSourceType;
  sourceRecordIds: string[];
  sourceSynthesisId?: string;
  sourceSummary?: string;
  source: "ai" | "mock";
  aiProfileId?: string;
  aiProfileName?: string;
  aiModel?: string;
  error?: string;
  aiOriginalBriefResult?: BriefOriginalResult;
  userEdited?: boolean;
  userEditedAt?: string;
  editedFields?: string[];
  createdAt: string;
  updatedAt: string;
  // V1.7 软删除标记（用于同步）
  deletedAt?: string;
}

export const BRIEF_STATUSES: BriefStatus[] = ["草稿", "进行中", "暂停", "已完成", "已归档"];

export const BRIEF_STATUS_COLORS: Record<BriefStatus, string> = {
  草稿: "bg-stone-100 text-stone-500",
  进行中: "bg-blue-50 text-blue-600",
  暂停: "bg-amber-50 text-amber-600",
  已完成: "bg-emerald-50 text-emerald-600",
  已归档: "bg-stone-50 text-stone-400",
};

// ============================================================
// V1.7 云同步数据对象
// ============================================================

export type SyncAction = "push" | "pull" | "merge";

export interface AppSnapshot {
  schemaVersion: number;
  exportedAt: string;
  deviceId: string;
  deviceName: string;
  appVersion?: string;
  records: ThoughtRecord[];
  syntheses: Synthesis[];
  briefs: ProjectBrief[];
  preferences: AIPreferences;
  meta: {
    recordCount: number;
    synthesisCount: number;
    briefCount: number;
  };
}

export interface SyncConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  syncEmail?: string;
  autoCheckOnOpen: boolean;
  autoBackupBeforeSync: boolean;
}

export interface SyncSession {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SyncMeta {
  deviceId: string;
  deviceName: string;
  lastSyncAt?: string;
  lastSyncAction?: SyncAction;
  lastSyncStatus?: "success" | "failed";
  lastSyncError?: string;
  lastSyncDetails?: {
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

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  action: SyncAction;
  status: "success" | "failed";
  error?: string;
  details?: string;
}

// 云端数据结构（对应 Supabase 表）
export interface CloudSyncState {
  user_id: string;
  payload_json: AppSnapshot;
  schema_version: number;
  updated_at: string;
  updated_by_device_id: string;
  item_counts: {
    records: number;
    syntheses: number;
    briefs: number;
  };
}

export interface CloudSyncBackup {
  id: string;
  user_id: string;
  payload_json: AppSnapshot;
  created_at: string;
  created_by_device_id: string;
  reason: string;
}
