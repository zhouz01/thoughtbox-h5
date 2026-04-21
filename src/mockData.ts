import type { ThoughtRecord } from "./types";
import { generateId } from "./storage";
import { organizeRecord } from "./ai";
import { createPendingRecord } from "./ai";

const MOCK_DATA: string[] = [
  "作品集首页不要一上来就堆项目，应该先让我是谁更清楚",
  "onboarding 也许应该做成引导卡片，而不是教程说明",
  "可以做一个给设计师记录灵感的 app，重点是 AI 自动整理",
  "客户 A 首页 CTA 太理性了，少一点情绪推动",
  "研究一下设计系统里的组件命名方式，感觉现在太乱",
  "这个视觉方向有点安全，怎么做得更有记忆点",
  "也许可以把作品集里的 case study 模板化，减少重复劳动",
  "今天看到一个 SaaS 官网，留白和模块节奏很舒服，值得参考",
  "想做一套柔和但不幼稚的插画风格",
  "这周要整理个人品牌的介绍文案",
];

export function createMockRecords(): ThoughtRecord[] {
  const now = Date.now();
  return MOCK_DATA.map((text, i) => {
    const createdAt = new Date(now - (i + 1) * 3600 * 1000 * 2).toISOString();
    const pending = createPendingRecord(text);
    // 直接模拟 AI 整理结果
    const organized = organizeRecord({
      ...pending,
      createdAt,
      updatedAt: createdAt,
    });
    return organized;
  });
}
