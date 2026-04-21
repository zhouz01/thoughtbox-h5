import type { ProjectBrief } from "./types";

const STORAGE_KEY = "thoughtbox_project_briefs";

/**
 * 加载所有推进卡（包括已软删除的，用于同步）
 */
export function loadBriefs(): ProjectBrief[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectBrief[];
  } catch {
    return [];
  }
}

/**
 * 加载可见推进卡（排除已软删除的，用于 UI 展示）
 */
export function loadVisibleBriefs(): ProjectBrief[] {
  return loadBriefs().filter((b) => !b.deletedAt);
}

export function saveBriefs(briefs: ProjectBrief[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(briefs));
}

export function getBriefById(id: string): ProjectBrief | undefined {
  return loadBriefs().find((b) => b.id === id);
}

export function addBrief(brief: ProjectBrief): void {
  const list = loadBriefs();
  list.unshift(brief);
  saveBriefs(list);
}

export function updateBrief(updated: ProjectBrief): void {
  const list = loadBriefs().map((b) =>
    b.id === updated.id ? updated : b
  );
  saveBriefs(list);
}

/**
 * V1.7: 软删除推进卡（用于同步）
 * 标记 deletedAt 而不是真正删除
 */
export function deleteBrief(id: string): void {
  const list = loadBriefs().map((b) => {
    if (b.id === id) {
      return { ...b, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }
    return b;
  });
  saveBriefs(list);
}

/**
 * V1.7: 永久删除推进卡（仅在本地清理时使用）
 */
export function permanentlyDeleteBrief(id: string): void {
  const list = loadBriefs().filter((b) => b.id !== id);
  saveBriefs(list);
}

/**
 * V1.7: 恢复软删除的推进卡
 */
export function restoreBrief(id: string): void {
  const list = loadBriefs().map((b) => {
    if (b.id === id) {
      const { deletedAt, ...rest } = b;
      return { ...rest, updatedAt: new Date().toISOString() };
    }
    return b;
  });
  saveBriefs(list);
}

/** 获取非归档的 Brief 列表（按更新时间倒序，排除已软删除） */
export function getActiveBriefs(): ProjectBrief[] {
  return loadBriefs()
    .filter((b) => b.status !== "已归档" && !b.deletedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** 获取所有 Brief（按更新时间倒序，排除已软删除） */
export function getAllBriefsSorted(): ProjectBrief[] {
  return loadBriefs()
    .filter((b) => !b.deletedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
