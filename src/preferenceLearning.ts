import type {
  AIPreferences,
  ThoughtRecord,
  TopicAlias,
  TagsByTopic,
  AcceptedExample,
} from "./types";
import { addAcceptedExample, savePreferences, loadPreferences } from "./preferences";

// ============================================================
// 偏好学习核心逻辑
// ============================================================

/**
 * 从用户编辑行为中学习偏好。
 * 对比 aiOriginalResult（AI 原始结果）和当前 record 的值，
 * 提取有意义的修改，更新偏好数据。
 */
export function learnFromEdit(
  record: ThoughtRecord,
  editedFields: string[]
): AIPreferences {
  let prefs = loadPreferences();
  const original = record.aiOriginalResult;
  if (!original) return prefs;

  // 1. topic 学习：用户把 topic 从 A 改成 B
  if (editedFields.includes("topic") && record.topic !== original.topic) {
    prefs = learnTopicAlias(prefs, original.topic, record.topic);
  }

  // 2. tags 学习
  if (editedFields.includes("tags")) {
    prefs = learnTags(prefs, original.tags, record.tags, record.topic);
  }

  // 3. title 学习：用户改了泛标题
  if (editedFields.includes("aiTitle") && isVagueEdit(original.title, record.aiTitle)) {
    prefs = learnTitleBlacklist(prefs, original.title);
  }

  // 4. suggestions 学习：用户删除了空泛建议
  if (editedFields.includes("suggestions")) {
    prefs = learnSuggestionBlacklist(prefs, original.suggestions, record.suggestions);
  }

  // 5. 记为 acceptedExample
  const example: AcceptedExample = {
    id: record.id + "_edit_" + Date.now(),
    rawText: record.rawText,
    result: {
      title: record.aiTitle,
      summary: record.aiSummary,
      type: record.type,
      tags: record.tags,
      topic: record.topic,
      promoteLevel: record.promoteLevel,
      suggestions: record.suggestions,
    },
    createdAt: new Date().toISOString(),
    source: "edited",
  };
  prefs = addAcceptedExample(prefs, example);

  savePreferences(prefs);
  return prefs;
}

/**
 * 用户点击"准确"反馈时，将当前结果记为正向例子。
 */
export function learnFromLike(record: ThoughtRecord): AIPreferences {
  let prefs = loadPreferences();

  const example: AcceptedExample = {
    id: record.id + "_like_" + Date.now(),
    rawText: record.rawText,
    result: {
      title: record.aiTitle,
      summary: record.aiSummary,
      type: record.type,
      tags: record.tags,
      topic: record.topic,
      promoteLevel: record.promoteLevel,
      suggestions: record.suggestions,
    },
    createdAt: new Date().toISOString(),
    source: "liked",
  };
  prefs = addAcceptedExample(prefs, example);

  savePreferences(prefs);
  return prefs;
}

// ============================================================
// 具体学习函数
// ============================================================

/** topic 修正学习：A → B */
function learnTopicAlias(prefs: AIPreferences, from: string, to: string): AIPreferences {
  if (!from || !to || from === to) return prefs;

  const existing = prefs.preferredTopicAliases.find((a) => a.from === from);
  if (existing) {
    if (existing.to === to) {
      existing.count += 1;
    } else {
      // 同一个 from 被改为不同 to，取 count 最高的
      existing.to = to;
      existing.count += 1;
    }
  } else {
    const alias: TopicAlias = { from, to, count: 1 };
    prefs.preferredTopicAliases.push(alias);
  }

  // 保留最多 20 条
  prefs.preferredTopicAliases.sort((a, b) => b.count - a.count);
  prefs.preferredTopicAliases = prefs.preferredTopicAliases.slice(0, 20);

  return prefs;
}

/** tags 学习 */
function learnTags(
  prefs: AIPreferences,
  originalTags: string[],
  newTags: string[],
  topic: string
): AIPreferences {
  const removed = originalTags.filter((t) => !newTags.includes(t));
  const added = newTags.filter((t) => !originalTags.includes(t));

  // 用户删除的标签 → 加入 bannedGenericTags
  for (const tag of removed) {
    if (!prefs.bannedGenericTags.includes(tag)) {
      // 只记录偏泛的标签（长度 <= 3 通常偏泛）
      if (tag.length <= 3) {
        prefs.bannedGenericTags.push(tag);
      }
    }
  }
  // 保留最多 30 个
  prefs.bannedGenericTags = [...new Set(prefs.bannedGenericTags)].slice(0, 30);

  // 用户为某 topic 添加的标签 → preferredTagsByTopic
  if (topic && added.length > 0) {
    const existing = prefs.preferredTagsByTopic.find((t) => t.topic === topic);
    if (existing) {
      // 合并标签
      for (const tag of added) {
        if (!existing.tags.includes(tag)) {
          existing.tags.push(tag);
        }
      }
      existing.tags = existing.tags.slice(0, 10);
      existing.count += 1;
    } else {
      const entry: TagsByTopic = {
        topic,
        tags: added.slice(0, 10),
        count: 1,
      };
      prefs.preferredTagsByTopic.push(entry);
    }
    // 保留最多 15 个 topic
    prefs.preferredTagsByTopic.sort((a, b) => b.count - a.count);
    prefs.preferredTagsByTopic = prefs.preferredTagsByTopic.slice(0, 15);
  }

  return prefs;
}

