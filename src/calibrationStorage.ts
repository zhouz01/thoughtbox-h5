import type { RecordType, AIPreferences } from "./types";

// ============================================================
// 类型定义
// ============================================================

export interface CalibrationSample {
  id: string;
  name: string;
  rawText: string;
  expectedType: RecordType;
  expectedTopic?: string;
  expectedHasSuggestions?: boolean;
  notes?: string;
  isKeySample: boolean;        // 重点样本
  createdAt: string;
  lastTestedAt?: string;
  lastResultSummary?: string;
}

export interface CalibrationExpectation {
  expectedType: RecordType;
  expectedSubType?: string;
  expectedTopic?: string;
  expectedTags?: string;       // 逗号分隔
  expectedHasSuggestions?: boolean;
  notes?: string;
}

export type QualityLevel = "通过" | "需注意" | "明显不合理";

export interface QualityCheck {
  titleQuality: QualityLevel;
  typeQuality: QualityLevel;
  tagQuality: QualityLevel;
  topicQuality: QualityLevel;
  suggestionQuality: QualityLevel;
  overallQuality: QualityLevel;
  warnings: string[];
}

export interface CalibrationTestResult {
  sampleId: string;
  sampleName: string;
  rawText: string;
  actualResult: {
    title: string;
    summary: string;
    type: string;
    aiSubType?: string;
    typeConfidence?: number;
    typeReason?: string;
    tags: string[];
    topic: string;
    promoteLevel: string;
    suggestions: string[];
    organizeSource: string;
    profileName?: string;
    modelName?: string;
    durationMs: number;
    usedBackup: boolean;
    usedFallback: boolean;
  };
  expectation: CalibrationExpectation;
  qualityCheck: QualityCheck;
  typeMatch: boolean;
  topicReasonable: boolean;
  suggestionPassed: boolean;
  testedAt: string;
}

export interface BatchTestSummary {
  totalSamples: number;
  typeMatchCount: number;
  topicReasonableCount: number;
  suggestionPassedCount: number;
  failedCount: number;
  results: CalibrationTestResult[];
  runAt: string;
}

// ============================================================
// localStorage keys
// ============================================================

const SAMPLES_KEY = "thoughtbox_calibration_samples";
const LAST_INPUT_KEY = "thoughtbox_calibration_last_input";
const LAST_EXPECTATION_KEY = "thoughtbox_calibration_last_expectation";
const BATCH_RESULT_KEY = "thoughtbox_calibration_batch_result";

// ============================================================
// ID 生成
// ============================================================

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================================================
// 预置样本库（20 条，贴近设计师日常）
// ============================================================

