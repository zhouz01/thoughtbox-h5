import type { AIConfig, AIProfile, RecordType, PromoteLevel, AIPreferences, Synthesis, ProjectBrief, BriefActionItem } from "./types";
import { normalizeApiEndpoint as baseNormalize, getBackupProfile, isProfileConfigured as checkProfileConfigured } from "./aiConfig";
import { loadPreferences } from "./preferences";
import { selectFewShotExamples } from "./preferenceLearning";
import { generateId } from "./storage";

const VALID_TYPES: RecordType[] = ["随记", "灵感", "待办", "项目", "问题", "复盘", "参考"];
const VALID_PROMOTES: PromoteLevel[] = ["仅保存", "建议观察", "建议行动", "建议立项"];

// ============================================================
// 一、设计师工作流版 System Prompt（V1.9：7 主类型 + AI 子类型）
// ============================================================

const SYSTEM_PROMPT = `你是一个帮助设计师整理碎片想法的结构化助手。
你的任务不是陪聊，而是把一段零散输入整理成一张清晰、可回看、可轻推进的记录卡片。

用户输入通常具有这些特点：
- 很短
- 不完整
- 口语化
- 可能只有一个观察、问题或方向
- 可能来自作品集、客户项目、设计系统、品牌表达、视觉探索、AI 工具、工作流优化等场景

你的输出目标：
1. 保留原始意思，不擅自脑补
2. 把表达整理得更清晰
3. 帮用户判断这更像随记、灵感、待办、项目、问题、复盘还是参考
4. 给出一个更具体的子类型，帮助用户快速理解这条记录的细分方向
5. 给出简洁而具体的标签和主题
6. 只有在适合时才给出下一步建议
7. 下一步建议必须短、小、可执行，避免空话

输出规则：
- 只返回 JSON
- 不要 markdown
- 不要代码块
- 不要额外解释

字段要求：
- title：8~18 个中文字符，具体、自然，不要空泛，不要用"想法整理""记录整理""设计优化建议"这类泛标题
- summary：1~2 句，清楚表达核心意思，不重复原文，不写套话
- type：只能是 随记 / 灵感 / 待办 / 项目 / 问题 / 复盘 / 参考
- aiSubType：2~6 个中文字符，表达自然、具体。根据 type 和 rawText 生成一个更细的子分类
- typeConfidence：0~1 之间的数字，表示你对 type 判断的把握程度
- typeReason：一句话，简要说明为什么判断为这个 type（内部调试用）
- tags：2~4 个中文标签，尽量具体，避免"设计""优化""想法"这种过泛词
- topic：优先复用已有主题；如果需要新建主题，请用 2~6 个字的简洁中文名，不要太泛
- promoteLevel：只能是 仅保存 / 建议观察 / 建议行动 / 建议立项
- suggestions：0~3 条；只有在合适时输出；必须短而具体

===== 主类型定义（严格 7 类，不允许新增） =====

1. 随记
定义：用于记录生活片段、临时感受、日常小事、没有明确行动目标的内容。
示例：今天突然觉得最近状态有点散 / 最近总觉得自己刷手机太多了 / 周末也许想去书店逛逛
判断要点：没有明确的设计/工作指向，只是个人状态的随手记录。

2. 灵感
定义：用于记录创意方向、表达方式、结构想法、产品点子、设计思路。
示例：作品集首页不应该先堆项目，应该先让我是谁更清楚 / 可以做一个给设计师记录灵感的工具
判断要点：有新的想法、方向、表达方式的萌芽，但还不是明确的任务。

3. 待办
定义：用于记录明确要执行的动作。
示例：这周要整理个人品牌的介绍文案 / 晚上记得买洗衣液 / 明天补一下作品集首页文案
判断要点：有明确的动作指向，可以在短期内直接开始执行。

4. 项目
定义：用于记录持续推进的事项、多步推进的方向、长期整理内容。
示例：准备重做个人作品集 / 想做一个记录想法并自动整理的 app
判断要点：需要多步推进，有长期性，不是一次性能完成的动作。

5. 问题
定义：用于记录卡住点、待判断问题、不确定问题。
示例：作品集首页到底该先讲定位还是先放案例？ / 这个视觉方向太安全了，怎么做得更有记忆点？
判断要点：有疑问、有卡住、需要判断或研究。

6. 复盘
定义：用于记录已经发生事情的总结、反思、经验教训。
示例：这个客户项目第二版比第一版更完整，但差异点不够集中，复盘一下 / 这次提案失败主要是叙事顺序不清楚
判断要点：对已发生事情的回顾、总结、反思。

7. 参考
定义：用于记录明确来自外部的案例、作品、素材、文章、页面、风格、方法。
示例：今天看到一个 SaaS 官网，留白和模块节奏很舒服，值得参考 / 收藏一个作品集案例，开头叙事很好
判断要点：
- 必须是外部来源的内容（看到的、收藏的、读到的）
- 生活小事、日常感受、碎片观察，不要分到"参考"
- 如果不确定是否来自外部，默认归为"随记"，不要误分到"参考"

===== 子类型示例 =====
根据主类型和文本内容，生成一个 2~6 字的自然子类型：
- 随记 → 生活感受、生活提醒、日常观察、状态记录
- 灵感 → 产品点子、表达方式、结构思路、视觉方向
- 待办 → 生活提醒、工作事项、设计任务、文案补全
- 项目 → 作品集结构、品牌升级、工具开发、系统整理
- 问题 → 设计判断、方向选择、表达困惑、优先级
- 复盘 → 客户复盘、项目复盘、提案复盘、流程复盘
- 参考 → 网页案例、作品集案例、设计风格、交互参考

===== 兜底规则 =====
- 如果 AI 不确定主类型，默认归为"随记"，confidence 设为 0.3~0.5
- "参考"必须严格限定为外部来源内容，不确定时不要用"参考"
- 生活小事、日常感受、碎片观察，一律归为"随记"

===== 推进等级判断 =====
- 待办 => 通常为 建议行动
- 项目 => 通常为 建议立项
- 问题 => 通常为 建议观察
- 随记 / 灵感 / 参考 / 复盘 => 根据内容判断为 仅保存 或 建议观察
- 只有当内容已经很明确时，才给 建议行动 或 建议立项

===== 下一步建议要求 =====
- 必须非常小、具体、像真实工作动作
- 优先类似：对比 3 个参考案例、补一句问题定义、写出首页第一屏文案、拆成一个最小版本、列出 2 个可选方向
- 避免类似：深入思考、持续优化、完善体验、开展研究`;

// 重试时更直接的提示词
const RETRY_PROMPT = `请严格只返回合法 JSON，不要任何额外文字。
确保：标题具体（不要泛标题）、主题复用已有主题或新建简洁主题、建议短小可执行。
字段：title, summary, type, aiSubType, typeConfidence, typeReason, tags, topic, promoteLevel, suggestions`;

// ============================================================
// 二、Endpoint 规范化（升级：支持 providerType）
// ============================================================

export function normalizeApiEndpoint(input: string, providerType?: string): string {
  // custom 类型保留原样（只去尾斜杠）
  if (providerType === "custom") {
    return input.trim().replace(/\/+$/, "");
  }
  return baseNormalize(input);
}

// 为了向后兼容，保留从 aiConfig 导出的版本
export { normalizeApiEndpoint as normalizeApiEndpointBase } from "./aiConfig";

// ============================================================
// 三、统一响应文本提取
// ============================================================

/**
 * 从不同 OpenAI 兼容服务的响应中提取 assistant 文本。
 * 兼容以下结构：
 * 1. choices[0].message.content (string)
 * 2. choices[0].message.content (array, 含 text 字段)
 * 3. choices[0].text
 * 4. output_text
 * 5. output (array) → content (array) → text
 */
