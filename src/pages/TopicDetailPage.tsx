import { useMemo, useState, useRef } from "react";
import { useApp } from "../context";
import { useNavigate, useParams } from "react-router-dom";
import { TYPE_COLORS, PROMOTE_DOT } from "../types";

export default function TopicDetailPage() {
  const { records, generateSelectionSynthesis, batchSetTopic, batchArchive } = useApp();
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();

  const topicName = decodeURIComponent(name || "");

  // 多选模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [synthesizing, setSynthesizing] = useState(false);
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [topicInput, setTopicInput] = useState("");

  const topicRecords = useMemo(
    () =>
      records
        .filter(
          (r) =>
            !r.archived &&
            r.aiStatus === "done" &&
            (r.topic || "未分类主题") === topicName
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    [records, topicName]
  );

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
      const result = await generateSelectionSynthesis(Array.from(selectedIds), topicName);
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

  // 长按进入多选
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTouchStart = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      setSelectMode(true);
      setSelectedIds(new Set([id]));
    }, 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="px-5 pt-4 pb-4">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center text-stone-500 active:bg-stone-50 transition-colors"
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-bold text-stone-900 truncate">
            {topicName}
          </h1>
          <p className="text-[12px] text-stone-400 font-medium">
            {selectMode ? `已选择 ${selectedIds.size} 条` : `${topicRecords.length} 条记录`}
          </p>
        </div>
        {selectMode ? (
          <button
            onClick={exitSelectMode}
            className="px-3 py-1.5 text-[13px] font-medium text-stone-600 bg-white rounded-xl border border-stone-200/80 active:bg-stone-50"
          >
            取消
          </button>
        ) : topicRecords.length > 0 ? (
          <button
            onClick={() => setSelectMode(true)}
            className="px-3 py-1.5 text-[13px] font-medium text-stone-600 bg-white rounded-xl border border-stone-200/80 active:bg-stone-50"
          >
            选择
          </button>
        ) : null}
      </div>

      {/* 记录列表 */}
      {topicRecords.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-stone-50 border border-stone-200/60 flex items-center justify-center">
            <svg
              width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p className="text-stone-500 text-sm font-medium">该主题下暂无记录</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {topicRecords.map((record, i) => {
            const selected = selectedIds.has(record.id);
            return (
              <button
                key={record.id}
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(record.id);
                  } else {
                    navigate(`/record/${record.id}`);
                  }
                }}
                onTouchStart={() => handleTouchStart(record.id)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                className={`w-full text-left bg-white rounded-2xl p-4 card-press border transition-all duration-200 animate-fade-in ${
                  selected
                    ? "border-stone-400 bg-stone-50/80"
                    : "border-stone-200/50 hover:border-stone-300/60"
                }`}
                style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
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
                {/* 标题 + 类型 */}
                <div className="flex items-start gap-2.5 mb-2">
                  {record.promoteLevel !== "仅保存" && (
                    <span className={`shrink-0 mt-[6px] w-[6px] h-[6px] rounded-full ${PROMOTE_DOT[record.promoteLevel]}`} />
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

                {/* 摘要 */}
                <p className="text-[12px] text-stone-500 line-clamp-2 mb-3 leading-[1.6]">
                  {record.aiSummary}
                </p>

                {/* 底部 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {record.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-[2px] rounded bg-stone-50 text-stone-400 text-[10px] font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                  <span className="ml-auto text-[11px] text-stone-300 font-medium">
                    {formatShortTime(record.createdAt)}
                  </span>
                </div>
              </button>
            );
          })}
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

function formatShortTime(dateStr: string): string {
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