export const PRESET_SAMPLES: Omit<CalibrationSample, "id" | "createdAt" | "isKeySample" | "lastTestedAt" | "lastResultSummary">[] = [
  // 1. 生活随记
  { name: "状态散了", rawText: "今天突然觉得最近状态有点散，需要调整一下节奏", expectedType: "随记" },
  // 2. 生活随记
  { name: "刷手机太多", rawText: "最近总觉得自己刷手机太多了，应该找点别的事做", expectedType: "随记" },
  // 3. 灵感
  { name: "作品集首页叙事", rawText: "作品集首页不应该先堆项目，应该先让我是谁更清楚", expectedType: "灵感", expectedTopic: "作品集" },
  // 4. 灵感
  { name: "设计师记录工具", rawText: "可以做一个给设计师记录灵感的工具，自动整理成卡片", expectedType: "灵感", expectedTopic: "工具" },
  // 5. 灵感
  { name: "个人品牌色调", rawText: "想用深色 + 一个明亮的accent色做个人品牌，不要太冷淡也不要太活泼", expectedType: "灵感", expectedTopic: "品牌" },
  // 6. 待办
  { name: "整理品牌文案", rawText: "这周要整理个人品牌的介绍文案，不能再拖了", expectedType: "待办", expectedHasSuggestions: true },
  // 7. 待办
  { name: "买洗衣液", rawText: "晚上记得买洗衣液", expectedType: "待办" },
  // 8. 待办
  { name: "补首页文案", rawText: "明天补一下作品集首页文案，把 hero 区的表达再打磨一下", expectedType: "待办", expectedTopic: "作品集" },
  // 9. 项目
  { name: "重做作品集", rawText: "准备重做个人作品集，需要重新梳理结构和叙事", expectedType: "项目", expectedTopic: "作品集", expectedHasSuggestions: true },
  // 10. 项目
  { name: "想法记录app", rawText: "想做一个记录想法并自动整理的 app，从自己的痛点出发", expectedType: "项目", expectedTopic: "工具" },
  // 11. 问题
  { name: "首页定位vs案例", rawText: "作品集首页到底该先讲定位还是先放案例？纠结好久了", expectedType: "问题", expectedTopic: "作品集" },
  // 12. 问题
  { name: "视觉方向太安全", rawText: "这个视觉方向太安全了，怎么做得更有记忆点又不失专业感", expectedType: "问题", expectedTopic: "视觉" },
  // 13. 复盘
  { name: "客户项目复盘", rawText: "这个客户项目第二版比第一版更完整，但差异点不够集中，复盘一下", expectedType: "复盘", expectedTopic: "客户项目" },
  // 14. 复盘
  { name: "提案失败复盘", rawText: "这次提案失败主要是叙事顺序不清楚，客户说没看懂核心价值", expectedType: "复盘" },
  // 15. 参考
  { name: "SaaS官网参考", rawText: "今天看到一个 SaaS 官网，留白和模块节奏很舒服，值得参考", expectedType: "参考" },
  // 16. 参考
  { name: "作品集案例", rawText: "收藏一个作品集案例，开头叙事很好，值得学习", expectedType: "参考", expectedTopic: "作品集" },
  // 17. 参考
  { name: "AI生图风格", rawText: "看到一个 AI 生图的风格很特别，光影处理方式可以借鉴", expectedType: "参考", expectedTopic: "AI" },
  // 18. 随记（日常小事 - 不应分为参考）
  { name: "周末逛书店", rawText: "周末也许想去书店逛逛，找点灵感", expectedType: "随记" },
  // 19. 项目（品牌相关）
  { name: "升级个人品牌", rawText: "想升级一下个人品牌的视觉体系，目前太普通了", expectedType: "项目", expectedTopic: "品牌" },
  // 20. 灵感（AI工具相关）
  { name: "AI整理工作流", rawText: "如果能用 AI 自动把碎片想法整理成结构化记录，再生成周报，那就太好了", expectedType: "灵感", expectedTopic: "AI" },
];

// ============================================================
// CRUD
// ============================================================

export function loadCalibrationSamples(): CalibrationSample[] {
  try {
    const raw = localStorage.getItem(SAMPLES_KEY);
    if (raw) {
      const samples: CalibrationSample[] = JSON.parse(raw);
      if (samples.length > 0) return samples;
    }
  } catch { /* ignore */ }

  // 首次加载：使用预置样本
  const initial: CalibrationSample[] = PRESET_SAMPLES.map((s) => ({
    ...s,
    id: genId(),
    isKeySample: false,
    createdAt: new Date().toISOString(),
  }));
  saveCalibrationSamples(initial);
  return initial;
}

export function saveCalibrationSamples(samples: CalibrationSample[]): void {
  localStorage.setItem(SAMPLES_KEY, JSON.stringify(samples));
}

export function addCalibrationSample(sample: Omit<CalibrationSample, "id" | "createdAt">): CalibrationSample {
  const samples = loadCalibrationSamples();
  const newSample: CalibrationSample = {
    ...sample,
    id: genId(),
    createdAt: new Date().toISOString(),
  };
  samples.push(newSample);
  saveCalibrationSamples(samples);
  return newSample;
}

export function updateCalibrationSample(updated: CalibrationSample): void {
  const samples = loadCalibrationSamples();
  const idx = samples.findIndex((s) => s.id === updated.id);
  if (idx !== -1) {
    samples[idx] = updated;
    saveCalibrationSamples(samples);
  }
}

export function deleteCalibrationSample(id: string): void {
  const samples = loadCalibrationSamples().filter((s) => s.id !== id);
  saveCalibrationSamples(samples);
}

export function toggleKeySample(id: string): void {
  const samples = loadCalibrationSamples();
  const sample = samples.find((s) => s.id === id);
  if (sample) {
    sample.isKeySample = !sample.isKeySample;
    saveCalibrationSamples(samples);
  }
}

// ============================================================
// 最近输入 / 期望
// ============================================================

export function loadLastInput(): string {
  return localStorage.getItem(LAST_INPUT_KEY) || "";
}

export function saveLastInput(text: string): void {
  localStorage.setItem(LAST_INPUT_KEY, text);
}

