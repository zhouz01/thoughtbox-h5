import type { ThoughtRecord } from "./types";

const STORAGE_KEY = "thoughtbox_records";

/**
 * 加载所有记录（包括已软删除的，用于同步）
 * 别名：loadAllRecords
 */
export function loadRecords(): ThoughtRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ThoughtRecord[];
  } catch {
    return [];
  }
}

// 别名，用于 leancloudService
export const loadAllRecords = loadRecords;

/**
 * 加载可见记录（排除已软删除的，用于 UI 展示）
 */
export function loadVisibleRecords(): ThoughtRecord[] {
  return loadRecords().filter((r) => !r.deletedAt);
}

export function saveRecords(records: ThoughtRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getRecordById(id: string): ThoughtRecord | undefined {
  return loadRecords().find((r) => r.id === id);
}

export function addRecord(record: ThoughtRecord): void {
  const records = loadRecords();
  records.unshift(record);
  saveRecords(records);
}

export function updateRecord(updated: ThoughtRecord): void {
  const records = loadRecords().map((r) =>
    r.id === updated.id ? updated : r
  );
  saveRecords(records);
}

/**
 * V1.7: 软删除记录（用于同步）
 * 标记 deletedAt 而不是真正删除
 */
export function deleteRecord(id: string): void {
  const records = loadRecords().map((r) => {
    if (r.id === id) {
      return { ...r, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }
    return r;
  });
  saveRecords(records);
}

/**
 * V1.7: 永久删除记录（仅在本地清理时使用）
 */
export function permanentlyDeleteRecord(id: string): void {
  const records = loadRecords().filter((r) => r.id !== id);
  saveRecords(records);
}

/**
 * V1.7: 恢复软删除的记录
 */
export function restoreRecord(id: string): void {
  const records = loadRecords().map((r) => {
    if (r.id === id) {
      const { deletedAt, ...rest } = r;
      return { ...rest, updatedAt: new Date().toISOString() };
    }
    return r;
  });
  saveRecords(records);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