/** title 黑名单学习 */
function learnTitleBlacklist(prefs: AIPreferences, originalTitle: string): AIPreferences {
  if (!originalTitle || prefs.titleBlacklistPatterns.includes(originalTitle)) return prefs;
  prefs.titleBlacklistPatterns.push(originalTitle);
  // 保留最多 20 条
  prefs.titleBlacklistPatterns = prefs.titleBlacklistPatterns.slice(0, 20);
  return prefs;
}

/** suggestion 黑名单学习 */
function learnSuggestionBlacklist(
  prefs: AIPreferences,
  originalSuggestions: string[],
  newSuggestions: string[]
): AIPreferences {
  const removed = originalSuggestions.filter((s) => !newSuggestions.includes(s));
  for (const s of removed) {
    if (!prefs.suggestionBlacklistPatterns.includes(s)) {
      prefs.suggestionBlacklistPatterns.push(s);
    }
  }
  prefs.suggestionBlacklistPatterns = [...new Set(prefs.suggestionBlacklistPatterns)].slice(0, 30);
  return prefs;
}

/** 判断标题编辑是否属于"修正泛标题" */
function isVagueEdit(original: string, edited: string): boolean {
  if (!original || !edited) return false;
  // 原标题较短且编辑后变长，或原标题包含泛关键词
  const vagueWords = ["整理", "优化", "想法", "记录", "思路", "建议"];
  return vagueWords.some((w) => original.includes(w));
}

// ============================================================
// 从反馈中学习（一般/不合适 + 原因标签）
// ============================================================

/**
 * 用户选择"一般"或"不合适"并选了原因标签时，
 * 根据原因标签更新偏好。
 */
export function learnFromFeedback(
  record: ThoughtRecord,
  feedbackStatus: string,
  reasons: string[]
): AIPreferences {
  let prefs = loadPreferences();
  const original = record.aiOriginalResult;

  for (const reason of reasons) {
    switch (reason) {
      case "标签太泛":
        if (original) {
          for (const tag of original.tags) {
            if (tag.length <= 3 && !prefs.bannedGenericTags.includes(tag)) {
              prefs.bannedGenericTags.push(tag);
            }
          }
          prefs.bannedGenericTags = [...new Set(prefs.bannedGenericTags)].slice(0, 30);
        }
        break;

      case "标题太泛":
        if (original && !prefs.titleBlacklistPatterns.includes(original.title)) {
          prefs.titleBlacklistPatterns.push(original.title);
          prefs.titleBlacklistPatterns = prefs.titleBlacklistPatterns.slice(0, 20);
        }
        break;

      case "建议太空":
        if (original) {
          for (const s of original.suggestions) {
            if (!prefs.suggestionBlacklistPatterns.includes(s)) {
              prefs.suggestionBlacklistPatterns.push(s);
            }
          }
          prefs.suggestionBlacklistPatterns = [...new Set(prefs.suggestionBlacklistPatterns)].slice(0, 30);
        }
        break;

      case "主题不准":
      case "推进等级不合适":
      case "摘要不清楚":
      case "类型不对":
      case "其他":
        // 暂时只记录，不自动修正
        break;
    }
  }

  savePreferences(prefs);
  return prefs;
}

// ============================================================
// 选择 few-shot 示例（用于 AI 调用时注入）
// ============================================================

/**
 * 从 acceptedExamples 中挑选最多 maxCount 条最相关的示例。
 * 优先取 topic 接近的，其次取最近的。
 */
export function selectFewShotExamples(
  prefs: AIPreferences,
  currentTopic: string,
  maxCount: number = 3
): AcceptedExample[] {
  const examples = prefs.acceptedExamples;
  if (examples.length === 0) return [];

  // 先按 topic 匹配排序，再按时间排序
  const scored = examples.map((e) => ({
    example: e,
    score: (e.result.topic === currentTopic && currentTopic ? 10 : 0)
      + (e.source === "edited" ? 2 : 1),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount).map((s) => s.example);
}
