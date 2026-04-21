import type { ThoughtRecord, RecordType, PromoteLevel } from "./types";
import { generateId } from "./storage";

// --- type 判断 ---
function inferType(text: string): RecordType {
  const t = text.toLowerCase();
  if (/需要|待办|明天|记得|安排|要做/.test(t)) return "待办";
  if (/项目|版本|客户|需求|改版/.test(t)) return "项目";
  if (/为什么|怎么|是否|问题|卡住/.test(t)) return "问题";
  if (/参考|案例|看到|收藏/.test(t)) return "参考";
  if (/复盘|总结|反思|教训/.test(t)) return "复盘";
  return "灵感";
}

// --- topic 判断 ---
function inferTopic(text: string): string {
  const t = text.toLowerCase();
  if (/作品集|case\s*study|项目集/.test(t)) return "作品集";
  if (/品牌|文案|表达/.test(t)) return "个人品牌";
  if (/ai|工具|workflow|流程/.test(t)) return "AI 工具";
  if (/客户|提案|商业/.test(t)) return "客户项目";
  if (/设计系统|组件|token|命名/.test(t)) return "设计系统";
  if (/灵感|风格|视觉|插画|方向|记忆点/.test(t)) return "视觉探索";
  return "未分类主题";
}

// --- title 生成 ---
function generateTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 18) return cleaned;
  // 截取前 15 字 + …
  return cleaned.slice(0, 15) + "…";
}

// --- summary 生成 ---
function generateSummary(text: string, type: RecordType): string {
  const t = text.trim();
  if (t.length <= 40) return t;
  return t.slice(0, 38) + "…";
}

// --- tags 提取 ---
function inferTags(text: string, type: RecordType, topic: string): string[] {
  const tags: string[] = [];
  if (type !== "灵感") tags.push(type);
  if (topic !== "未分类主题") tags.push(topic);
  // 简单关键词补充
  if (/设计/.test(text)) tags.push("设计");
  if (/app|应用/.test(text.toLowerCase())) tags.push("应用");
  if (/首页|CTA|官网/.test(text)) tags.push("界面");
  if (/模板|模版/.test(text)) tags.push("模板化");
  // 去重 & 限制 4 个
  return [...new Set(tags)].slice(0, 4);
}

// --- promoteLevel ---
function inferPromoteLevel(type: RecordType, text: string): PromoteLevel {
  switch (type) {
    case "待办":
      return "建议行动";
    case "项目":
      return "建议立项";
    case "问题":
      return "建议观察";
    case "复盘":
      return /行动|改变|调整/.test(text) ? "建议观察" : "仅保存";
    case "参考":
      return /可以|值得|试试/.test(text) ? "建议观察" : "仅保存";
    default:
      return /可以|也许|试试/.test(text) ? "建议观察" : "仅保存";
  }
}

// --- suggestions ---
function inferSuggestions(type: RecordType, topic: string): string[] {
  const pool: Record<RecordType, string[]> = {
    灵感: ["补充这条想法的使用场景", "找到 3 个类似案例参考", "整理成最小可执行描述"],
    项目: ["整理成项目 brief", "列出关键里程碑", "明确交付标准和时间线"],
    待办: ["拆分成具体执行步骤", "设定完成时间", "标注优先级"],
    参考: ["标注可复用的要点", "关联到现有项目", "保存关键截图或链接"],
    问题: ["列出可能的解决方向", "找到能帮忙解答的人", "写清问题的上下文"],
    复盘: ["提取 3 条核心教训", "标注下次可改进的环节", "记录有效的做法"],
  };
  return pool[type].slice(0, 3);
}

// --- 主方法：创建 pending 记录 ---
export function createPendingRecord(rawText: string): ThoughtRecord {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    rawText,
    createdAt: now,
    updatedAt: now,
    aiStatus: "pending",
    aiTitle: "",
    aiSummary: "",
    type: "灵感",
    tags: [],
    topic: "",
    promoteLevel: "仅保存",
    suggestions: [],
    archived: false,
  };
}

// --- 模拟 AI 整理 ---
export function organizeRecord(record: ThoughtRecord): ThoughtRecord {
  const text = record.rawText;
  const type = inferType(text);
  const topic = inferTopic(text);
  const tags = inferTags(text, type, topic);
  const promoteLevel = inferPromoteLevel(type, text);
  const suggestions = inferSuggestions(type, topic);

  return {
    ...record,
    aiStatus: "done",
    aiTitle: generateTitle(text),
    aiSummary: generateSummary(text, type),
    type,
    tags,
    topic,
    promoteLevel,
    suggestions,
    updatedAt: new Date().toISOString(),
  };
}
