import { useState, useRef } from "react";
import { useApp } from "../context";
import type { ThoughtRecord, RecordType } from "../types";
import { TYPE_COLORS, PROMOTE_DOT, RECORD_TYPES } from "../types";
import { useNavigate } from "react-router-dom";

export default function InboxPage() {
  const {
    filteredRecords,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    showArchived,
    setShowArchived,
    records,
    importMockRecords,
    exportRecords,
    importRecordsMerge,
    importRecordsOverwrite,
    generateSelectionSynthesis,
    batchSetTopic,
    batchArchive,
  } = useApp();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 多选模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [synthesizing, setSynthesizing] = useState(false);
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [topicInput, setTopicInput] = useState("");

  const hasAnyRecords = records.length > 0;
  const isFiltering = searchQuery || filterType !== "全部";

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
    setShowTopicInput(false);
    setTopicInput("");
  };

  const handleGenerateSummary = async () => {
    if (selectedIds.size < 2) return;
    setSynthesizing(true);
    try {
      const result = await generateSelectionSynthesis(Array.from(selectedIds));
      if (result) {
        exitSelectMode();
        navigate(`/synthesis/${result.id}`);
      }
    } finally {
      setSynthesizing(false);
    }
  };

  const handleBatchSetTopic = () => {
    if (!topicInput.trim()) return;
    batchSetTopic(Array.from(selectedIds), topicInput.trim());
    exitSelectMode();
  };

  const handleBatchArchive = () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`确定归档 ${selectedIds.size} 条记录？`);
    if (!confirmed) return;
    batchArchive(Array.from(selectedIds));
    exitSelectMode();
  };

  // 长按进入多选（防误触：800ms + 移动检测）
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

  // 导出
  const handleExport = () => {
    const json = exportRecords();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thoughtbox_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  // 导入
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(data)) {
          alert("文件格式不正确");
          return;
        }
        const valid = data.every(
          (r: unknown) =>
            typeof r === "object" && r !== null && "id" in r && "rawText" in r
        );
        if (!valid) {
          alert("文件内容不是有效的 ThoughtBox 数据");
          return;
        }
        const confirmed = window.confirm(
          "选择导入方式：\n\n确定 = 合并导入（保留现有数据）\n取消 = 覆盖导入（替换所有数据）"
        );
        if (confirmed) {
          importRecordsMerge(data as ThoughtRecord[]);
        } else {
          const overwrite = window.confirm(
            "⚠️ 覆盖导入将替换所有现有数据，此操作不可撤销！\n\n确定要覆盖吗？"
          );
          if (overwrite) {
            importRecordsOverwrite(data as ThoughtRecord[]);
          }
        }
      } catch {
        alert("文件解析失败，请检查文件格式");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
    setShowMenu(false);
  };

  return (
    <div className="px-5 pt-8 pb-4">
      {/* 标题区 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-stone-900 tracking-tight">
            {selectMode ? "选择记录" : showArchived ? "已归档" : "收件箱"}
          </h1>
          <p className="text-[13px] text-stone-400 mt-0.5">
            {selectMode
              ? `已选择 ${selectedIds.size} 条`
              : showArchived ? "已归档的记录" : "记录想法，稍后整理"}
          </p>
        </div>
        {selectMode ? (
          <button
            onClick={exitSelectMode}
            className="px-3.5 py-1.5 text-[13px] font-medium text-stone-600 bg-white rounded-xl border border-stone-200/80 active:bg-stone-50"
          >
            取消
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {!showArchived && filteredRecords.length > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="px-3 py-1.5 text-[13px] font-medium text-stone-600 bg-white rounded-xl border border-stone-200/80 active:bg-stone-50"
              >
                选择
              </button>
            )}
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center text-stone-500 active:bg-stone-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 更多菜单 */}
      {!selectMode && showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="absolute right-5 top-[88px] z-40 w-48 bg-white rounded-2xl shadow-lg border border-stone-200/60 py-1.5 animate-fade-in overflow-hidden">
            <MenuButton onClick={handleExport}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              导出数据
            </MenuButton>
            <MenuButton onClick={() => fileInputRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              导入数据
            </MenuButton>
            {!hasAnyRecords && (
              <MenuButton onClick={() => { importMockRecords(); setShowMenu(false); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                导入示例数据
              </MenuButton>
            )}
            <div className="my-1.5 border-t border-stone-100" />
            <MenuButton onClick={() => { navigate("/settings/sync"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              数据同步
            </MenuButton>
            <MenuButton onClick={() => { navigate("/settings/ai"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              AI 设置
            </MenuButton>
          </div>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* 搜索框 */}
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
            placeholder="搜索标题、内容、标签或主题"
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

      {/* 类型筛选 chips */}
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
          <FilterChip active={showArchived} onClick={() => setShowArchived(!showArchived)}>
            已归档
          </FilterChip>
        </div>
      )}

      {/* 记录列表 / 空状态 */}
      {filteredRecords.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-stone-50 border border-stone-200/60 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          {!hasAnyRecords ? (
            <>
              <p className="text-stone-500 text-sm font-medium mb-1">还没有记录</p>
              <p className="text-stone-400 text-xs mb-6">把脑海里的想法先记下来，整理交给 AI</p>
              <div className="flex flex-col gap-2.5 items-center">
                <button
                  onClick={() => navigate("/new")}
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-xl text-[13px] font-medium active:bg-stone-800 transition-colors"
                >
                  新建记录
                </button>
                <button
                  onClick={importMockRecords}
                  className="px-6 py-2.5 bg-white text-stone-600 rounded-xl text-[13px] font-medium border border-stone-200/80 active:bg-stone-50 transition-colors"
                >
                  导入示例数据
                </button>
              </div>
            </>
          ) : showArchived ? (
            <>
              <p className="text-stone-500 text-sm font-medium mb-1">没有已归档记录</p>
              <p className="text-stone-400 text-xs">归档的记录会在这里显示</p>
            </>
          ) : isFiltering ? (
            <>
              <p className="text-stone-500 text-sm font-medium mb-1">没有匹配的记录</p>
              <p className="text-stone-400 text-xs">试试其他关键词或筛选</p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredRecords.map((record, i) => (
            <div
              key={record.id}
              className="animate-fade-in"
              style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
            >
              <RecordCard
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
                onLongPressStart={(e) => handleTouchStart(record.id, e)}
                onLongPressMove={handleTouchMove}
                onLongPressEnd={handleTouchEnd}
              />
            </div>
          ))}
        </div>
      )}

      {/* 批量操作栏 */}
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200/80 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] animate-fade-in">
          {showTopicInput && (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                placeholder="输入主题名"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                className="flex-1 px-3 py-2 bg-stone-50 rounded-lg border border-stone-200/80 text-[13px] text-stone-800 placeholder:text-stone-300"
                autoFocus
              />
              <button
                onClick={handleBatchSetTopic}
                disabled={!topicInput.trim()}
                className="px-3 py-2 bg-stone-900 text-white rounded-lg text-[12px] font-medium disabled:opacity-30"
              >
                确定
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={exitSelectMode}
              className="shrink-0 py-2.5 px-3 text-stone-400 text-[13px] font-medium active:text-stone-600 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleGenerateSummary}
              disabled={selectedIds.size < 2 || synthesizing}
              className="flex-1 py-2.5 bg-stone-900 text-white rounded-xl text-[13px] font-medium disabled:opacity-30 active:bg-stone-800 transition-colors"
            >
              {synthesizing ? "生成中..." : "生成汇总"}
            </button>
            <button
              onClick={() => setShowTopicInput(!showTopicInput)}
              disabled={selectedIds.size === 0}
              className="flex-1 py-2.5 bg-white text-stone-700 rounded-xl text-[13px] font-medium border border-stone-200/80 disabled:opacity-30 active:bg-stone-50 transition-colors"
            >
              批量设主题
            </button>
            <button
              onClick={handleBatchArchive}
              disabled={selectedIds.size === 0}
              className="py-2.5 px-4 text-stone-500 text-[13px] font-medium disabled:opacity-30"
            >
              归档
            </button>
          </div>
          {selectedIds.size < 2 && (
            <p className="text-center text-[11px] text-stone-400 mt-2">
              选中至少 2 条记录后可生成汇总
            </p>
          )}
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

/* ========== RecordCard ========== */

function RecordCard({
  record,
  selectMode,
  selected,
  onClick,
  onLongPressStart,
  onLongPressMove,
  onLongPressEnd,
}: {
  record: ThoughtRecord;
  selectMode: boolean;
  selected: boolean;
  onClick: () => void;
  onLongPressStart?: (e: React.TouchEvent) => void;
  onLongPressMove?: (e: React.TouchEvent) => void;
  onLongPressEnd?: () => void;
}) {
  const timeStr = formatRelativeTime(record.createdAt);

  return (
    <button
      onClick={onClick}
      onTouchStart={onLongPressStart}
      onTouchMove={onLongPressMove}
      onTouchEnd={onLongPressEnd}
      onTouchCancel={onLongPressEnd}
      className={`w-full text-left bg-white rounded-2xl p-4 card-press border transition-all duration-200 ${
        selected
          ? "border-stone-400 bg-stone-50/80"
          : "border-stone-200/50 hover:border-stone-300/60"
      } ${record.archived ? "opacity-60" : ""}`}
    >
      {selectMode && (
        <div className="flex items-center gap-2.5 mb-2">
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
          <span className="text-[11px] text-stone-400 font-medium">
            {selected ? "已选" : "点击选择"}
          </span>
        </div>
      )}
      {record.aiStatus === "pending" ? (
        <div className="flex items-center gap-2.5 text-stone-400 text-[13px] py-1">
          <span className="inline-block w-4 h-4 border-[1.5px] border-stone-200 border-t-stone-400 rounded-full animate-spin" />
          <span>AI 整理中...</span>
          <span className="ml-auto text-[11px] text-stone-300 font-medium">{timeStr}</span>
        </div>
      ) : (
        <>
          {/* 顶部：推进等级点 + 标题 + 类型 */}
          <div className="flex items-start gap-2.5 mb-2">
            {record.promoteLevel !== "仅保存" && !record.archived && (
              <span className={`shrink-0 mt-[6px] w-[6px] h-[6px] rounded-full ${PROMOTE_DOT[record.promoteLevel]}`} />
            )}
            {record.archived && (
              <span className="shrink-0 mt-[6px] w-[6px] h-[6px] rounded-full bg-stone-300" />
            )}
            <h3 className="text-[13px] font-semibold text-stone-800 line-clamp-1 leading-snug flex-1">
              {record.aiTitle}
            </h3>
            <span
              className={`shrink-0 px-2 py-[3px] rounded-md text-[10px] font-medium tracking-wide ${TYPE_COLORS[record.type]}`}
            >
              {record.type}
            </span>
          </div>

          {/* rawText 前两行 */}
          <p className="text-[12px] text-stone-500 line-clamp-2 mb-3 leading-[1.6] pl-0">
            {record.rawText}
          </p>

          {/* 底部：tags + topic + time */}
          <div className="flex items-center gap-1.5 flex-wrap">
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
    </button>
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
