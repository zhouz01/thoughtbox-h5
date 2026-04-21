import type { AIPreferences, AcceptedExample } from "./types";

const STORAGE_KEY = "thoughtbox_ai_preferences";
const MAX_ACCEPTED_EXAMPLES = 30;

function createEmpty(): AIPreferences {
  return {
    bannedGenericTags: [],
    preferredTopicAliases: [],
    preferredTagsByTopic: [],
    titleBlacklistPatterns: [],
    suggestionBlacklistPatterns: [],
    acceptedExamples: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** 从 localStorage 加载偏好 */
export function loadPreferences(): AIPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmpty();
    const parsed = JSON.parse(raw) as Partial<AIPreferences>;
    // 兼容：确保所有字段都存在
    const base = createEmpty();
    return {
      bannedGenericTags: parsed.bannedGenericTags ?? base.bannedGenericTags,
      preferredTopicAliases: parsed.preferredTopicAliases ?? base.preferredTopicAliases,
      preferredTagsByTopic: parsed.preferredTagsByTopic ?? base.preferredTagsByTopic,
      titleBlacklistPatterns: parsed.titleBlacklistPatterns ?? base.titleBlacklistPatterns,
      suggestionBlacklistPatterns: parsed.suggestionBlacklistPatterns ?? base.suggestionBlacklistPatterns,
      acceptedExamples: parsed.acceptedExamples ?? base.acceptedExamples,
      lastUpdatedAt: parsed.lastUpdatedAt ?? base.lastUpdatedAt,
    };
  } catch {
    return createEmpty();
  }
}

/** 保存偏好到 localStorage */
export function savePreferences(prefs: AIPreferences): void {
  prefs.lastUpdatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** 清空全部偏好 */
export function clearAllPreferences(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** 仅清空 acceptedExamples */
export function clearExamples(prefs: AIPreferences): AIPreferences {
  return {
    ...prefs,
    acceptedExamples: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** 仅清空标签偏好 */
export function clearTagPreferences(prefs: AIPreferences): AIPreferences {
  return {
    ...prefs,
    bannedGenericTags: [],
    preferredTagsByTopic: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** 仅清空主题修正规则 */
export function clearTopicAliases(prefs: AIPreferences): AIPreferences {
  return {
    ...prefs,
    preferredTopicAliases: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** 添加一条 acceptedExample，超过上限时移除最旧的 */
export function addAcceptedExample(prefs: AIPreferences, example: AcceptedExample): AIPreferences {
  const examples = [example, ...prefs.acceptedExamples];
  // 去重：同 id 不重复添加
  const seen = new Set<string>();
  const deduped = examples.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  return {
    ...prefs,
    acceptedExamples: deduped.slice(0, MAX_ACCEPTED_EXAMPLES),
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** 获取偏好概览统计 */
export function getPreferenceStats(prefs: AIPreferences) {
  return {
    exampleCount: prefs.acceptedExamples.length,
    topicAliasCount: prefs.preferredTopicAliases.length,
    bannedTagCount: prefs.bannedGenericTags.length,
    titleBlacklistCount: prefs.titleBlacklistPatterns.length,
    suggestionBlacklistCount: prefs.suggestionBlacklistPatterns.length,
    tagsByTopicCount: prefs.preferredTagsByTopic.length,
  };
}
