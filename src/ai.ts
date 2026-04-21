import type { ThoughtRecord, RecordType, PromoteLevel } from "./types";
import { generateId } from "./storage";

// --- type 判断（7 主类型） ---
function inferType(text: string): RecordType {
  const t = text.toLowerCase();
  // 复盘：最高优先级，对已发生事情的总结
  if (/复盘|总结|反思|教训|回顾/.test(t)) return "复盘";
  // 参考：必须是外部来源
  if (/参考|案例|看到|收藏|读到|学到|借鉴/.test(t)) return "参考";
  // 待办：明确要执行的动作
  if (/需要|待办|明天|记得|安排|要做|补一下|整理一下/.test(t)) return "待办";
  // 问题：卡住点、不确定
  if (/为什么|怎么|是否|问题|卡住|到底|困惑/.test(t)) return "问题";
  // 项目：持续推进的事项
  if (/项目|版本|客户|需求|改版|重做|开发|搭建/.test(t)) return "项目";
  // 灵感：创意方向、点子
  if (/可以|也许|想法|点子|方向|风格|尝试/.test(t)) return "灵感";
  // 兜底：生活小事、日常感受、碎片观察 → 随记
  if (/觉得|状态|最近|今天|周末|也许想|感觉/.test(t)) return "随记";
  return "随记";
}

// --- 子类型判断 ---
function inferSubType(text: string, type: RecordType): string {
  const t = text.toLowerCase();
  switch (type) {
    case "随记":
      if (/状态|觉得|感觉/.test(t)) return "生活感受";
      if (/记得|提醒/.test(t)) return "生活提醒";
      return "日常记录";
    case "灵感":
      if (/首页|结构|布局/.test(t)) return "结构思路";
      if (/风格|视觉|插画/.test(t)) return "视觉方向";
      if (/工具|app|产品/.test(t)) return "产品点子";
      return "创意方向";
    case "待办":
      if (/文案|文字|内容/.test(t)) return "文案任务";
      if (/设计|界面|视觉/.test(t)) return "设计任务";
      return "待办事项";
    case "项目":
      if (/作品集|case/.test(t)) return "作品集结构";
      if (/品牌|表达/.test(t)) return "品牌升级";
      if (/工具|app/.test(t)) return "工具开发";
      return "项目推进";
    case "问题":
      if (/顺序|结构|布局/.test(t)) return "设计判断";
      if (/方向|风格/.test(t)) return "方向选择";
      return "待解问题";
    case "复盘":
      if (/客户|提案/.test(t)) return "客户复盘";
      if (/项目|版本/.test(t)) return "项目复盘";
      return "经验总结";
    case "参考":
      if (/官网|网页|网站/.test(t)) return "网页案例";
      if (/作品集|case/.test(t)) return "作品集案例";
      if (/风格|视觉/.test(t)) return "设计风格";
      return "外部参考";
    default:
      return "日常记录";
  }
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
function inferTags(text: string, type: RecordType, topic: string, aiSubType?: string): string[] {
  const tags: string[] = [];
  if (type !== "灵感" && type !== "随记") tags.push(type);
  if (topic !== "未分类主题") tags.push(topic);
  if (aiSubType && aiSubType !== type) tags.push(aiSubType);
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
    case "随记":
      return "仅保存";
    default:
      return /可以|也许|试试/.test(text) ? "建议观察" : "仅保存";
  }
}

// --- suggestions ---
function inferSuggestions(type: RecordType, topic: string): string[] {
  const pool: Record<RecordType, string[]> = {
    随记: ["记录当下的感受", "回顾时看看是否有变化"],
    灵感: ["补充这条想法的使用场景", "找到 3 个类似案例参考", "整理成最小可执行描述"],
    待办: ["拆分成具体执行步骤", "设定完成时间", "标注优先级"],
    项目: ["整理成项目 brief", "列出关键里程碑", "明确交付标准和时间线"],
    问题: ["列出可能的解决方向", "找到能帮忙解答的人", "写清问题的上下文"],
    复盘: ["提取 3 条核心教训", "标注下次可改进的环节", "记录有效的做法"],
    参考: ["标注可复用的要点", "关联到现有项目", "保存关键截图或链接"],
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
    type: "随记",
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
  const aiSubType = inferSubType(text, type);
  const topic = inferTopic(text);
  const tags = inferTags(text, type, topic, aiSubType);
  const promoteLevel = inferPromoteLevel(type, text);
  const suggestions = inferSuggestions(type, topic);

  return {
    ...record,
    aiStatus: "done",
    aiTitle: generateTitle(text),
    aiSummary: generateSummary(text, type),
    type,
    aiSubType,
    tags,
    topic,
    promoteLevel,
    suggestions,
    updatedAt: new Date().toISOString(),
  };
}