export function extractAssistantText(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("响应格式异常：非对象");
  }

  const resp = data as Record<string, unknown>;

  // 1. choices[0].message.content
  if (Array.isArray(resp.choices) && resp.choices.length > 0) {
    const choice = resp.choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;

    if (message) {
      const content = message.content;
      // 1a. content 是字符串
      if (typeof content === "string") return content;
      // 1b. content 是数组（某些服务）
      if (Array.isArray(content)) {
        const textItem = content.find(
          (item: unknown) =>
            typeof item === "object" && item !== null && "text" in (item as Record<string, unknown>)
        );
        if (textItem && typeof (textItem as Record<string, unknown>).text === "string") {
          return (textItem as Record<string, unknown>).text as string;
        }
      }
    }

    // 3. choices[0].text
    if (typeof choice.text === "string") return choice.text;
  }

  // 4. output_text
  if (typeof resp.output_text === "string") return resp.output_text;

  // 5. output → content → text
  if (Array.isArray(resp.output)) {
    for (const item of resp.output as Record<string, unknown>[]) {
      if (Array.isArray(item.content)) {
        for (const c of item.content as Record<string, unknown>[]) {
          if (typeof c.text === "string") return c.text;
        }
      }
    }
  }

  throw new Error("无法从响应中提取文本");
}

// ============================================================
// 四、AI 返回结构
// ============================================================

export interface AIOrganizeResult {
  title: string;
  summary: string;
  type: RecordType;
  aiSubType?: string;
  typeConfidence?: number;
  typeReason?: string;
  tags: string[];
  topic: string;
  promoteLevel: PromoteLevel;
  suggestions: string[];
}

// ============================================================
// 五、主题上下文提取
// ============================================================

export interface TopicContext {
  existingTopics: string[];
  recentTopTopics: string[];
}

/** 偏好上下文，从本地偏好中提取，注入到 AI 调用 */
export interface PreferenceContext {
  bannedGenericTags: string[];
  preferredTopicAliases: Array<{ from: string; to: string }>;
  preferredTagsByTopic: Array<{ topic: string; tags: string[] }>;
  fewShotExamples: Array<{
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
  }>;
}

/** 从 AIPreferences 构建 PreferenceContext */
export function buildPreferenceContext(prefs: AIPreferences, currentTopic?: string): PreferenceContext {
  const examples = selectFewShotExamples(prefs, currentTopic || "", 3);
  return {
    bannedGenericTags: prefs.bannedGenericTags,
    preferredTopicAliases: prefs.preferredTopicAliases.map((a) => ({ from: a.from, to: a.to })),
    preferredTagsByTopic: prefs.preferredTagsByTopic.map((t) => ({ topic: t.topic, tags: t.tags })),
    fewShotExamples: examples.map((e) => ({ rawText: e.rawText, result: e.result })),
  };
}

export function extractTopicContext(records: { topic?: string; createdAt: string }[]): TopicContext {
  const topicSet = new Set<string>();
  records.forEach((r) => {
    if (r.topic && r.topic !== "未分类主题") topicSet.add(r.topic);
  });
  const existingTopics = Array.from(topicSet);

  const now = Date.now();
  const recentMs = 14 * 86400000;
  const recentCounts = new Map<string, number>();
  records.forEach((r) => {
    if (!r.topic || r.topic === "未分类主题") return;
    const age = now - new Date(r.createdAt).getTime();
    if (age < recentMs) {
      recentCounts.set(r.topic, (recentCounts.get(r.topic) || 0) + 1);
    }
  });
  const recentTopTopics = Array.from(recentCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  return { existingTopics, recentTopTopics };
}

// ============================================================
// 六、结果后处理（normalize / repair）
// ============================================================

const GENERIC_TITLES = ["想法整理", "记录整理", "设计思路", "优化建议", "灵感记录", "想法记录", "设计优化", "内容整理", "工作思考"];
const GENERIC_TAGS = ["设计", "想法", "优化", "内容", "记录", "工作", "思考", "整理", "项目"];
const GENERIC_SUGGESTIONS = ["深入思考", "持续优化", "进一步完善", "开展研究", "加强理解", "深入分析", "持续改进", "全面优化"];
const GENERIC_TOPICS = ["设计", "项目", "想法", "记录", "工作", "其他", "杂项"];

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLES.some((g) => title.includes(g));
}
function isGenericTag(tag: string): boolean {
  return GENERIC_TAGS.includes(tag);
}
function isGenericSuggestion(s: string): boolean {
  return GENERIC_SUGGESTIONS.some((g) => s.includes(g));
}
function isGenericTopic(topic: string): boolean {
  return GENERIC_TOPICS.includes(topic);
}

function fallbackTitleFromRaw(rawText: string): string {
  const cleaned = rawText.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 18) return cleaned;
  const cutIdx = cleaned.search(/[，。！？、；\n]/);
  if (cutIdx > 4 && cutIdx <= 20) return cleaned.slice(0, cutIdx);
  return cleaned.slice(0, 15) + "…";
}

function fallbackSummaryFromRaw(rawText: string): string {
  const t = rawText.trim();
  if (t.length <= 50) return t;
  return t.slice(0, 48) + "…";
}

function extractKeywordsFromRaw(rawText: string): string[] {
  const keywords: string[] = [];
  const patterns: [RegExp, string][] = [
    [/作品集/i, "作品集"], [/case\s*study/i, "案例"], [/品牌/i, "品牌"],
    [/文案/i, "文案"], [/AI|ai/i, "AI"], [/工具/i, "工具"],
    [/组件/i, "组件"], [/设计系统/i, "设计系统"], [/插画/i, "插画"],
    [/视觉/i, "视觉"], [/首页|CTA/i, "首页"], [/官网/i, "官网"],
    [/模板|模版/i, "模板"], [/onboarding/i, "引导"], [/客户/i, "客户"],
    [/复盘/i, "复盘"], [/界面|UI/i, "界面"], [/风格/i, "风格"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(rawText) && keywords.length < 4) keywords.push(label);
  }
  return keywords;
}