export function loadLastExpectation(): CalibrationExpectation | null {
  try {
    const raw = localStorage.getItem(LAST_EXPECTATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveLastExpectation(exp: CalibrationExpectation): void {
  localStorage.setItem(LAST_EXPECTATION_KEY, JSON.stringify(exp));
}

// ============================================================
// 批量测试结果
// ============================================================

export function loadBatchResult(): BatchTestSummary | null {
  try {
    const raw = localStorage.getItem(BATCH_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveBatchResult(result: BatchTestSummary): void {
  localStorage.setItem(BATCH_RESULT_KEY, JSON.stringify(result));
}

// ============================================================
// 质量检查规则
// ============================================================

const GENERIC_TITLES = ["想法整理", "记录整理", "设计思路", "优化建议", "灵感记录", "想法记录", "设计优化", "内容整理", "工作思考"];
const GENERIC_TAGS = ["设计", "想法", "优化", "内容", "记录", "工作", "思考", "整理", "项目"];
const GENERIC_SUGGESTIONS = ["深入思考", "持续优化", "进一步完善", "开展研究", "加强理解", "深入分析", "持续改进", "全面优化"];
const GENERIC_TOPICS = ["设计", "项目", "想法", "记录", "工作", "其他", "杂项"];

function checkGeneric(title: string, list: string[]): boolean {
  return list.some((g) => title.includes(g));
}

/** 对单条结果做质量检查 */
export function runQualityCheck(result: {
  title: string;
  type: string;
  tags: string[];
  topic: string;
  suggestions: string[];
  rawText: string;
}, expectation?: CalibrationExpectation): QualityCheck {
  const warnings: string[] = [];

  // 标题
  let titleQuality: QualityLevel = "通过";
  if (GENERIC_TITLES.some((g) => result.title.includes(g))) {
    titleQuality = "明显不合理";
    warnings.push("标题过泛");
  } else if (result.title.length < 4) {
    titleQuality = "需注意";
    warnings.push("标题太短");
  }

  // 类型
  let typeQuality: QualityLevel = "通过";
  const validTypes = ["随记", "灵感", "待办", "项目", "问题", "复盘", "参考"];
  if (!validTypes.includes(result.type)) {
    typeQuality = "明显不合理";
    warnings.push("类型不在 7 类中");
  } else if (expectation && result.type !== expectation.expectedType) {
    typeQuality = "需注意";
    warnings.push(`类型与期望不符（实际: ${result.type}，期望: ${expectation.expectedType}）`);
  }
  // 生活内容不应被分为参考
  const lifeKeywords = ["今天", "最近", "觉得", "想", "也许", "突然"];
  if (result.type === "参考" && lifeKeywords.some((k) => result.rawText.includes(k))) {
    typeQuality = "明显不合理";
    warnings.push("生活内容不应分为参考");
  }

  // 标签
  let tagQuality: QualityLevel = "通过";
  const genericTagCount = result.tags.filter((t) => GENERIC_TAGS.includes(t)).length;
  if (genericTagCount === result.tags.length && result.tags.length > 0) {
    tagQuality = "明显不合理";
    warnings.push("所有标签都偏泛");
  } else if (genericTagCount > 0) {
    tagQuality = "需注意";
    warnings.push(`包含泛标签: ${result.tags.filter((t) => GENERIC_TAGS.includes(t)).join("、")}`);
  }

  // 主题
  let topicQuality: QualityLevel = "通过";
  if (GENERIC_TOPICS.includes(result.topic)) {
    topicQuality = "需注意";
    warnings.push("主题偏泛");
  }
  if (result.topic === "未分类主题") {
    topicQuality = "需注意";
    warnings.push("主题未分类");
  }

  // 建议
  let suggestionQuality: QualityLevel = "通过";
  const genericSuggCount = result.suggestions.filter((s) => GENERIC_SUGGESTIONS.some((g) => s.includes(g))).length;
  if (genericSuggCount > 0) {
    suggestionQuality = genericSuggCount === result.suggestions.length ? "明显不合理" : "需注意";
    warnings.push(genericSuggCount === result.suggestions.length ? "所有建议都偏空" : `包含空泛建议`);
  }
  if (expectation?.expectedHasSuggestions && result.suggestions.length === 0) {
    suggestionQuality = "需注意";
    warnings.push("期望有建议但实际为空");
  }

  // 总体
  const qualities = [titleQuality, typeQuality, tagQuality, topicQuality, suggestionQuality];
  const overallQuality: QualityLevel = qualities.includes("明显不合理") ? "明显不合理"
    : qualities.includes("需注意") ? "需注意" : "通过";

  return { titleQuality, typeQuality, tagQuality, topicQuality, suggestionQuality, overallQuality, warnings };
}
