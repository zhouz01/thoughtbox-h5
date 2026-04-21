import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ThoughtRecord, RecordType, AIProfile, AIPreferences, FeedbackStatus, Synthesis, ProjectBrief } from "./types";
import { RECORD_TYPES } from "./types";
import { loadVisibleRecords, loadRecords, saveRecords, addRecord as storageAdd, updateRecord as storageUpdate, deleteRecord as storageDelete } from "./storage";
import { createPendingRecord, organizeRecord } from "./ai";
import { createMockRecords } from "./mockData";
import {
  loadProfiles,
  saveProfiles,
  getActiveProfile,
  switchActiveProfile,
  addProfile,
  updateProfile as storageUpdateProfile,
  deleteProfile as storageDeleteProfile,
  duplicateProfile as storageDuplicateProfile,
  getBackupProfile,
  isProfileConfigured,
  profileToConfig,
  updateProfileTestStatus,
} from "./aiConfig";
import { organizeWithProfile, testProfileConnection, extractTopicContext, buildPreferenceContext, generateSynthesisFromRecords, generateMockSynthesis, generateBriefFromRecord, generateBriefFromSynthesis } from "./aiService";
import type { PreferenceContext, SynthesisInput } from "./aiService";
import { loadPreferences, savePreferences, clearAllPreferences, clearExamples, clearTagPreferences, clearTopicAliases, getPreferenceStats } from "./preferences";
import { learnFromEdit, learnFromLike, learnFromFeedback } from "./preferenceLearning";
import { generateId } from "./storage";
import {
  loadVisibleSyntheses,
  saveSyntheses,
  addSynthesis,
  updateSynthesis as storageUpdateSynthesis,
  deleteSynthesis as storageDeleteSynthesis,
  getWeeklySynthesis,
  getAllWeeklySyntheses,
  getCurrentWeekKey,
} from "./synthesisStorage";
import {
  loadVisibleBriefs,
  saveBriefs,
  addBrief,
  updateBrief as storageUpdateBrief,
  deleteBrief as storageDeleteBrief,
  getBriefById,
  getAllBriefsSorted,
} from "./briefStorage";