export function normalizeResult(
  raw: Partial<AIOrganizeResult>,
  rawText: string,
  topicContext?: TopicContext,
  preferenceContext?: PreferenceContext
): AIOrganizeResult {
  // 加载偏好用于后处理
  const prefs = preferenceContext ? undefined : loadPreferences();
  const bannedTags = preferenceContext?.bannedGenericTags ?? prefs?.bannedGenericTags ?? [];
  const topicAliases = preferenceContext?.preferredTopicAliases ?? prefs?.preferredTopicAliases.map((a) => ({ from: a.from, to: a.to })) ?? [];
  const titleBlacklist = prefs?.titleBlacklistPatterns ?? [];
  const suggestionBlacklist = prefs?.suggestionBlacklistPatterns ?? [];
  const tagsByTopic = preferenceContext?.preferredTagsByTopic ?? prefs?.preferredTagsByTopic.map((t) => ({ topic: t.topic, tags: t.tags })) ?? [];

  // --- title ---
  let title = typeof raw.title === "string" ? raw.title.trim() : "";
  // 偏好修正：标题命中黑名单
  const titleHitBlacklist = titleBlacklist.length > 0 && titleBlacklist.some((p) => title.includes(p));
  if (!title || isGenericTitle(title) || titleHitBlacklist) title = fallbackTitleFromRaw(rawText);
  if (title.length > 18) title = title.slice(0, 17) + "…";

  // --- summary ---
  let summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!summary) summary = fallbackSummaryFromRaw(rawText);
  if (summary.length > 60) summary = summary.slice(0, 58) + "…";

  // --- type ---
  let type: RecordType = VALID_TYPES.includes(raw.type as RecordType)
    ? (raw.type as RecordType) : "随记";
  // 兜底：如果 AI 返回的类型不在 7 类中，或置信度低，默认归为随记
  const confidence = typeof raw.typeConfidence === "number" ? raw.typeConfidence : 0.5;
  if (!VALID_TYPES.includes(raw.type as RecordType) || confidence < 0.4) {
    type = "随记";
  }

  // --- aiSubType ---
  let aiSubType = typeof raw.aiSubType === "string" ? raw.aiSubType.trim() : "";
  if (aiSubType.length > 6) aiSubType = aiSubType.slice(0, 6);
  if (aiSubType.length < 2) {
    // fallback：根据主类型给默认子类型
    const fallbackMap: Record<RecordType, string> = {
      随记: "日常记录",
      灵感: "创意方向",
      待办: "待办事项",
      项目: "项目推进",
      问题: "待解问题",
      复盘: "经验总结",
      参考: "外部参考",
    };
    aiSubType = fallbackMap[type];
  }

  // --- typeConfidence ---
  const typeConfidence = confidence;

  // --- typeReason ---
  const typeReason = typeof raw.typeReason === "string" ? raw.typeReason.trim() : "";

  // --- tags ---
  let tags: string[] = Array.isArray(raw.tags)
    ? (raw.tags as string[]).filter((t): t is string => typeof t === "string" && t.trim()) : [];
  tags = [...new Set(tags.map((t) => t.trim()))];
  // 基础过滤 + 偏好过滤
  tags = tags.filter((t) => !isGenericTag(t) && !bannedTags.includes(t));
  // 偏好补充：从 preferredTagsByTopic 补充
  if (tags.length < 2) {
    const topicForTags = typeof raw.topic === "string" ? raw.topic.trim() : "";
    const preferredEntry = tagsByTopic.find((t) => t.topic === topicForTags);
    if (preferredEntry) {
      const extras = preferredEntry.tags.filter((k) => !tags.includes(k));
      tags = [...tags, ...extras].slice(0, 4);
    }
  }
  if (tags.length < 2) {
    const extras = extractKeywordsFromRaw(rawText).filter((k) => !tags.includes(k));
    tags = [...tags, ...extras].slice(0, 4);
  }
  tags = tags.slice(0, 4);

  // --- topic ---
  let topic = typeof raw.topic === "string" ? raw.topic.trim() : "";
  // 偏好修正：topic 命中别名
  if (topic) {
    const alias = topicAliases.find((a) => a.from === topic);
    if (alias) topic = alias.to;
  }
  if (!topic || isGenericTopic(topic)) {
    if (topicContext && topicContext.existingTopics.length > 0) {
      const matched = topicContext.existingTopics.find((t) => rawText.includes(t));
      topic = matched || "未分类主题";
    } else {
      topic = "未分类主题";
    }
  }

  // --- promoteLevel ---
  const promoteLevel: PromoteLevel = VALID_PROMOTES.includes(raw.promoteLevel as PromoteLevel)
    ? (raw.promoteLevel as PromoteLevel) : inferPromoteFromType(type);

  // --- suggestions ---
  let suggestions: string[] = Array.isArray(raw.suggestions)
    ? (raw.suggestions as string[]).filter((s): s is string => typeof s === "string" && s.trim()) : [];
  suggestions = [...new Set(suggestions.map((s) => s.trim()))];
  // 基础过滤 + 偏好过滤
  suggestions = suggestions.filter((s) => !isGenericSuggestion(s) && !suggestionBlacklist.some((p) => s.includes(p)));
  suggestions = suggestions.slice(0, 3);
  if ((promoteLevel === "建议行动" || promoteLevel === "建议立项") && suggestions.length === 0) {
    suggestions = generateFallbackSuggestions(type, topic);
  }

  return { title, summary, type, aiSubType, typeConfidence, typeReason, tags, topic, promoteLevel, suggestions };
}

function inferPromoteFromType(type: RecordType): PromoteLevel {
  switch (type) {
    case "待办": return "建议行动";
    case "项目": return "建议立项";
    case "问题": return "建议观察";
    default: return "仅保存";
  }
}

/** 格式化类型展示：主类型 + 子类型 */
export function formatTypeLabel(record: { type: RecordType; aiSubType?: string }): string {
  if (record.aiSubType && record.aiSubType !== record.type) {
    return `${record.type} · ${record.aiSubType}`;
  }
  return record.type;
}

function generateFallbackSuggestions(type: RecordType, _topic: string): string[] {
  const pool: Record<RecordType, string[]> = {
    随记: ["记录当下的感受", "回顾时看看是否有变化"],
    灵感: ["找 3 个类似参考", "写一句核心描述"],
    待办: ["拆成执行步骤", "设定完成时间"],
    项目: ["拆成最小版本", "列出关键里程碑"],
    问题: ["列出 2 个可能方向", "写清问题上下文"],
    复盘: ["提取 3 条核心教训", "标注下次改进点"],
    参考: ["标注可复用要点", "关联到现有项目"],
  };
  return pool[type] || pool["随记"];
}

// ============================================================
// 七、解析 AI 返回
// ============================================================

function parseAIResponse(text: string): Partial<AIOrganizeResult> {
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  try {
    return JSON.parse(jsonStr) as Partial<AIOrganizeResult>;
  } catch {
    throw new Error("AI 返回内容无法解析为 JSON");
  }
}

// ============================================================
// 八、质量评估
// ============================================================

export function needsRetry(result: Partial<AIOrganizeResult>): boolean {
  let missingFields = 0;
  if (!result.title) missingFields++;
  if (!result.type || !VALID_TYPES.includes(result.type as RecordType)) missingFields++;
  if (!result.promoteLevel || !VALID_PROMOTES.includes(result.promoteLevel as PromoteLevel)) missingFields++;
  if (!result.topic) missingFields++;
  if (missingFields >= 3) return true;
  if (result.title && isGenericTitle(result.title)) return true;
  // 如果 type 不在 7 类中，需要重试
  if (result.type && !VALID_TYPES.includes(result.type as RecordType)) return true;
  if (
    (result.promoteLevel === "建议行动" || result.promoteLevel === "建议立项") &&
    (!Array.isArray(result.suggestions) || result.suggestions.length === 0)
  ) return true;
  return false;
}

// ============================================================
// 九、调用真实 AI（支持 AIConfig 或 AIProfile）
// ============================================================

interface OrganizeOptions {
  rawText: string;
  config: AIConfig;
  providerType?: string;
  topicContext?: TopicContext;
  preferenceContext?: PreferenceContext;
  isRetry?: boolean;
}

async function callAI(options: OrganizeOptions): Promise<AIOrganizeResult> {
  const { rawText, config, providerType, topicContext, preferenceContext, isRetry = false } = options;
  const endpoint = normalizeApiEndpoint(config.apiBaseUrl, providerType);

  // 构建用户消息：含主题上下文 + 偏好上下文
  let userContent: string;
  if ((topicContext && topicContext.existingTopics.length > 0) || preferenceContext) {
    const payload: Record<string, unknown> = { rawText };
    if (topicContext && topicContext.existingTopics.length > 0 && !isRetry) {
      payload.existingTopics = topicContext.existingTopics;
      payload.recentTopTopics = topicContext.recentTopTopics;
    }
    if (preferenceContext && !isRetry) {
      // 偏好指令
      const hints: string[] = [];
      if (preferenceContext.bannedGenericTags.length > 0) {
        hints.push(`避免使用这些泛标签：${preferenceContext.bannedGenericTags.join("、")}`);
      }
      if (preferenceContext.preferredTopicAliases.length > 0) {
        const aliasStr = preferenceContext.preferredTopicAliases
          .slice(0, 5)
          .map((a) => `${a.from}→${a.to}`)
          .join("、");
        hints.push(`主题修正偏好：${aliasStr}`);
      }
      if (preferenceContext.preferredTagsByTopic.length > 0) {
        const tagStr = preferenceContext.preferredTagsByTopic
          .slice(0, 3)
          .map((t) => `${t.topic}话题偏好标签：${t.tags.join("、")}`)
          .join("；");
        hints.push(tagStr);
      }
      if (hints.length > 0) {
        payload.preferenceHints = hints;
      }
      // few-shot 示例
      if (preferenceContext.fewShotExamples.length > 0) {
        payload.referenceExamples = preferenceContext.fewShotExamples.map((e) => ({
          input: e.rawText.slice(0, 50),
          output: {
            title: e.result.title,
            type: e.result.type,
            aiSubType: e.result.aiSubType,
            tags: e.result.tags,
            topic: e.result.topic,
            promoteLevel: e.result.promoteLevel,
          },
        }));
      }
    }
    userContent = JSON.stringify(payload);
  } else {
    userContent = rawText;
  }

  const systemPrompt = isRetry ? `${SYSTEM_PROMPT}\n\n${RETRY_PROMPT}` : SYSTEM_PROMPT;

  const body = {
    model: config.model,
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`请求失败 (${res.status}): ${errorText.slice(0, 100)}`);
    }

    const data = await res.json();

    // 使用统一文本提取
    const content = extractAssistantText(data);
    if (!content) throw new Error("AI 返回内容为空");

    const parsed = parseAIResponse(content);
    return normalizeResult(parsed, rawText, topicContext, preferenceContext);
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// 十、主调用入口（支持 AIConfig 和 AIProfile）
// ============================================================

