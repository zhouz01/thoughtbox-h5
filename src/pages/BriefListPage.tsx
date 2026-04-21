import { useMemo, useState } from "react";
import { useApp } from "../context";
import { useNavigate } from "react-router-dom";
import { BRIEF_STATUSES, BRIEF_STATUS_COLORS } from "../types";
import type { BriefStatus, ProjectBrief } from "../types";

export default function BriefListPage() {
  const { briefs, updateBrief, deleteBriefById } = useApp();
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<BriefStatus | "全部">("全部");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredBriefs = useMemo(() => {
    let list = [...briefs].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (filterStatus !== "全部") {
      list = list.filter((b) => b.status === filterStatus);
    }
    // 已归档默认不在主视图
    if (filterStatus === "全部") {
      list = list.filter((b) => b.status !== "已归档");
    }
    return list;
  }, [briefs, filterStatus]);

  const handleDelete = (id: string) => {
    deleteBriefById(id);
    setConfirmDeleteId(null);
  };

  return (
    <div className="px-5 pt-8 pb-4">
      {/* 标题区 */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-stone-900 tracking-tight">
          推进卡
        </h1>
        <p className="text-[13px] text-stone-400 mt-0.5">
          值得推进的想法，转化为可执行行动
        </p>
      </div>

      {/* 状态筛选 chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5 -mx-5 px-5 no-scrollbar">
        <FilterChip active={filterStatus === "全部"} onClick={() => setFilterStatus("全部")}>
          全部
        </FilterChip>
        {BRIEF_STATUSES.map((s) => (
          <FilterChip key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)}>
            {s}
          </FilterChip>
        ))}
      </div>

      {/* 列表 / 空状态 */}
      {filteredBriefs.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-stone-50 border border-stone-200/60 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <p className="text-stone-500 text-sm font-medium mb-1">还没有推进卡</p>
          <p className="text-stone-400 text-xs">当一条想法值得继续做时，可以把它转成 Brief</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredBriefs.map((brief, i) => (
            <BriefCard
              key={brief.id}
              brief={brief}
              onClick={() => navigate(`/brief/${brief.id}`)}
              onArchive={() => updateBrief({ ...brief, status: "已归档" as BriefStatus, updatedAt: new Date().toISOString() })}
              onDelete={() => setConfirmDeleteId(brief.id)}
              style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
            />
          ))}
        </div>
      )}

      {/* 删除确认 */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={() => setConfirmDeleteId(null)}>
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5" />
            <h3 className="text-[15px] font-semibold text-rose-600 mb-2">删除推进卡</h3>
            <p className="text-[13px] text-stone-500 mb-6 leading-relaxed">
              ⚠️ 删除后无法恢复，来源记录不会被删除。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-rose-600 text-white active:bg-rose-700 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== 子组件 ========== */

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function BriefCard({
  brief,
  onClick,
  onArchive,
  onDelete,
  style,
}: {
  brief: ProjectBrief;
  onClick: () => void;
  onArchive: () => void;
  onDelete: () => void;
  style?: React.CSSProperties;
}) {
  const doneCount = brief.nextActions.filter((a) => a.done).length;
  const totalCount = brief.nextActions.length;
  const sourceText = brief.sourceType === "record" ? "来自记录" : "来自汇总";
  const sourceBadge = brief.source === "ai" ? "AI 生成" : "本地生成";

  return (
    <div
      className="bg-white rounded-2xl p-4 border border-stone-200/50 card-press animate-fade-in"
      style={style}
    >
      <button onClick={onClick} className="w-full text-left">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-[14px] font-semibold text-stone-800 line-clamp-1 flex-1">
            {brief.title}
          </h3>
          <span className={`shrink-0 px-2 py-[2px] rounded-md text-[10px] font-medium ${BRIEF_STATUS_COLORS[brief.status]}`}>
            {brief.status}
          </span>
        </div>
        <p className="text-[12px] text-stone-500 line-clamp-2 mb-3 leading-[1.6]">
          {brief.summary}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {brief.topic && (
            <span className="text-[10px] text-stone-500 font-medium">{brief.topic}</span>
          )}
          <span className="text-[10px] text-stone-300">·</span>
          <span className="text-[10px] text-stone-400 font-medium">{sourceText}</span>
          <span className="text-[10px] text-stone-300">·</span>
          <span className="text-[10px] text-stone-400 font-medium">{sourceBadge}</span>
          {totalCount > 0 && (
            <>
              <span className="text-[10px] text-stone-300">·</span>
              <span className={`text-[10px] font-medium ${doneCount === totalCount && totalCount > 0 ? "text-emerald-500" : "text-stone-400"}`}>
                {doneCount}/{totalCount} 行动
              </span>
            </>
          )}
          <span className="ml-auto text-[10px] text-stone-300 font-medium">
            {formatShortTime(brief.updatedAt)}
          </span>
        </div>
      </button>
      {brief.status !== "已归档" && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100">
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="text-[11px] text-stone-400 font-medium hover:text-stone-600 active:text-stone-500 transition-colors"
          >
            归档
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-[11px] text-rose-400 font-medium hover:text-rose-600 active:text-rose-500 transition-colors"
          >
            删除
          </button>
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