interface AppContextType {
  records: ThoughtRecord[];
  addRecord: (rawText: string) => void;
  updateRecord: (record: ThoughtRecord) => void;
  deleteRecord: (id: string) => void;
  getRecord: (id: string) => ThoughtRecord | undefined;
  reOrganizeRecord: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterType: RecordType | "全部";
  setFilterType: (t: RecordType | "全部") => void;
  filteredRecords: ThoughtRecord[];
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  importMockRecords: () => void;
  importRecordsMerge: (data: ThoughtRecord[]) => void;
  importRecordsOverwrite: (data: ThoughtRecord[]) => void;
  exportRecords: () => string;
  // AI Profiles
  profiles: AIProfile[];
  activeProfile: AIProfile | null;
  addAIProfile: (profile: AIProfile) => void;
  updateAIProfile: (profile: AIProfile) => void;
  deleteAIProfile: (id: string) => void;
  duplicateAIProfile: (id: string) => AIProfile | null;
  switchAIProfile: (id: string) => void;
  testConnection: (profile: AIProfile) => Promise<{ ok: boolean; message: string }>;
  // 整理状态提示
  organizeStatus: string | null;
  // 同步后刷新状态
  reloadFromStorage: () => void;
  // 偏好系统
  preferences: AIPreferences;
  refreshPreferences: () => void;
  saveEditWithPreference: (record: ThoughtRecord, editedFields: string[], rememberAsPreference: boolean) => void;
  submitFeedback: (recordId: string, status: FeedbackStatus, reasons: string[]) => void;
  clearAllPrefs: () => void;
  clearExamplesPrefs: () => void;
  clearTagPrefs: () => void;
  clearTopicAliasPrefs: () => void;
  preferenceStats: ReturnType<typeof getPreferenceStats>;
  // Synthesis 批量整理
  syntheses: Synthesis[];
  generateSelectionSynthesis: (recordIds: string[], sourceTopic?: string) => Promise<Synthesis | null>;
  generateWeeklyReview: () => Promise<Synthesis | null>;
  deleteSynthesisById: (id: string) => void;
  getCurrentWeeklySynthesis: () => Synthesis | undefined;
  getWeeklySyntheses: () => Synthesis[];
  getSynthesis: (id: string) => Synthesis | undefined;
  batchSetTopic: (recordIds: string[], topic: string) => void;
  batchArchive: (recordIds: string[]) => void;
  // Brief 推进卡
  briefs: ProjectBrief[];
  generateBriefFromRecordData: (recordId: string) => Promise<ProjectBrief | null>;
  generateBriefFromSynthesisData: (synthesisId: string) => Promise<ProjectBrief | null>;
  updateBrief: (brief: ProjectBrief) => void;
  deleteBriefById: (id: string) => void;
  getBrief: (id: string) => ProjectBrief | undefined;
  getAllBriefs: () => ProjectBrief[];
  toggleBriefAction: (briefId: string, actionId: string) => void;
  addBriefAction: (briefId: string, content: string) => void;
  updateBriefAction: (briefId: string, actionId: string, content: string) => void;
  deleteBriefAction: (briefId: string, actionId: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<ThoughtRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<RecordType | "全部">("全部");
  const [showArchived, setShowArchived] = useState(false);
  const [profiles, setProfiles] = useState<AIProfile[]>(() => loadProfiles());
  const [organizeStatus, setOrganizeStatus] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AIPreferences>(() => loadPreferences());
  const [syntheses, setSyntheses] = useState<Synthesis[]>(() => loadVisibleSyntheses());
  const [briefs, setBriefs] = useState<ProjectBrief[]>(() => loadVisibleBriefs());

  // 初始化数据
  useEffect(() => {
    const stored = loadVisibleRecords();
    setRecords(stored);
  }, []);

  // 自动清除状态提示
  useEffect(() => {
    if (!organizeStatus) return;
    const timer = setTimeout(() => setOrganizeStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [organizeStatus]);

  // 当前激活 Profile
  const activeProfile = getActiveProfile();

  // ============================================================
  // 核心：执行整理（多 Profile 降级策略）
  // ============================================================

  const performOrganize = useCallback(async (record: ThoughtRecord) => {
    const profile = getActiveProfile();
    const currentPrefs = loadPreferences();

    // 有启用的 Profile，走真实 AI
    if (profile && isProfileConfigured(profile)) {
      try {
        const allRecords = loadRecords();
        const topicCtx = extractTopicContext(allRecords.filter((r) => !r.archived && r.aiStatus === "done"));
        const prefCtx = buildPreferenceContext(currentPrefs);

        const result = await organizeWithProfile(record.rawText, profile, topicCtx, prefCtx);
        const organized: ThoughtRecord = {
          ...record,
          aiStatus: "done",
          aiTitle: result.title,
          aiSummary: result.summary,
          type: result.type,
          aiSubType: result.aiSubType,
          typeConfidence: result.typeConfidence,
          typeReason: result.typeReason,
          tags: result.tags,
          topic: result.topic,
          promoteLevel: result.promoteLevel,
          suggestions: result.suggestions,
          organizeSource: "ai",
          organizeError: undefined,
          aiProfileId: profile.id,
          aiProfileName: profile.name,
          aiModel: profile.model,
          aiOriginalResult: {
            title: result.title,
            summary: result.summary,
            type: result.type,
            aiSubType: result.aiSubType,
            typeConfidence: result.typeConfidence,
            typeReason: result.typeReason,
            tags: result.tags,
            topic: result.topic,
            promoteLevel: result.promoteLevel,
            suggestions: result.suggestions,
          },
          userEdited: false,
          userEditedAt: undefined,
          editedFields: [],
          feedbackStatus: "未反馈",
          feedbackReasons: [],
          preferenceApplied: Object.keys(prefCtx.bannedGenericTags).length > 0 || prefCtx.preferredTopicAliases.length > 0 || prefCtx.fewShotExamples.length > 0,
          updatedAt: new Date().toISOString(),
        };
        storageUpdate(organized);
        setRecords((prev) => prev.map((r) => (r.id === organized.id ? organized : r)));
        setOrganizeStatus("已重新整理");
        return;
      } catch (primaryError) {
        const errorMsg = primaryError instanceof Error ? primaryError.message : "主配置调用失败";

        // 尝试备用 Profile
        const backup = getBackupProfile(profile.id);
        if (backup && isProfileConfigured(backup)) {
          try {
            const allRecords = loadRecords();
            const topicCtx = extractTopicContext(allRecords.filter((r) => !r.archived && r.aiStatus === "done"));
            const prefCtx = buildPreferenceContext(currentPrefs);

            const result = await organizeWithProfile(record.rawText, backup, topicCtx, prefCtx);
            const organized: ThoughtRecord = {
              ...record,
              aiStatus: "done",
              aiTitle: result.title,
              aiSummary: result.summary,
              type: result.type,
              aiSubType: result.aiSubType,
              typeConfidence: result.typeConfidence,
              typeReason: result.typeReason,
              tags: result.tags,
              topic: result.topic,
              promoteLevel: result.promoteLevel,
              suggestions: result.suggestions,
              organizeSource: "ai",
              organizeError: undefined,
              aiProfileId: backup.id,
              aiProfileName: backup.name,
              aiModel: backup.model,
              aiOriginalResult: {
                title: result.title,
                summary: result.summary,
                type: result.type,
                aiSubType: result.aiSubType,
                typeConfidence: result.typeConfidence,
                typeReason: result.typeReason,
                tags: result.tags,
                topic: result.topic,
                promoteLevel: result.promoteLevel,
                suggestions: result.suggestions,
              },
              userEdited: false,
              userEditedAt: undefined,
              editedFields: [],
              feedbackStatus: "未反馈",
              feedbackReasons: [],
              preferenceApplied: Object.keys(prefCtx.bannedGenericTags).length > 0 || prefCtx.preferredTopicAliases.length > 0 || prefCtx.fewShotExamples.length > 0,
              updatedAt: new Date().toISOString(),
            };
            storageUpdate(organized);
            setRecords((prev) => prev.map((r) => (r.id === organized.id ? organized : r)));
            setOrganizeStatus("主配置调用失败，已自动尝试备用配置");
            return;
          } catch {
            // 备用也失败，继续走 mock 降级
          }
        }

        // mock 降级
        if (profile.fallbackToMock) {
          const mockResult = organizeRecord(record);
          const fallback: ThoughtRecord = {
            ...mockResult,
            organizeSource: "mock",
            organizeError: `AI 服务暂时不可用，已使用本地整理：${errorMsg}`,
          };
          storageUpdate(fallback);
          setRecords((prev) => prev.map((r) => (r.id === fallback.id ? fallback : r)));
          setOrganizeStatus("AI 服务暂时不可用，已使用本地整理");
          return;
        }

        // 不回退
        const failed: ThoughtRecord = {
          ...record,
          aiStatus: "done",
          organizeSource: "ai",
          organizeError: errorMsg,
          aiProfileId: profile.id,
          aiProfileName: profile.name,
          aiModel: profile.model,
          updatedAt: new Date().toISOString(),
        };
        storageUpdate(failed);
        setRecords((prev) => prev.map((r) => (r.id === failed.id ? failed : r)));
        setOrganizeStatus("重新整理失败，已保留原结果");
        return;
      }
    }

    // 未配置真实 AI，使用 mock
      const mockResult = organizeRecord(record);
      const organized: ThoughtRecord = {
        ...mockResult,
        organizeSource: "mock",
        aiOriginalResult: {
          title: mockResult.aiTitle,
          summary: mockResult.aiSummary,
          type: mockResult.type,
          aiSubType: mockResult.aiSubType,
          tags: mockResult.tags,
          topic: mockResult.topic,
          promoteLevel: mockResult.promoteLevel,
          suggestions: mockResult.suggestions,
        },
        userEdited: false,
        feedbackStatus: "未反馈",
        feedbackReasons: [],
      };
    storageUpdate(organized);
    setRecords((prev) => prev.map((r) => (r.id === organized.id ? organized : r)));
  }, []);

  const addRecord = useCallback((rawText: string) => {
    const pending = createPendingRecord(rawText);
    storageAdd(pending);
    setRecords((prev) => [pending, ...prev]);

    const profile = getActiveProfile();
    if (profile && isProfileConfigured(profile)) {
      performOrganize(pending);
    } else {
      setTimeout(() => {
        performOrganize(pending);
      }, 1000 + Math.random() * 500);
    }
  }, [performOrganize]);

  const updateRecordFn = useCallback((record: ThoughtRecord) => {
    storageUpdate(record);
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
  }, []);

  const deleteRecordFn = useCallback((id: string) => {
    storageDelete(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const getRecord = useCallback((id: string) => records.find((r) => r.id === id), [records]);

  const reOrganizeRecord = useCallback((id: string) => {
    setRecords((prev) => {
      const record = prev.find((r) => r.id === id);
      if (!record) return prev;

      const reset: ThoughtRecord = {
        ...record,
        aiStatus: "pending",
        aiTitle: "",
        aiSummary: "",
        type: "随记",
        aiSubType: undefined,
        typeConfidence: undefined,
        typeReason: undefined,
        tags: [],
        topic: "",
        promoteLevel: "仅保存",
        suggestions: [],
        organizeSource: undefined,
        organizeError: undefined,
        aiProfileId: undefined,
        aiProfileName: undefined,
        aiModel: undefined,
      };
      storageUpdate(reset);

      const profile = getActiveProfile();
      if (profile && isProfileConfigured(profile)) {
        performOrganize(reset);
      } else {
        setTimeout(() => {
          performOrganize(reset);
        }, 1000 + Math.random() * 500);
      }

      return prev.map((r) => (r.id === id ? reset : r));
    });
  }, [performOrganize]);

  const importMockRecords = useCallback(() => {
    const mock = createMockRecords();
    saveRecords([...mock, ...loadVisibleRecords()]);
    setRecords((prev) => [...mock, ...prev]);
  }, []);

  const importRecordsMerge = useCallback((data: ThoughtRecord[]) => {
    const existingIds = new Set(loadVisibleRecords().map((r) => r.id));
    const newRecords = data.filter((r) => !existingIds.has(r.id));
    const merged = [...newRecords, ...loadVisibleRecords()];
    saveRecords(merged);
    setRecords(merged);
  }, []);

  const importRecordsOverwrite = useCallback((data: ThoughtRecord[]) => {
    saveRecords(data);
    setRecords(data);
  }, []);

  const exportRecords = useCallback(() => {
    return JSON.stringify(loadVisibleRecords(), null, 2);
  }, []);

  // ============================================================
  // AI Profile 操作
  // ============================================================

  const addAIProfileFn = useCallback((profile: AIProfile) => {
    addProfile(profile);
    setProfiles(loadProfiles());
  }, []);

  const updateAIProfileFn = useCallback((profile: AIProfile) => {
    storageUpdateProfile(profile);
    setProfiles(loadProfiles());
  }, []);

  const deleteAIProfileFn = useCallback((id: string) => {
    storageDeleteProfile(id);
    setProfiles(loadProfiles());
  }, []);

  const duplicateAIProfileFn = useCallback((id: string) => {
    const dup = storageDuplicateProfile(id);
    setProfiles(loadProfiles());
    return dup;
  }, []);

  const switchAIProfileFn = useCallback((id: string) => {
    switchActiveProfile(id);
    setProfiles(loadProfiles());
  }, []);

  const testConnectionFn = useCallback(async (profile: AIProfile) => {
    const result = await testProfileConnection(profile);
    // 更新测试状态
    updateProfileTestStatus(profile.id, result.ok ? "success" : "failed", result.ok ? undefined : result.message);
    setProfiles(loadProfiles());
    return result;
  }, []);

  const filteredRecords = records
    .filter((r) => {
      if (r.deletedAt) return false;
      if (!showArchived && r.archived) return false;
      if (showArchived && !r.archived) return false;
      if (filterType !== "全部" && r.type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          r.rawText.toLowerCase().includes(q) ||
          r.aiTitle.toLowerCase().includes(q) ||
          r.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          r.topic.toLowerCase().includes(q) ||
          (r.aiSubType && r.aiSubType.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // ============================================================
  // 偏好系统操作
  // ============================================================

  const refreshPreferencesFn = useCallback(() => {
    setPreferences(loadPreferences());
  }, []);

  const saveEditWithPreferenceFn = useCallback((record: ThoughtRecord, editedFields: string[], rememberAsPreference: boolean) => {
    // 更新记录本身
    const updated: ThoughtRecord = {
      ...record,
      userEdited: true,
      userEditedAt: new Date().toISOString(),
      editedFields,
      updatedAt: new Date().toISOString(),
    };
    storageUpdate(updated);
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));

    // 如果开启偏好记忆，触发学习
    if (rememberAsPreference && editedFields.length > 0) {
      const newPrefs = learnFromEdit(updated, editedFields);
      setPreferences(newPrefs);
    }
  }, []);

  const submitFeedbackFn = useCallback((recordId: string, status: FeedbackStatus, reasons: string[]) => {
    setRecords((prev) => {
      const record = prev.find((r) => r.id === recordId);
      if (!record) return prev;

      const updated: ThoughtRecord = {
        ...record,
        feedbackStatus: status,
        feedbackReasons: reasons,
        updatedAt: new Date().toISOString(),
      };
      storageUpdate(updated);

      // 偏好学习
      if (status === "准确") {
        const newPrefs = learnFromLike(updated);
        setPreferences(newPrefs);
      } else if (status === "一般" || status === "不合适") {
        if (reasons.length > 0) {
          const newPrefs = learnFromFeedback(updated, status, reasons);
          setPreferences(newPrefs);
        }
      }

      return prev.map((r) => (r.id === recordId ? updated : r));
    });
  }, []);

  const clearAllPrefsFn = useCallback(() => {
    clearAllPreferences();
    setPreferences(loadPreferences());
  }, []);

  const clearExamplesPrefsFn = useCallback(() => {
    const updated = clearExamples(preferences);
    savePreferences(updated);
    setPreferences(updated);
  }, [preferences]);

  const clearTagPrefsFn = useCallback(() => {
    const updated = clearTagPreferences(preferences);
    savePreferences(updated);
    setPreferences(updated);
  }, [preferences]);

  const clearTopicAliasPrefsFn = useCallback(() => {
    const updated = clearTopicAliases(preferences);
    savePreferences(updated);
    setPreferences(updated);
  }, [preferences]);

  const preferenceStatsValue = getPreferenceStats(preferences);

  const reloadFromStorage = useCallback(() => {
    setRecords(loadVisibleRecords());
    setSyntheses(loadVisibleSyntheses());
    setBriefs(loadVisibleBriefs());
    setPreferences(loadPreferences());
    setProfiles(loadProfiles());
  }, []);

  // ============================================================
  // Synthesis 批量整理操作
  // ============================================================

  const generateSelectionSynthesisFn = useCallback(async (recordIds: string[], sourceTopic?: string): Promise<Synthesis | null> => {
    const selectedRecords = records.filter((r) => recordIds.includes(r.id));
    if (selectedRecords.length < 2) return null;

    const inputs: SynthesisInput[] = selectedRecords.map((r) => ({
      rawText: r.rawText,
      aiTitle: r.aiTitle,
      aiSummary: r.aiSummary,
      type: r.type,
      tags: r.tags,
      topic: r.topic,
      promoteLevel: r.promoteLevel,
    }));

    const profile = getActiveProfile();
    const currentPrefs = loadPreferences();
    const allRecords = loadRecords();
    const topicCtx = extractTopicContext(allRecords.filter((r) => !r.archived && r.aiStatus === "done"));
    const prefCtx = buildPreferenceContext(currentPrefs);

    try {
      const result = await generateSynthesisFromRecords(
        inputs,
        recordIds,
        "selection",
        profile,
        topicCtx,
        prefCtx,
        sourceTopic,
      );
      addSynthesis(result);
      setSyntheses(loadSyntheses());
      setOrganizeStatus("汇总已生成");
      return result;
    } catch {
      setOrganizeStatus("汇总生成失败");
      return null;
    }
  }, [records]);

  const generateWeeklyReviewFn = useCallback(async (): Promise<Synthesis | null> => {
    const weekKey = getCurrentWeekKey();
    const now = new Date();
    // 本周范围：周一到周日
    const dayOfWeek = now.getDay() || 7; // 0=Sun→7
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const weekRecords = records.filter((r) => {
      if (r.archived) return false;
      const d = new Date(r.createdAt);
      return d >= monday && d <= sunday;
    });

    if (weekRecords.length < 1) return null;

    const inputs: SynthesisInput[] = weekRecords.map((r) => ({
      rawText: r.rawText,
      aiTitle: r.aiTitle,
      aiSummary: r.aiSummary,
      type: r.type,
      tags: r.tags,
      topic: r.topic,
      promoteLevel: r.promoteLevel,
    }));

    const recordIds = weekRecords.map((r) => r.id);
    const profile = getActiveProfile();
    const currentPrefs = loadPreferences();
    const allRecords = loadRecords();
    const topicCtx = extractTopicContext(allRecords.filter((r) => !r.archived && r.aiStatus === "done"));
    const prefCtx = buildPreferenceContext(currentPrefs);

    try {
      const result = await generateSynthesisFromRecords(
        inputs,
        recordIds,
        "weekly_review",
        profile,
        topicCtx,
        prefCtx,
        undefined,
        weekKey,
      );
      addSynthesis(result);
      setSyntheses(loadSyntheses());
      setOrganizeStatus("本周回顾已生成");
      return result;
    } catch {
      setOrganizeStatus("周回顾生成失败");
      return null;
    }
  }, [records]);

  const deleteSynthesisByIdFn = useCallback((id: string) => {
    storageDeleteSynthesis(id);
    setSyntheses(loadSyntheses());
  }, []);

  const getCurrentWeeklySynthesisFn = useCallback((): Synthesis | undefined => {
    const weekKey = getCurrentWeekKey();
    return getWeeklySynthesis(weekKey);
  }, []);

  const getWeeklySynthesesFn = useCallback((): Synthesis[] => {
    return getAllWeeklySyntheses();
  }, []);

  const getSynthesisFn = useCallback((id: string): Synthesis | undefined => {
    return loadSyntheses().find((s) => s.id === id);
  }, []);

  const batchSetTopicFn = useCallback((recordIds: string[], topic: string) => {
    const updatedRecords = records.map((r) => {
      if (!recordIds.includes(r.id)) return r;
      const updated: ThoughtRecord = {
        ...r,
        topic,
        updatedAt: new Date().toISOString(),
      };
      storageUpdate(updated);
      return updated;
    });
    setRecords(updatedRecords);
  }, [records]);

  const batchArchiveFn = useCallback((recordIds: string[]) => {
    const updatedRecords = records.map((r) => {
      if (!recordIds.includes(r.id)) return r;
      const updated: ThoughtRecord = {
        ...r,
        archived: true,
        updatedAt: new Date().toISOString(),
      };
      storageUpdate(updated);
      return updated;
    });
    setRecords(updatedRecords);
    setOrganizeStatus(`已归档 ${recordIds.length} 条记录`);
  }, [records]);

  // ============================================================
  // Brief 推进卡操作
  // ============================================================

  const generateBriefFromRecordFn = useCallback(async (recordId: string): Promise<ProjectBrief | null> => {
    const record = records.find((r) => r.id === recordId);
    if (!record) return null;

    const profile = getActiveProfile();
    const currentPrefs = loadPreferences();
    const allRecords = loadRecords();
    const topicCtx = extractTopicContext(allRecords.filter((r) => !r.archived && r.aiStatus === "done"));
    const prefCtx = buildPreferenceContext(currentPrefs);

    try {
      const brief = await generateBriefFromRecord(record, profile, topicCtx, prefCtx);
      addBrief(brief);
      setBriefs(loadVisibleBriefs());
      setOrganizeStatus("已生成 Brief");
      return brief;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setOrganizeStatus(`Brief 生成失败：${msg}`);
      console.error("Brief 生成失败:", err);
      return null;
    }
  }, [records]);

  const generateBriefFromSynthesisFn = useCallback(async (synthesisId: string): Promise<ProjectBrief | null> => {
    const synthesis = loadSyntheses().find((s) => s.id === synthesisId);
    if (!synthesis) return null;

    const profile = getActiveProfile();
    const currentPrefs = loadPreferences();
    const allRecords = loadRecords();
    const topicCtx = extractTopicContext(allRecords.filter((r) => !r.archived && r.aiStatus === "done"));
    const prefCtx = buildPreferenceContext(currentPrefs);

    try {
      const brief = await generateBriefFromSynthesis(synthesis, profile, topicCtx, prefCtx);
      addBrief(brief);
      setBriefs(loadVisibleBriefs());
      setOrganizeStatus("已生成 Brief");
      return brief;
    } catch {
      setOrganizeStatus("Brief 生成失败");
      return null;
    }
  }, []);

  const updateBriefFn = useCallback((brief: ProjectBrief) => {
    storageUpdateBrief(brief);
    setBriefs(loadVisibleBriefs());
  }, []);

  const deleteBriefByIdFn = useCallback((id: string) => {
    storageDeleteBrief(id);
    setBriefs(loadVisibleBriefs());
  }, []);

  const getBriefFn = useCallback((id: string): ProjectBrief | undefined => {
    return getBriefById(id);
  }, []);

  const getAllBriefsFn = useCallback((): ProjectBrief[] => {
    return getAllBriefsSorted();
  }, []);

  const toggleBriefActionFn = useCallback((briefId: string, actionId: string) => {
    const brief = getBriefById(briefId);
    if (!brief) return;
    const now = new Date().toISOString();
    const updatedActions = brief.nextActions.map((a) =>
      a.id === actionId ? { ...a, done: !a.done, updatedAt: now } : a
    );
    const updated: ProjectBrief = {
      ...brief,
      nextActions: updatedActions,
      updatedAt: now,
    };
    storageUpdateBrief(updated);
    setBriefs(loadVisibleBriefs());
  }, []);

  const addBriefActionFn = useCallback((briefId: string, content: string) => {
    const brief = getBriefById(briefId);
    if (!brief || !content.trim()) return;
    const now = new Date().toISOString();
    const newAction: import("./types").BriefActionItem = {
      id: generateId(),
      content: content.trim(),
      done: false,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    };
    const updated: ProjectBrief = {
      ...brief,
      nextActions: [...brief.nextActions, newAction],
      updatedAt: now,
    };
    storageUpdateBrief(updated);
    setBriefs(loadVisibleBriefs());
  }, []);

  const updateBriefActionFn = useCallback((briefId: string, actionId: string, content: string) => {
    const brief = getBriefById(briefId);
    if (!brief) return;
    const now = new Date().toISOString();
    const updatedActions = brief.nextActions.map((a) =>
      a.id === actionId ? { ...a, content, updatedAt: now } : a
    );
    const updated: ProjectBrief = {
      ...brief,
      nextActions: updatedActions,
      updatedAt: now,
    };
    storageUpdateBrief(updated);
    setBriefs(loadVisibleBriefs());
  }, []);

  const deleteBriefActionFn = useCallback((briefId: string, actionId: string) => {
    const brief = getBriefById(briefId);
    if (!brief) return;
    const now = new Date().toISOString();
    const updated: ProjectBrief = {
      ...brief,
      nextActions: brief.nextActions.filter((a) => a.id !== actionId),
      updatedAt: now,
    };
    storageUpdateBrief(updated);
    setBriefs(loadVisibleBriefs());
  }, []);

  return (
    <AppContext.Provider
      value={{
        records,
        addRecord,
        updateRecord: updateRecordFn,
        deleteRecord: deleteRecordFn,
        getRecord,
        reOrganizeRecord,
        searchQuery,
        setSearchQuery,
        filterType,
        setFilterType,
        filteredRecords,
        showArchived,
        setShowArchived,
        importMockRecords,
        importRecordsMerge,
        importRecordsOverwrite,
        exportRecords,
        profiles,
        activeProfile,
        addAIProfile: addAIProfileFn,
        updateAIProfile: updateAIProfileFn,
        deleteAIProfile: deleteAIProfileFn,
        duplicateAIProfile: duplicateAIProfileFn,
        switchAIProfile: switchAIProfileFn,
        testConnection: testConnectionFn,
        organizeStatus,
        reloadFromStorage,
        // 偏好系统
        preferences,
        refreshPreferences: refreshPreferencesFn,
        saveEditWithPreference: saveEditWithPreferenceFn,
        submitFeedback: submitFeedbackFn,
        clearAllPrefs: clearAllPrefsFn,
        clearExamplesPrefs: clearExamplesPrefsFn,
        clearTagPrefs: clearTagPrefsFn,
        clearTopicAliasPrefs: clearTopicAliasPrefsFn,
        preferenceStats: preferenceStatsValue,
        // Synthesis
        syntheses,
        generateSelectionSynthesis: generateSelectionSynthesisFn,
        generateWeeklyReview: generateWeeklyReviewFn,
        deleteSynthesisById: deleteSynthesisByIdFn,
        getCurrentWeeklySynthesis: getCurrentWeeklySynthesisFn,
        getWeeklySyntheses: getWeeklySynthesesFn,
        getSynthesis: getSynthesisFn,
        batchSetTopic: batchSetTopicFn,
        batchArchive: batchArchiveFn,
        // Brief
        briefs,
        generateBriefFromRecordData: generateBriefFromRecordFn,
        generateBriefFromSynthesisData: generateBriefFromSynthesisFn,
        updateBrief: updateBriefFn,
        deleteBriefById: deleteBriefByIdFn,
        getBrief: getBriefFn,
        getAllBriefs: getAllBriefsFn,
        toggleBriefAction: toggleBriefActionFn,
        addBriefAction: addBriefActionFn,
        updateBriefAction: updateBriefActionFn,
        deleteBriefAction: deleteBriefActionFn,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