/** 使用旧版 AIConfig 调用（向后兼容） */
export async function organizeWithAI(
  rawText: string,
  config: AIConfig,
  topicContext?: TopicContext,
  preferenceContext?: PreferenceContext
): Promise<AIOrganizeResult> {
  return organizeWithAIExtended({ rawText, config, topicContext, preferenceContext });
}

/** 使用 AIProfile 调用 */
export async function organizeWithProfile(
  rawText: string,
  profile: AIProfile,
  topicContext?: TopicContext,
  preferenceContext?: PreferenceContext
): Promise<AIOrganizeResult> {
  const config: AIConfig = {
    enabled: profile.enabled,
    apiBaseUrl: profile.apiBaseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
    fallbackToMock: profile.fallbackToMock,
  };
  return organizeWithAIExtended({
    rawText,
    config,
    providerType: profile.providerType,
    topicContext,
    preferenceContext,
  });
}

/** 统一调用（含重试） */
async function organizeWithAIExtended(options: OrganizeOptions): Promise<AIOrganizeResult> {
  let result: AIOrganizeResult;
  try {
    result = await callAI(options);
  } catch (firstError) {
    try {
      result = await callAI({ ...options, isRetry: true });
    } catch {
      throw firstError instanceof Error ? firstError : new Error("AI 调用失败");
    }
    return result;
  }

  if (needsRetry(result)) {
    try {
      const retryResult = await callAI({ ...options, isRetry: true });
      return retryResult;
    } catch {
      return result;
    }
  }

  return result;
}

// ============================================================
// 十一、测试连接
// ============================================================

/** 测试 AIConfig 连接 */
export async function testAIConnection(config: AIConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await organizeWithAI("这是一个测试", config);
    if (result.title) return { ok: true, message: "连接成功" };
    return { ok: false, message: "连接成功，但返回结果异常" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return { ok: false, message: `连接失败：${msg}` };
  }
}

/** 测试 AIProfile 连接 */
export async function testProfileConnection(profile: AIProfile): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await organizeWithProfile("这是一个测试", profile);
    if (result.title) return { ok: true, message: "连接成功" };
    return { ok: false, message: "连接成功，但返回结果异常" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    return { ok: false, message: `连接失败：${msg}` };
  }
}

// ============================================================
// 十二、整理质量自测集
// ============================================================

export const TEST_SAMPLES = [
  // 1. 生活随记 → 随记
  "今天突然觉得最近状态有点散，需要调整一下节奏",
  // 2. 外部参考 → 参考
  "今天看到一个 SaaS 官网，留白和模块节奏很舒服，值得参考",
  // 3. 待办 → 待办
  "这周要整理个人品牌的介绍文案，不能再拖了",
  // 4. 项目 → 项目
  "准备重做个人作品集，需要重新梳理结构和叙事",
  // 5. 问题 → 问题
  "作品集首页到底该先讲定位还是先放案例？",
  // 6. 复盘 → 复盘
  "这个客户项目第二版比第一版更完整，但差异点不够集中，复盘一下",
  // 7. 灵感 → 灵感
  "作品集首页不应该先堆项目，应该先让我是谁更清楚",
  // 8. 随记（日常小事）→ 随记
  "周末也许想去书店逛逛，找点灵感",
  // 9. 参考（作品集案例）→ 参考
  "收藏一个作品集案例，开头叙事很好，值得学习",
  // 10. 待办（明确动作）→ 待办
  "明天补一下作品集首页文案，把 hero 区的表达再打磨一下",
];

if (typeof window !== "undefined") {
  (window as Record<string, unknown>).__testOrganizeQuality = () => {
    console.log("📋 ThoughtBox 整理质量自测");
    console.log("请确保已配置真实 AI，然后逐条检查输出");
    TEST_SAMPLES.forEach((s, i) => {
      console.log(`\n#${i + 1}: ${s}`);
    });
  };
}

// ============================================================
// 十三、批量整理 / 周回顾
// ============================================================

const SYNTHESIS_SYSTEM_PROMPT = `你是一个帮助设计师整理多条碎片记录的助手。
你的任务不是逐条复述，而是从多条记录中提炼：
- 它们共同在关注什么
- 哪些主题反复出现
- 哪些问题尚未解决
- 哪些方向值得进一步推进
- 下一步最值得做的 1~3 个动作

输出规则：
- 只返回 JSON
- 不要 markdown
- 不要代码块
- 不要额外解释
- 语言简洁、具体、克制
- 不要写空泛总结
- 不要把每条记录都重复一遍
- 更像设计师自己的周整理，而不是咨询报告

字段要求：
- title：8~18 个中文字符，具体自然，不要空泛标题
- overview：1~2 句总览
- keyThemes：2~4 个关键主题
- repeatedPatterns：0~3 条反复出现的模式
- openQuestions：0~3 条待观察问题
- opportunities：0~3 条值得推进的机会
- nextActions：1~3 条下一步，必须可执行
- oneLineSummary：一句中文短总结`;

export interface SynthesisInput {
  rawText: string;
  aiTitle?: string;
  aiSummary?: string;
  type?: string;
  tags?: string[];
  topic?: string;
  promoteLevel?: string;
}

export interface SynthesisAIResult {
  title: string;
  overview: string;
  keyThemes: string[];
  repeatedPatterns: string[];
  openQuestions: string[];
  opportunities: string[];
  nextActions: string[];
  oneLineSummary: string;
}

/** 解析批量整理 AI 返回 */
function parseSynthesisResponse(text: string): Partial<SynthesisAIResult> {
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  try {
    return JSON.parse(jsonStr) as Partial<SynthesisAIResult>;
  } catch {
    throw new Error("批量整理 AI 返回内容无法解析为 JSON");
  }
}

