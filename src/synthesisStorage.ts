import type { Synthesis } from "./types";

const STORAGE_KEY = "thoughtbox_syntheses";

/**
 * 加载所有汇总（包括已软删除的，用于同步）
 */
export function loadSyntheses(): Synthesis[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Synthesis[];
  } catch {
    return [];
  }
}

// 别名，用于 leancloudService
export const loadAllSyntheses = loadSyntheses;

/**
 * 加载可见汇总（排除已软删除的，用于 UI 展示）
 */
export function loadVisibleSyntheses(): Synthesis[] {
  return loadSyntheses().filter((s) => !s.deletedAt);
}

export function saveSyntheses(syntheses: Synthesis[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(syntheses));
}

export function getSynthesisById(id: string): Synthesis | undefined {
  return loadSyntheses().find((s) => s.id === id);
}

export function addSynthesis(synthesis: Synthesis): void {
  const list = loadSyntheses();
  list.unshift(synthesis);
  saveSyntheses(list);
}

export function updateSynthesis(updated: Synthesis): void {
  const list = loadSyntheses().map((s) =>
    s.id === updated.id ? updated : s
  );
  saveSyntheses(list);
}

/**
 * V1.7: 软删除汇总（用于同步）
 * 标记 deletedAt 而不是真正删除
 */
export function deleteSynthesis(id: string): void {
  const list = loadSyntheses().map((s) => {
    if (s.id === id) {
      return { ...s, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }
    return s;
  });
  saveSyntheses(list);
}

/**
 * V1.7: 永久删除汇总（仅在本地清理时使用）
 */
export function permanentlyDeleteSynthesis(id: string): void {
  const list = loadSyntheses().filter((s) => s.id !== id);
  saveSyntheses(list);
}

/**
 * V1.7: 恢复软删除的汇总
 */
export function restoreSynthesis(id: string): void {
  const list = loadSyntheses().map((s) => {
    if (s.id === id) {
      const { deletedAt, ...rest } = s;
      return { ...rest, updatedAt: new Date().toISOString() };
    }
    return s;
  });
  saveSyntheses(list);
}

/** 获取指定 weekKey 的周回顾（最新一条） */
export function getWeeklySynthesis(weekKey: string): Synthesis | undefined {
  return loadSyntheses()
    .filter((s) => s.mode === "weekly_review" && s.weekKey === weekKey && s.status === "done" && !s.deletedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

/** 获取所有周回顾（按时间倒序） */
export function getAllWeeklySyntheses(): Synthesis[] {
  return loadSyntheses()
    .filter((s) => s.mode === "weekly_review" && s.status === "done" && !s.deletedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** 计算当前自然周的 weekKey，如 "2026-W17" */
export function getCurrentWeekKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayCount = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const weekNum = Math.ceil((dayCount + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
