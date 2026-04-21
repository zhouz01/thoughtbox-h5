import { useState, useMemo, useRef } from "react";
import { useApp } from "../context";
import type { ThoughtRecord, RecordType } from "../types";
import { TYPE_COLORS, PROMOTE_DOT, RECORD_TYPES } from "../types";
import { useNavigate } from "react-router-dom";
import { permanentlyDeleteRecord } from "../storage";

export default function ArchivedPage() {
  const { records, updateRecord, deleteRecord, reOrganizeRecord } = useApp();
  const navigate = useNavigate();

  // 搜索与筛选
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<RecordType | "全部">("全部");

  // 多选模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 更多菜单
  const [showMenu, setShowMenu] = useState(false);

  // 确认弹窗
  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "batchDelete";
    id?: string;
  } | null>(null);

  // 提示
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // 只取已归档、未删除的记录
  const archivedRecords = useMemo(() => {
    return records
      .filter((r) => r.archived && !r.deletedAt)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [records]);

  // 筛选 + 搜索
  const filteredRecords = useMemo(() => {
    return archivedRecords.filter((r) => {
      if (filterType !== "全部" && r.type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          r.rawText.toLowerCase().includes(q) ||
          r.aiTitle.toLowerCase().includes(q) ||
          r.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          r.topic.toLowerCase().includes(q) ||
          (r.aiSubType && r.aiSubType.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [archivedRecords, filterType, searchQuery]);

  // 按归档时间分组（用 updatedAt 作为归档时间的近似）
  const groupedRecords = useMemo(() => {
    const groups: { label: string; records: ThoughtRecord[] }[] = [];
    const today: ThoughtRecord[] = [];
    const yesterday: ThoughtRecord[] = [];
    const earlier: ThoughtRecord[] = [];

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const yest = new Date(now.getTime() - 86400000);
    const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;

    for (const r of filteredRecords) {
      const d = r.updatedAt.slice(0, 10);
      if (d === todayStr) today.push(r);
      else if (d === yestStr) yesterday.push(r);
      else earlier.push(r);
    }

    if (today.length) groups.push({ label: "今天归档", records: today });
    if (yesterday.length) groups.push({ label: "昨天归档", records: yesterday });
    if (earlier.length) groups.push({ label: "更早", records: earlier });

    return groups;
  }, [filteredRecords]);

  // 多选操作
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchRestore = () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      const record = records.find((r) => r.id === id);
      if (record) {
        updateRecord({ ...record, archived: false });
      }
    }
    showToast(`已恢复 ${selectedIds.size} 条记录`);
    exitSelectMode();
  };

  const handleBatchDelete = () => {
    setConfirmAction({ type: "batchDelete" });
  };

  const handleRestore = (record: ThoughtRecord) => {
    updateRecord({ ...record, archived: false });
    showToast("已恢复到收件箱");
  };

  const handlePermanentlyDelete = (id: string) => {
    setConfirmAction({ type: "delete", id });
  };

  const confirmDelete = () => {
    if (!confirmAction) return;
    if (confirmAction.type === "delete" && confirmAction.id) {
      deleteRecord(confirmAction.id);
      permanentlyDeleteRecord(confirmAction.id);
      showToast("已彻底删除");
    } else if (confirmAction.type === "batchDelete") {
      for (const id of selectedIds) {
        deleteRecord(id);
        permanentlyDeleteRecord(id);
      }
      showToast(`已彻底删除 ${selectedIds.size} 条记录`);
      exitSelectMode();
    }
    setConfirmAction(null);
  };

  // 长按进入多选
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (id: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      setSelectMode(true);
      setSelectedIds(new Set([id]));
    }, 800);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      touchStartPos.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  };

  return (
    <div className="px-5 pt-5 pb-4">
      {/* ====== 1. 顶部导航栏 ====== */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate("/")}
          className="shrink-0 w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center text-stone-500 active:bg-stone-50 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-[15px] font-semibold text-stone-900">已归档</h1>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="shrink-0 w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center text-stone-500 active:bg-stone-50 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>

      {/* ====== 更多菜单 ====== */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="absolute right-5 top-[56px] z-40 w-48 bg-white rounded-2xl shadow-lg border border-stone-200/60 py-2 animate-fade-in overflow-hidden">
            <MenuButton onClick={() => { setSelectMode(true); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
              选择
            </MenuButton>
            <MenuButton onClick={() => { setSearchQuery(""); setFilterType("全部"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              清空筛选
            </MenuButton>
            <div className="my-1 border-t border-stone-100" />
            <MenuButton onClick={() => { navigate("/"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              返回收件箱
            </MenuButton>
          </div>
        </>
      )}

      {/* ====== 2. 页面状态说明 ====== */}
      <div className="flex items-center gap-2.5 mb-4 px-3 py-2.5 bg-stone-50/80 rounded-xl border border-stone-100">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400 shrink-0">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
        <p className="text-[12px] text-stone-400 leading-relaxed">
          归档不会删除内容，你可以随时恢复
        </p>
      </div>

      {/* ====== 3. 搜索框 ====== */}
      {!selectMode && (
        <div className="relative mb-4">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-300"
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="搜索已归档内容"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 bg-white rounded-xl border border-stone-200/80 text-[13px] text-stone-800 focus:ring-2 focus:ring-stone-300/50 focus:border-stone-300 placeholder:text-stone-300 transition-all duration-200"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* ====== 4. 主类型筛选区 ====== */}
      {!selectMode && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5 -mx-5 px-5 no-scrollbar">
          <FilterChip active={filterType === "全部"} onClick={() => setFilterType("全部")}>
            全部
          </FilterChip>
          {RECORD_TYPES.map((t) => (
            <FilterChip key={t} active={filterType === t} onClick={() => setFilterType(t)}>
              {t}
            </FilterChip>
          ))}
        </div>
      )}

      {/* ====== 5. 已归档记录列表 ====== */}
      {filteredRecords.length === 0 ? (
        /* ====== 空状态 ====== */
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-stone-50 border border-stone-200/60 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          {archivedRecords.length === 0 ? (
            <>
              <p className="text-stone-500 text-sm font-medium mb-1">还没有已归档内容</p>
              <p className="text-stone-400 text-xs mb-6">归档后的内容会出现在这里</p>
              <button
                onClick={() => navigate("/")}
                className="px-6 py-2.5 bg-stone-900 text-white rounded-xl text-[13px] font-medium active:bg-stone-800 transition-colors"
              >
                返回收件箱
              </button>
            </>
          ) : (
            <>
              <p className="text-stone-500 text-sm font-medium mb-1">没有匹配的记录</p>
              <p className="text-stone-400 text-xs">试试其他关键词或筛选</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedRecords.map((group) => (
            <div key={group.label}>
              <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2.5 px-0.5">
                {group.label}
              </h2>
              <div className="flex flex-col gap-2.5">
                {group.records.map((record, i) => (
                  <div
                    key={record.id}
                    className="animate-fade-in"
                    style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
                  >
                    <ArchivedRecordCard
                      record={record}
                      selectMode={selectMode}
                      selected={selectedIds.has(record.id)}
                      onClick={() => {
                        if (selectMode) {
                          toggleSelect(record.id);
                        } else {
                          navigate(`/record/${record.id}`);
                        }
                      }}
                      onRestore={() => handleRestore(record)}
                      onDelete={() => handlePermanentlyDelete(record.id)}
                      onLongPressStart={(e) => handleTouchStart(record.id, e)}
                      onLongPressMove={handleTouchMove}
                      onLongPressEnd={handleTouchEnd}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ====== 多选操作栏 ====== */}
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200/80 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] animate-fade-in">
          <div className="flex items-center gap-2">
            <button
              onClick={exitSelectMode}
              className="shrink-0 py-2.5 px-3 text-stone-400 text-[13px] font-medium active:text-stone-600 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleBatchRestore}
              disabled={selectedIds.size === 0}
              className="flex-1 py-2.5 bg-stone-900 text-white rounded-xl text-[13px] font-medium disabled:opacity-30 active:bg-stone-800 transition-colors"
            >
              恢复 ({selectedIds.size})
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="py-2.5 px-4 text-rose-500 text-[13px] font-medium disabled:opacity-30 active:text-rose-600 transition-colors"
            >
              删除
            </button>
          </div>
        </div>
      )}

      {/* ====== 确认弹窗 ====== */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center px-8 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-[15px] font-semibold text-stone-900 mb-2">
              {confirmAction.type === "batchDelete" ? "批量彻底删除" : "彻底删除"}
            </h3>
            <p className="text-[13px] text-stone-500 mb-6 leading-relaxed">
              {confirmAction.type === "batchDelete"
                ? `确定彻底删除选中的 ${selectedIds.size} 条记录吗？此操作不可撤销。`
                : "彻底删除后无法恢复，确定要删除吗？"}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-rose-600 text-white active:bg-rose-700 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== Toast 提示 ====== */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 bg-stone-900 text-white text-[12px] font-medium rounded-full shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ========== FilterChip ========== */

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 py-[6px] rounded-lg text-xs font-medium transition-all duration-200 ${
        active
          ? "bg-stone-900 text-white"
          : "bg-white text-stone-500 border border-stone-200/80 active:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}

/* ========== ArchivedRecordCard ========== */

function ArchivedRecordCard({
  record,
  selectMode,
  selected,
  onClick,
  onRestore,
  onDelete,
  onLongPressStart,
  onLongPressMove,
  onLongPressEnd,
}: {
  record: ThoughtRecord;
  selectMode: boolean;
  selected: boolean;
  onClick: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onLongPressStart?: (e: React.TouchEvent) => void;
  onLongPressMove?: (e: React.TouchEvent) => void;
  onLongPressEnd?: () => void;
}) {
  const timeStr = formatRelativeTime(record.updatedAt);

  const isPending = record.aiStatus === "pending";
  const isFailed = record.aiStatus === "done" && record.organizeError;
  const isOrganized = record.aiStatus === "done" && !record.organizeError;

  return (
    <div
      onTouchStart={onLongPressStart}
      onTouchMove={onLongPressMove}
      onTouchEnd={onLongPressEnd}
      onTouchCancel={onLongPressEnd}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      className={`w-full bg-white rounded-2xl p-4 border transition-all duration-200 ${
        selected
          ? "border-stone-400 bg-stone-50/80"
          : "border-stone-200/50 hover:border-stone-300/60"
      }`}
    >
      {/* 多选勾选 */}
      {selectMode && (
        <div className="flex items-center gap-2.5 mb-2">
          <button onClick={onClick}>
            <span className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
              selected
                ? "bg-stone-900 border-stone-900"
                : "border-stone-300 bg-white"
            }`}>
              {selected && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
          </button>
          <span className="text-[11px] text-stone-400 font-medium">
            {selected ? "已选" : "点击选择"}
          </span>
        </div>
      )}

      {/* 整理中状态 */}
      {isPending && (
        <div className="flex items-center gap-2.5 py-1 mb-2">
          <span className="inline-block w-4 h-4 border-[1.5px] border-stone-200 border-t-stone-400 rounded-full animate-spin" />
          <span className="text-[13px] text-stone-500 font-medium">整理中…</span>
        </div>
      )}

      {/* 整理失败状态 */}
      {isFailed && (
        <div className="mb-2">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="shrink-0 w-4 h-4 rounded-full bg-rose-100 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
            <span className="text-[13px] text-stone-700 font-medium">整理失败</span>
          </div>
        </div>
      )}

      {/* 正常已整理 */}
      {isOrganized && (
        <>
          {/* 标题 + 已归档标签 */}
          <div className="flex items-start gap-2.5 mb-2">
            <span className="shrink-0 mt-[6px] w-[6px] h-[6px] rounded-full bg-stone-300" />
            <h3 className="text-[13px] font-semibold text-stone-700 line-clamp-1 leading-snug flex-1">
              {record.aiTitle}
            </h3>
            <span className="shrink-0 px-2 py-[3px] rounded-md text-[10px] font-medium tracking-wide bg-stone-100 text-stone-400">
              已归档
            </span>
          </div>

          {/* rawText 预览 */}
          <p className="text-[12px] text-stone-400 line-clamp-2 mb-2.5 leading-[1.6]">
            {record.rawText}
          </p>

          {/* 类型 + 标签 + 主题 */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <span
              className={`px-2 py-[3px] rounded-md text-[10px] font-medium tracking-wide ${TYPE_COLORS[record.type]}`}
            >
              {record.aiSubType ? `${record.type} · ${record.aiSubType}` : record.type}
            </span>
            {record.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-[2px] rounded bg-stone-50 text-stone-400 text-[10px] font-medium"
              >
                #{tag}
              </span>
            ))}
            {record.topic && record.topic !== "未分类主题" && (
              <span className="text-[10px] text-stone-400 font-medium">
                · {record.topic}
              </span>
            )}
            <span className="ml-auto text-[11px] text-stone-300 font-medium">{timeStr}</span>
          </div>
        </>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onRestore(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-[12px] font-medium active:bg-stone-800 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          恢复
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-stone-600 rounded-lg text-[12px] font-medium border border-stone-200/80 active:bg-stone-50 transition-colors"
        >
          查看详情
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="ml-auto px-2 py-1.5 text-stone-400 text-[11px] font-medium active:text-rose-500 transition-colors"
        >
          删除
        </button>
      </div>
    </div>
  );
}

/* ========== MenuButton ========== */

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-stone-700 font-medium active:bg-stone-50 transition-colors"
    >
      {children}
    </button>
  );
}

/* ========== 工具函数 ========== */

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}月${d}日`;
}