/** 规范化批量整理结果 */
function normalizeSynthesisResult(raw: Partial<SynthesisAIResult>, inputs: SynthesisInput[]): SynthesisAIResult {
  const title = typeof raw.title === "string" && raw.title.trim()
    ? raw.title.trim().slice(0, 18)
    : `共 ${inputs.length} 条记录的汇总`;

  const overview = typeof raw.overview === "string" && raw.overview.trim()
    ? raw.overview.trim().slice(0, 120)
    : `涉及 ${inputs.length} 条记录，围绕多个方向展开。`;

  const keyThemes = Array.isArray(raw.keyThemes)
    ? (raw.keyThemes as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 4)
    : [];

  const repeatedPatterns = Array.isArray(raw.repeatedPatterns)
    ? (raw.repeatedPatterns as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  const openQuestions = Array.isArray(raw.openQuestions)
    ? (raw.openQuestions as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  const opportunities = Array.isArray(raw.opportunities)
    ? (raw.opportunities as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  let nextActions = Array.isArray(raw.nextActions)
    ? (raw.nextActions as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 3)
    : [];
  // 过滤空泛建议
  nextActions = nextActions.filter((s) => !GENERIC_SUGGESTIONS.some((g) => s.includes(g)));
  if (nextActions.length === 0) {
    nextActions = ["整理出最值得推进的 1 个方向"];
  }

  const oneLineSummary = typeof raw.oneLineSummary === "string" && raw.oneLineSummary.trim()
    ? raw.oneLineSummary.trim().slice(0, 40)
    : title;

  return { title, overview, keyThemes, repeatedPatterns, openQuestions, opportunities, nextActions, oneLineSummary };
}

/** Mock 批量整理 fallback */
export function generateMockSynthesis(
  inputs: SynthesisInput[],
  mode: "selection" | "weekly_review",
  sourceTopic?: string,
  weekKey?: string,
): Synthesis {
  // 统计最高频 topic
  const topicCounts = new Map<string, number>();
  inputs.forEach((r) => {
    if (r.topic && r.topic !== "未分类主题") {
      topicCounts.set(r.topic, (topicCounts.get(r.topic) || 0) + 1);
    }
  });
  const topTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);

  // 统计最高频 type
  const typeCounts = new Map<string, number>();
  inputs.forEach((r) => {
    if (r.type) typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1);
  });
  const topType = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  // 从 type=问题 提取 openQuestions
  const questions = inputs
    .filter((r) => r.type === "问题")
    .map((r) => r.aiTitle || r.rawText.slice(0, 20))
    .slice(0, 3);

  // 从 promoteLevel 建议行动/立项 提取 opportunities
  const opps = inputs
    .filter((r) => r.promoteLevel === "建议行动" || r.promoteLevel === "建议立项")
    .map((r) => r.aiTitle || r.rawText.slice(0, 20))
    .slice(0, 3);

  // 从 suggestions 提取 nextActions
  const actions: string[] = [];
  inputs.forEach((r) => {
    if (r.tags) {
      // 用 tags 的第一条作为简短 action
      if (actions.length < 3 && r.aiTitle) {
        actions.push(r.aiTitle);
      }
    }
  });

  const keyThemes = topTopics.length > 0 ? topTopics : ["综合整理"];
  const title = sourceTopic
    ? `${sourceTopic}汇总`
    : mode === "weekly_review" && weekKey
      ? `${weekKey} 周回顾`
      : `${inputs.length} 条记录汇总`;

  const now = new Date().toISOString();
  return {
    id: generateId(),
    mode,
    title,
    overview: topTopics.length > 0
      ? `这批记录主要围绕${topTopics.slice(0, 2).join("和")}展开。`
      : `共 ${inputs.length} 条记录，涉及多个方向。`,
    keyThemes,
    repeatedPatterns: topType ? [`以${topType[0]}类型居多`] : [],
    openQuestions: questions.length > 0 ? questions : [],
    opportunities: opps.length > 0 ? opps : [],
    nextActions: actions.length > 0 ? actions : ["整理出最值得推进的 1 个方向"],
    oneLineSummary: topTopics.length > 0
      ? `围绕${topTopics[0]}，${inputs.length} 条记录`
      : `${inputs.length} 条想法的汇总`,
    sourceRecordIds: [],  // 由调用方填入
    sourceRecordCount: inputs.length,
    weekKey,
    sourceTopic,
    status: "done",
    source: "mock",
    createdAt: now,
    updatedAt: now,
  };
}

/** 调用真实 AI 生成批量整理 */
async function callSynthesisAI(
  inputs: SynthesisInput[],
  config: AIConfig,
  providerType?: string,
  preferenceContext?: PreferenceContext,
  topicContext?: TopicContext,
): Promise<SynthesisAIResult> {
  const endpoint = normalizeApiEndpoint(config.apiBaseUrl, providerType);

  // 构建用户消息
  const payload: Record<string, unknown> = {
    records: inputs.map((r) => ({
      rawText: r.rawText.slice(0, 100),
      title: r.aiTitle,
      type: r.type,
      topic: r.topic,
      promoteLevel: r.promoteLevel,
    })),
  };

  if (topicContext && topicContext.existingTopics.length > 0) {
    payload.existingTopics = topicContext.existingTopics;
  }

  if (preferenceContext) {
    const hints: string[] = [];
    if (preferenceContext.bannedGenericTags.length > 0) {
      hints.push(`避免泛标签：${preferenceContext.bannedGenericTags.join("、")}`);
    }
    if (preferenceContext.preferredTopicAliases.length > 0) {
      const aliasStr = preferenceContext.preferredTopicAliases
        .slice(0, 3)
        .map((a) => `${a.from}→${a.to}`)
        .join("、");
      hints.push(`主题修正：${aliasStr}`);
    }
    if (hints.length > 0) {
      payload.preferenceHints = hints;
    }
  }

  const body = {
    model: config.model,
    temperature: 0.4,
    messages: [
      { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`请求失败 (${res.status}): ${errorText.slice(0, 100)}`);
    }

    const data = await res.json();
    const content = extractAssistantText(data);
    if (!content) throw new Error("AI 返回内容为空");

    const parsed = parseSynthesisResponse(content);
    return normalizeSynthesisResult(parsed, inputs);
  } finally {
    clearTimeout(timeout);
  }
}

/** 批量整理主入口（含降级） */
export async function generateSynthesisFromRecords(
  inputs: SynthesisInput[],
  sourceRecordIds: string[],
  mode: "selection" | "weekly_review",
  activeProfile: AIProfile | null,
  topicContext?: TopicContext,
  preferenceContext?: PreferenceContext,
  sourceTopic?: string,
  weekKey?: string,
): Promise<Synthesis> {
  const now = new Date().toISOString();
  const baseSynthesis: Synthesis = {
    id: generateId(),
    mode,
    title: "",
    overview: "",
    keyThemes: [],
    repeatedPatterns: [],
    openQuestions: [],
    opportunities: [],
    nextActions: [],
    oneLineSummary: "",
    sourceRecordIds,
    sourceRecordCount: inputs.length,
    weekKey,
    sourceTopic,
    status: "pending",
    source: "mock",
    createdAt: now,
    updatedAt: now,
  };

  // 尝试真实 AI
  if (activeProfile && isProfileConfigured(activeProfile)) {
    const config: AIConfig = {
      enabled: activeProfile.enabled,
      apiBaseUrl: activeProfile.apiBaseUrl,
      apiKey: activeProfile.apiKey,
      model: activeProfile.model,
      timeoutMs: activeProfile.timeoutMs,
      fallbackToMock: activeProfile.fallbackToMock,
    };

    try {
      const result = await callSynthesisAI(inputs, config, activeProfile.providerType, preferenceContext, topicContext);
      return {
        ...baseSynthesis,
        title: result.title,
        overview: result.overview,
        keyThemes: result.keyThemes,
        repeatedPatterns: result.repeatedPatterns,
        openQuestions: result.openQuestions,
        opportunities: result.opportunities,
        nextActions: result.nextActions,
        oneLineSummary: result.oneLineSummary,
        status: "done",
        source: "ai",
        aiProfileId: activeProfile.id,
        aiProfileName: activeProfile.name,
        aiModel: activeProfile.model,
        updatedAt: new Date().toISOString(),
      };
    } catch (primaryError) {
      const errorMsg = primaryError instanceof Error ? primaryError.message : "主配置调用失败";

      // 尝试备用
      const backup = getBackupProfileForSynthesis(activeProfile.id);
      if (backup && isProfileConfigured(backup)) {
        try {
          const backupConfig: AIConfig = {
            enabled: backup.enabled,
            apiBaseUrl: backup.apiBaseUrl,
            apiKey: backup.apiKey,
            model: backup.model,
            timeoutMs: backup.timeoutMs,
            fallbackToMock: backup.fallbackToMock,
          };
          const result = await callSynthesisAI(inputs, backupConfig, backup.providerType, preferenceContext, topicContext);
          return {
            ...baseSynthesis,
            title: result.title,
            overview: result.overview,
            keyThemes: result.keyThemes,
            repeatedPatterns: result.repeatedPatterns,
            openQuestions: result.openQuestions,
            opportunities: result.opportunities,
            nextActions: result.nextActions,
            oneLineSummary: result.oneLineSummary,
            status: "done",
            source: "ai",
            aiProfileId: backup.id,
            aiProfileName: backup.name,
            aiModel: backup.model,
            error: `主配置失败，已使用备用：${errorMsg}`,
            updatedAt: new Date().toISOString(),
          };
        } catch {
          // 备用也失败
        }
      }

      // mock 降级
      if (activeProfile.fallbackToMock) {
        const mock = generateMockSynthesis(inputs, mode, sourceTopic, weekKey);
        return {
          ...mock,
          id: baseSynthesis.id,
          sourceRecordIds,
          status: "done",
          source: "mock",
          error: `AI 服务暂时不可用，已使用本地汇总：${errorMsg}`,
        };
      }

      // 不回退
      return {
        ...baseSynthesis,
        status: "error",
        source: "ai",
        aiProfileId: activeProfile.id,
        aiProfileName: activeProfile.name,
        aiModel: activeProfile.model,
        error: errorMsg,
      };
    }
  }

  // 未配置 AI，直接 mock
  const mock = generateMockSynthesis(inputs, mode, sourceTopic, weekKey);
  return {
    ...mock,
    id: baseSynthesis.id,
    sourceRecordIds,
  };
}

/** 获取备用 Profile（用于批量整理） */
function getBackupProfileForSynthesis(excludeId: string): AIProfile | null {
  return getBackupProfile(excludeId);
}

/** 判断 Profile 是否已配置 */
function isProfileConfigured(profile: AIProfile): boolean {
  return checkProfileConfigured(profile);
}

// ============================================================
// 十四、Brief / 推进卡生成
// ============================================================

const BRIEF_SYSTEM_PROMPT = `你是一个帮助设计师把想法推进成轻量项目 brief 的助手。
你的任务不是写冗长方案，而是把一个想法、问题或整理结果，转化成一张清晰、可行动、适合个人推进的 brief 卡片。

适用场景：
- 作品集优化
- 个人品牌表达
- side project
- 客户项目方向
- 设计系统整理
- 视觉探索方向
- AI 工具 / 工作流优化

输出规则：
- 只返回 JSON
- 不要 markdown
- 不要代码块
- 不要额外解释
- 内容必须简洁、具体、可执行
- 不要写成空泛方案
- 不要过度脑补用户没有表达的内容
- 如果信息不足，也要保持克制，用"待确认问题"承接，而不是乱补全

字段要求：
- title：8~18 个中文字符，具体自然，不要空泛标题
- summary：1~2 句概述
- problemStatement：1~2 句，清楚说明问题
- objective：一句清楚目标
- targetContext：尽量简短，若信息不足可保守表达
- whyNow：一句简短理由，不要鸡汤
- scopeNow：1~3 条，当前阶段先做什么
- scopeLater：0~3 条，后续可扩展什么
- deliverables：1~3 条，本轮期望产出
- risksAndQuestions：0~3 条，待确认问题或风险
- nextActions：2~5 条，必须小、具体、可执行

nextActions 风格要求：
- 优先类似：写出首页第一屏文案、对比 3 个参考案例、画一个低保真结构、列出 2 个可选方向、拆出最小版本范围
- 避免类似：深入思考、持续优化、进一步完善、系统性推进`;

export interface BriefAIResult {
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

/** 解析 Brief AI 返回 */
function parseBriefResponse(text: string): Partial<BriefAIResult> {
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  try {
    return JSON.parse(jsonStr) as Partial<BriefAIResult>;
  } catch {
    throw new Error("Brief AI 返回内容无法解析为 JSON");
  }
}

/** 规范化 Brief 结果 */
function normalizeBriefResult(raw: Partial<BriefAIResult>): BriefAIResult {
  const title = typeof raw.title === "string" && raw.title.trim()
    ? raw.title.trim().slice(0, 18)
    : "待定义的推进方向";

  const summary = typeof raw.summary === "string" && raw.summary.trim()
    ? raw.summary.trim().slice(0, 100)
    : "需要进一步明确";

  const problemStatement = typeof raw.problemStatement === "string" && raw.problemStatement.trim()
    ? raw.problemStatement.trim().slice(0, 100)
    : "待明确问题";

  const objective = typeof raw.objective === "string" && raw.objective.trim()
    ? raw.objective.trim().slice(0, 80)
    : "待明确目标";

  const targetContext = typeof raw.targetContext === "string" && raw.targetContext.trim()
    ? raw.targetContext.trim().slice(0, 60)
    : "";

  const whyNow = typeof raw.whyNow === "string" && raw.whyNow.trim()
    ? raw.whyNow.trim().slice(0, 60)
    : "值得推进";

  const scopeNow = Array.isArray(raw.scopeNow)
    ? (raw.scopeNow as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  const scopeLater = Array.isArray(raw.scopeLater)
    ? (raw.scopeLater as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  const deliverables = Array.isArray(raw.deliverables)
    ? (raw.deliverables as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  const risksAndQuestions = Array.isArray(raw.risksAndQuestions)
    ? (raw.risksAndQuestions as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 3)
    : [];

  let nextActions = Array.isArray(raw.nextActions)
    ? (raw.nextActions as string[]).filter((s): s is string => typeof s === "string" && s.trim()).slice(0, 5)
    : [];
  // 过滤空泛建议
  nextActions = nextActions.filter((s) => !GENERIC_SUGGESTIONS.some((g) => s.includes(g)));
  if (nextActions.length === 0) {
    nextActions = ["拆出最小版本范围"];
  }

  return { title, summary, problemStatement, objective, targetContext, whyNow, scopeNow, scopeLater, deliverables, risksAndQuestions, nextActions };
}

/** 调用真实 AI 生成 Brief */
async function callBriefAI(
  sourceData: Record<string, unknown>,
  config: AIConfig,
  providerType?: string,
  preferenceContext?: PreferenceContext,
  topicContext?: TopicContext,
): Promise<BriefAIResult> {
  const endpoint = normalizeApiEndpoint(config.apiBaseUrl, providerType);

  const payload: Record<string, unknown> = { ...sourceData };

  if (topicContext && topicContext.existingTopics.length > 0) {
    payload.existingTopics = topicContext.existingTopics;
  }

  if (preferenceContext) {
    const hints: string[] = [];
    if (preferenceContext.bannedGenericTags.length > 0) {
      hints.push(`避免泛标签：${preferenceContext.bannedGenericTags.join("、")}`);
    }
    if (preferenceContext.preferredTopicAliases.length > 0) {
      const aliasStr = preferenceContext.preferredTopicAliases
        .slice(0, 3)
        .map((a) => `${a.from}→${a.to}`)
        .join("、");
      hints.push(`主题修正：${aliasStr}`);
    }
    if (hints.length > 0) {
      payload.preferenceHints = hints;
    }
  }

  const body = {
    model: config.model,
    temperature: 0.4,
    messages: [
      { role: "system", content: BRIEF_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`请求失败 (${res.status}): ${errorText.slice(0, 100)}`);
    }

    const data = await res.json();
    const content = extractAssistantText(data);
    if (!content) throw new Error("AI 返回内容为空");

    const parsed = parseBriefResponse(content);
    return normalizeBriefResult(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

/** 将 nextActions 字符串数组转为 BriefActionItem[] */
function actionsToItems(actions: string[], source: "ai" | "manual" = "ai"): BriefActionItem[] {
  const now = new Date().toISOString();
  return actions.map((content) => ({
    id: generateId(),
    content,
    done: false,
    source,
    createdAt: now,
    updatedAt: now,
  }));
}

/** Mock Brief fallback：从 Record 生成 */
export function generateMockBriefFromRecord(
  rawText: string,
  aiTitle?: string,
  aiSummary?: string,
  type?: string,
  tags?: string[],
  topic?: string,
  promoteLevel?: string,
  suggestions?: string[],
): ProjectBrief {
  const now = new Date().toISOString();
  const title = aiTitle || rawText.slice(0, 18);
  const summary = aiSummary || rawText.slice(0, 50);
  const isQuestion = type === "问题";
  const isAction = promoteLevel === "建议行动" || promoteLevel === "建议立项";

  const problemStatement = isQuestion
    ? `需要解决：${aiTitle || rawText.slice(0, 30)}`
    : `当前状态与期望之间有差距：${(aiSummary || rawText).slice(0, 40)}`;

  const objective = isAction
    ? `完成 ${(aiTitle || "此方向").slice(0, 20)} 的推进`
    : `进一步明确 ${(aiTitle || "此方向").slice(0, 20)} 的方向`;

  const scopeNow = tags && tags.length > 0
    ? tags.slice(0, 3).map((t) => `明确${t}相关的具体方向`)
    : ["拆出最小版本范围"];

  const deliverables = isAction
    ? ["一份可执行的最小方案"]
    : ["一个清晰的方向判断"];

  const risksAndQuestions = isQuestion
    ? ["核心问题是否定义清楚？"]
    : [];

  const nextActions = suggestions && suggestions.length > 0
    ? suggestions.slice(0, 3)
    : ["拆出最小版本范围", "列出 2 个可选方向"];

  return {
    id: generateId(),
    title,
    summary,
    problemStatement,
    objective,
    targetContext: topic || "",
    whyNow: "已积累足够想法，值得推进",
    scopeNow,
    scopeLater: [],
    deliverables,
    risksAndQuestions,
    nextActions: actionsToItems(nextActions),
    topic: topic || undefined,
    status: "草稿",
    sourceType: "record",
    sourceRecordIds: [],
    sourceSummary: rawText.slice(0, 80),
    source: "mock",
    createdAt: now,
    updatedAt: now,
  };
}

/** Mock Brief fallback：从 Synthesis 生成 */
export function generateMockBriefFromSynthesis(
  synOverview: string,
  synTitle: string,
  keyThemes: string[],
  repeatedPatterns: string[],
  openQuestions: string[],
  opportunities: string[],
  nextActions: string[],
  topic?: string,
  sourceSynthesisId?: string,
  sourceRecordIds: string[] = [],
): ProjectBrief {
  const now = new Date().toISOString();

  const problemStatement = repeatedPatterns.length > 0
    ? `反复出现：${repeatedPatterns[0]}`
    : openQuestions.length > 0
      ? `尚未解决：${openQuestions[0]}`
      : "从多个想法中提炼出可推进方向";

  const objective = opportunities.length > 0
    ? `抓住机会：${opportunities[0].slice(0, 20)}`
    : "将碎片想法推进为可执行方案";

  const scopeNow = keyThemes.length > 0
    ? keyThemes.slice(0, 3).map((t) => `围绕「${t}」展开推进`)
    : ["确定最值得推进的 1 个方向"];

  const deliverables = ["一份可执行的最小方案"];
  const risksAndQuestions = openQuestions.slice(0, 3);

  return {
    id: generateId(),
    title: synTitle,
    summary: synOverview.slice(0, 100),
    problemStatement,
    objective,
    targetContext: topic || "",
    whyNow: "多个想法指向同一方向，值得集中推进",
    scopeNow,
    scopeLater: [],
    deliverables,
    risksAndQuestions,
    nextActions: actionsToItems(nextActions.length > 0 ? nextActions : ["整理出最值得推进的 1 个方向"]),
    topic: topic || undefined,
    status: "草稿",
    sourceType: "synthesis",
    sourceRecordIds,
    sourceSynthesisId,
    sourceSummary: synOverview.slice(0, 80),
    source: "mock",
    createdAt: now,
    updatedAt: now,
  };
}

/** Brief 生成主入口（含降级）：从 Record */
export async function generateBriefFromRecord(
  record: { rawText: string; aiTitle?: string; aiSummary?: string; type?: string; tags?: string[]; topic?: string; promoteLevel?: string; suggestions?: string[]; id: string },
  activeProfile: AIProfile | null,
  topicContext?: TopicContext,
  preferenceContext?: PreferenceContext,
): Promise<ProjectBrief> {
  const now = new Date().toISOString();
  const topic = record.topic || undefined;

  // 尝试真实 AI
  if (activeProfile && checkProfileConfigured(activeProfile)) {
    const config: AIConfig = {
      enabled: activeProfile.enabled,
      apiBaseUrl: activeProfile.apiBaseUrl,
      apiKey: activeProfile.apiKey,
      model: activeProfile.model,
      timeoutMs: activeProfile.timeoutMs,
      fallbackToMock: activeProfile.fallbackToMock,
    };

    try {
      const sourceData: Record<string, unknown> = {
        sourceType: "record",
        rawText: record.rawText.slice(0, 200),
        aiTitle: record.aiTitle,
        aiSummary: record.aiSummary,
        type: record.type,
        tags: record.tags,
        topic: record.topic,
        promoteLevel: record.promoteLevel,
        suggestions: record.suggestions,
      };

      const result = await callBriefAI(sourceData, config, activeProfile.providerType, preferenceContext, topicContext);
      const brief: ProjectBrief = {
        id: generateId(),
        title: result.title,
        summary: result.summary,
        problemStatement: result.problemStatement,
        objective: result.objective,
        targetContext: result.targetContext,
        whyNow: result.whyNow,
        scopeNow: result.scopeNow,
        scopeLater: result.scopeLater,
        deliverables: result.deliverables,
        risksAndQuestions: result.risksAndQuestions,
        nextActions: actionsToItems(result.nextActions),
        topic,
        status: "草稿",
        sourceType: "record",
        sourceRecordIds: [record.id],
        sourceSummary: record.rawText.slice(0, 80),
        source: "ai",
        aiProfileId: activeProfile.id,
        aiProfileName: activeProfile.name,
        aiModel: activeProfile.model,
        aiOriginalBriefResult: {
          title: result.title,
          summary: result.summary,
          problemStatement: result.problemStatement,
          objective: result.objective,
          targetContext: result.targetContext,
          whyNow: result.whyNow,
          scopeNow: result.scopeNow,
          scopeLater: result.scopeLater,
          deliverables: result.deliverables,
          risksAndQuestions: result.risksAndQuestions,
          nextActions: result.nextActions,
        },
        createdAt: now,
        updatedAt: now,
      };
      return brief;
    } catch (primaryError) {
      const errorMsg = primaryError instanceof Error ? primaryError.message : "主配置调用失败";

      // 尝试备用
      const backup = getBackupProfile(activeProfile.id);
      if (backup && checkProfileConfigured(backup)) {
        try {
          const backupConfig: AIConfig = {
            enabled: backup.enabled,
            apiBaseUrl: backup.apiBaseUrl,
            apiKey: backup.apiKey,
            model: backup.model,
            timeoutMs: backup.timeoutMs,
            fallbackToMock: backup.fallbackToMock,
          };
          const sourceData: Record<string, unknown> = {
            sourceType: "record",
            rawText: record.rawText.slice(0, 200),
            aiTitle: record.aiTitle,
            aiSummary: record.aiSummary,
            type: record.type,
            tags: record.tags,
            topic: record.topic,
            promoteLevel: record.promoteLevel,
            suggestions: record.suggestions,
          };

          const result = await callBriefAI(sourceData, backupConfig, backup.providerType, preferenceContext, topicContext);
          const brief: ProjectBrief = {
            id: generateId(),
            title: result.title,
            summary: result.summary,
            problemStatement: result.problemStatement,
            objective: result.objective,
            targetContext: result.targetContext,
            whyNow: result.whyNow,
            scopeNow: result.scopeNow,
            scopeLater: result.scopeLater,
            deliverables: result.deliverables,
            risksAndQuestions: result.risksAndQuestions,
            nextActions: actionsToItems(result.nextActions),
            topic,
            status: "草稿",
            sourceType: "record",
            sourceRecordIds: [record.id],
            sourceSummary: record.rawText.slice(0, 80),
            source: "ai",
            aiProfileId: backup.id,
            aiProfileName: backup.name,
            aiModel: backup.model,
            error: `主配置失败，已使用备用：${errorMsg}`,
            createdAt: now,
            updatedAt: now,
          };
          return brief;
        } catch {
          // 备用也失败
        }
      }

      // mock 降级
      if (activeProfile.fallbackToMock) {
        const mock = generateMockBriefFromRecord(
          record.rawText, record.aiTitle, record.aiSummary, record.type,
          record.tags, record.topic, record.promoteLevel, record.suggestions,
        );
        return {
          ...mock,
          sourceRecordIds: [record.id],
          topic,
          error: `AI 服务暂时不可用，已使用本地生成：${errorMsg}`,
        };
      }

      // 不回退
      return {
        id: generateId(),
        title: record.aiTitle || "生成失败",
        summary: "",
        problemStatement: "",
        objective: "",
        targetContext: "",
        whyNow: "",
        scopeNow: [],
        scopeLater: [],
        deliverables: [],
        risksAndQuestions: [],
        nextActions: [],
        topic,
        status: "草稿",
        sourceType: "record",
        sourceRecordIds: [record.id],
        sourceSummary: record.rawText.slice(0, 80),
        source: "ai",
        aiProfileId: activeProfile.id,
        aiProfileName: activeProfile.name,
        aiModel: activeProfile.model,
        error: errorMsg,
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  // 未配置 AI，直接 mock
  const mock = generateMockBriefFromRecord(
    record.rawText, record.aiTitle, record.aiSummary, record.type,
    record.tags, record.topic, record.promoteLevel, record.suggestions,
  );
  return { ...mock, sourceRecordIds: [record.id], topic };
}

/** Brief 生成主入口（含降级）：从 Synthesis */
export async function generateBriefFromSynthesis(
  synthesis: Synthesis,
  activeProfile: AIProfile | null,
  topicContext?: TopicContext,
  preferenceContext?: PreferenceContext,
): Promise<ProjectBrief> {
  const now = new Date().toISOString();
  const topic = synthesis.sourceTopic || (synthesis.keyThemes.length > 0 ? synthesis.keyThemes[0] : undefined);

  // 尝试真实 AI
  if (activeProfile && checkProfileConfigured(activeProfile)) {
    const config: AIConfig = {
      enabled: activeProfile.enabled,
      apiBaseUrl: activeProfile.apiBaseUrl,
      apiKey: activeProfile.apiKey,
      model: activeProfile.model,
      timeoutMs: activeProfile.timeoutMs,
      fallbackToMock: activeProfile.fallbackToMock,
    };

    try {
      const sourceData: Record<string, unknown> = {
        sourceType: "synthesis",
        title: synthesis.title,
        overview: synthesis.overview,
        keyThemes: synthesis.keyThemes,
        repeatedPatterns: synthesis.repeatedPatterns,
        openQuestions: synthesis.openQuestions,
        opportunities: synthesis.opportunities,
        nextActions: synthesis.nextActions,
        oneLineSummary: synthesis.oneLineSummary,
        sourceRecordCount: synthesis.sourceRecordCount,
      };

      const result = await callBriefAI(sourceData, config, activeProfile.providerType, preferenceContext, topicContext);
      const brief: ProjectBrief = {
        id: generateId(),
        title: result.title,
        summary: result.summary,
        problemStatement: result.problemStatement,
        objective: result.objective,
        targetContext: result.targetContext,
        whyNow: result.whyNow,
        scopeNow: result.scopeNow,
        scopeLater: result.scopeLater,
        deliverables: result.deliverables,
        risksAndQuestions: result.risksAndQuestions,
        nextActions: actionsToItems(result.nextActions),
        topic,
        status: "草稿",
        sourceType: "synthesis",
        sourceRecordIds: synthesis.sourceRecordIds,
        sourceSynthesisId: synthesis.id,
        sourceSummary: synthesis.overview.slice(0, 80),
        source: "ai",
        aiProfileId: activeProfile.id,
        aiProfileName: activeProfile.name,
        aiModel: activeProfile.model,
        aiOriginalBriefResult: {
          title: result.title,
          summary: result.summary,
          problemStatement: result.problemStatement,
          objective: result.objective,
          targetContext: result.targetContext,
          whyNow: result.whyNow,
          scopeNow: result.scopeNow,
          scopeLater: result.scopeLater,
          deliverables: result.deliverables,
          risksAndQuestions: result.risksAndQuestions,
          nextActions: result.nextActions,
        },
        createdAt: now,
        updatedAt: now,
      };
      return brief;
    } catch (primaryError) {
      const errorMsg = primaryError instanceof Error ? primaryError.message : "主配置调用失败";

      // 尝试备用
      const backup = getBackupProfile(activeProfile.id);
      if (backup && checkProfileConfigured(backup)) {
        try {
          const backupConfig: AIConfig = {
            enabled: backup.enabled,
            apiBaseUrl: backup.apiBaseUrl,
            apiKey: backup.apiKey,
            model: backup.model,
            timeoutMs: backup.timeoutMs,
            fallbackToMock: backup.fallbackToMock,
          };
          const sourceData: Record<string, unknown> = {
            sourceType: "synthesis",
            title: synthesis.title,
            overview: synthesis.overview,
            keyThemes: synthesis.keyThemes,
            repeatedPatterns: synthesis.repeatedPatterns,
            openQuestions: synthesis.openQuestions,
            opportunities: synthesis.opportunities,
            nextActions: synthesis.nextActions,
            oneLineSummary: synthesis.oneLineSummary,
            sourceRecordCount: synthesis.sourceRecordCount,
          };

          const result = await callBriefAI(sourceData, backupConfig, backup.providerType, preferenceContext, topicContext);
          const brief: ProjectBrief = {
            id: generateId(),
            title: result.title,
            summary: result.summary,
            problemStatement: result.problemStatement,
            objective: result.objective,
            targetContext: result.targetContext,
            whyNow: result.whyNow,
            scopeNow: result.scopeNow,
            scopeLater: result.scopeLater,
            deliverables: result.deliverables,
            risksAndQuestions: result.risksAndQuestions,
            nextActions: actionsToItems(result.nextActions),
            topic,
            status: "草稿",
            sourceType: "synthesis",
            sourceRecordIds: synthesis.sourceRecordIds,
            sourceSynthesisId: synthesis.id,
            sourceSummary: synthesis.overview.slice(0, 80),
            source: "ai",
            aiProfileId: backup.id,
            aiProfileName: backup.name,
            aiModel: backup.model,
            error: `主配置失败，已使用备用：${errorMsg}`,
            createdAt: now,
            updatedAt: now,
          };
          return brief;
        } catch {
          // 备用也失败
        }
      }

      // mock 降级
      if (activeProfile.fallbackToMock) {
        const mock = generateMockBriefFromSynthesis(
          synthesis.overview, synthesis.title, synthesis.keyThemes,
          synthesis.repeatedPatterns, synthesis.openQuestions,
          synthesis.opportunities, synthesis.nextActions,
          topic, synthesis.id, synthesis.sourceRecordIds,
        );
        return {
          ...mock,
          error: `AI 服务暂时不可用，已使用本地生成：${errorMsg}`,
        };
      }

      return {
        id: generateId(),
        title: synthesis.title || "生成失败",
        summary: "",
        problemStatement: "",
        objective: "",
        targetContext: "",
        whyNow: "",
        scopeNow: [],
        scopeLater: [],
        deliverables: [],
        risksAndQuestions: [],
        nextActions: [],
        topic,
        status: "草稿",
        sourceType: "synthesis",
        sourceRecordIds: synthesis.sourceRecordIds,
        sourceSynthesisId: synthesis.id,
        sourceSummary: synthesis.overview.slice(0, 80),
        source: "ai",
        aiProfileId: activeProfile.id,
        aiProfileName: activeProfile.name,
        aiModel: activeProfile.model,
        error: errorMsg,
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  // 未配置 AI，直接 mock
  return generateMockBriefFromSynthesis(
    synthesis.overview, synthesis.title, synthesis.keyThemes,
    synthesis.repeatedPatterns, synthesis.openQuestions,
    synthesis.opportunities, synthesis.nextActions,
    topic, synthesis.id, synthesis.sourceRecordIds,
  );
}
