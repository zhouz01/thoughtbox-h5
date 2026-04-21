import { useMemo, useState, useRef } from "react";
import { useApp } from "../context";
import { useNavigate, useParams } from "react-router-dom";
import { TYPE_COLORS, PROMOTE_DOT } from "../types";
import type { ThoughtRecord, Synthesis, ProjectBrief } from "../types";
import { WorkspaceLink } from "../components/WorkspaceLink";

type ContentTab = "全部" | "记录" | "汇总" | "推进卡";

export default function TopicDetailPage() {
  const {
    records,
    syntheses,
    briefs,
    generateSelectionSynthesis,
    generateBriefFromRecordData,
    generateBriefFromSynthesisData,
    batchSetTopic,
    batchArchive,
  } = useApp();
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();

  const topicName = decodeURIComponent(name || "");
  const [activeTab, setActiveTab] = useState<ContentTab>("全部");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [synthesizing, setSynthesizing] = useState(false);
  const [generatingBriefId, setGeneratingBriefId] = useState<string | null>(null);
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  // 该主题下的记录
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
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ),
    [records, topicName]
  );

  // 该主题下的汇总
  const topicSyntheses = useMemo(
    () =>
      syntheses.filter(
        (s) =>
          !s.deletedAt &&
          (s.sourceTopic === topicName ||
            s.sourceRecordIds?.some((id) =>
              topicRecords.find((r) => r.id === id)
            ))
      ),
    [syntheses, topicName, topicRecords]
  );

  // 该主题下的推进卡
  const topicBriefs = useMemo(
    () =>
      briefs.filter(
        (b) =>
          !b.deletedAt &&
          (b.sourceType === "record" &&
            topicRecords.find((r) => r.id === b.sourceId))
      ),
    [briefs, topicName, topicRecords]
  );

  // 概览统计
  const recordCount = topicRecords.length;
  const typeStats = new Map<string, number>();
  topicRecords.forEach((r) => {
    typeStats.set(r.type, (typeStats.get(r.type) || 0) + 1);
  });
  const topType = Array.from(typeStats.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const briefCount = topicBriefs.length;
  const latestUpdate = topicRecords[0]?.updatedAt || "";

  // 主题说明（简单规则：取最活跃类型的描述）
  const topicDescription = useMemo(() => {
    if (topicName === "未分类主题") return "还没有被归类的想法，等待整理";
    if (recordCount === 0) return "这个主题下还没有记录";
    const titles = topicRecords.slice(0, 3).map((r) => r.aiTitle);
    return `这个主题主要围绕${titles.join("、")}等方向展开`;
  }, [topicName, recordCount, topicRecords]);

  // 多选
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

  // 长按
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

  // 生成主题汇总
  const handleGenerateSummary = async () => {
    if (selectedIds.size < 2) return;
    setSynthesizing(true);
    try {
      const result = await generateSelectionSynthesis(
        Array.from(selectedIds),
        topicName
      );
      if (result) {
        exitSelectMode();
        navigate(`/synthesis/${result.id}`);
      }
    } finally {
      setSynthesizing(false);
    }
  };

  // 生成 Brief（基于记录）
  const handleGenerateBrief = async (recordId: string) => {
    setGeneratingBriefId(recordId);
    try {
      const brief = await generateBriefFromRecordData(recordId);
      if (brief) navigate(`/brief/${brief.id}`);
    } finally {
      setGeneratingBriefId(null);
    }
  };

  // 批量设主题
  const handleBatchSetTopic = () => {
    if (!topicInput.trim()) return;
    batchSetTopic(Array.from(selectedIds), topicInput.trim());
    exitSelectMode();
  };

  // 批量归档
  const handleBatchArchive = () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`确定归档 ${selectedIds.size} 条记录？`);
    if (!confirmed) return;
    batchArchive(Array.from(selectedIds));
    exitSelectMode();
  };

  // 当前 tab 内容
  const showRecords = activeTab === "全部" || activeTab === "记录";
  const showSyntheses = activeTab === "全部" || activeTab === "汇总";
  const showBriefs = activeTab === "全部" || activeTab === "推进卡";

  const hasContent =
    (showRecords && topicRecords.length > 0) ||
    (showSyntheses && topicSyntheses.length > 0) ||
    (showBriefs && topicBriefs.length > 0);

  return (
    <div className="px-5 pt-4 pb-4">
      {/* ====== 1. 顶部导航栏 ====== */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center text-stone-500 active:bg-stone-50 transition-colors"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-bold text-stone-900 truncate">
            {topicName}
          </h1>
          <p className="text-[12px] text-stone-400 font-medium">
            {selectMode
              ? `已选择 ${selectedIds.size} 条`
              : `${recordCount} 条记录`}
          </p>
        </div>
        {selectMode ? (
          <button
            onClick={exitSelectMode}
            className="px-3 py-1.5 text-[13px] font-medium text-stone-600 bg-white rounded-xl border border-stone-200/80 active:bg-stone-50"
          >
            取消
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <WorkspaceLink view="topics" topic={topicName} label="在工作台打开本主题" />
            <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center text-stone-500 active:bg-stone-50 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          </div>
        )}
      </div>

      {/* 更多菜单 */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-5 top-[72px] z-40 w-52 bg-white rounded-2xl shadow-lg border border-stone-200/60 py-1.5 animate-fade-in overflow-hidden">
            <MenuButton onClick={() => { setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              编辑主题名
            </MenuButton>
            <MenuButton onClick={() => { setSelectMode(true); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M4 7V4h3M4 17v3h3M20 7V4h-3M20 17v3h-3M9 9h6v6H9z" />
              </svg>
              批量设主题
            </MenuButton>
            <div className="my-1.5 border-t border-stone-100" />
            <MenuButton onClick={() => { navigate("/workspace"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              进入工作台
            </MenuButton>
          </div>
        </>
      )}

      {/* ====== 2. 主题头部信息 ====== */}
      <section className="mb-4 animate-fade-in" style={{ animationDelay: "20ms" }}>
        <p className="text-[13px] text-stone-500 leading-relaxed">
          {topicDescription}
        </p>
      </section>

      {/* ====== 3. 本主题概览（2x2 卡片） ====== */}
      {recordCount > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "40ms" }}>
          <div className="grid grid-cols-2 gap-2.5">
            <OverviewCard value={String(recordCount)} label="记录数量" accent="text-stone-900" />
            <OverviewCard
              value={topType ? topType[0] : "—"}
              label="最常见类型"
              accent="text-indigo-600"
            />
            <OverviewCard value={String(briefCount)} label="相关推进卡" accent="text-emerald-600" />
            <OverviewCard
              value={latestUpdate ? formatShortTime(latestUpdate) : "—"}
              label="最近更新"
              accent="text-stone-500"
            />
          </div>
        </section>
      )}

      {/* ====== 4. 内容切换区 ====== */}
      <section className="mb-4 animate-fade-in" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1">
          {(["全部", "记录", "汇总", "推进卡"] as ContentTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
                activeTab === tab
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-400 hover:text-stone-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {/* ====== 5. 相关内容列表 ====== */}
      <section className="mb-5 animate-fade-in" style={{ animationDelay: "80ms" }}>
        {hasContent ? (
          <div className="flex flex-col gap-2.5">
            {/* 记录 */}
            {showRecords &&
              topicRecords.map((record, i) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  selectMode={selectMode}
                  selected={selectedIds.has(record.id)}
                  onToggle={() => toggleSelect(record.id)}
                  onClick={() => {
                    if (selectMode) toggleSelect(record.id);
                    else navigate(`/record/${record.id}`);
                  }}
                  onTouchStart={() => handleTouchStart(record.id)}
                  onTouchEnd={handleTouchEnd}
                  delay={i * 40}
                />
              ))}

            {/* 汇总 */}
            {showSyntheses &&
              topicSyntheses.map((s) => (
                <SynthesisCard
                  key={s.id}
                  synthesis={s}
                  onClick={() => navigate(`/synthesis/${s.id}`)}
                  onGenerateBrief={async () => {
                    setGeneratingBriefId(s.id);
                    try {
                      const brief = await generateBriefFromSynthesisData(s.id);
                      if (brief) navigate(`/brief/${brief.id}`);
                    } finally {
                      setGeneratingBriefId(null);
                    }
                  }}
                  generating={generatingBriefId === s.id}
                />
              ))}

            {/* 推进卡 */}
            {showBriefs &&
              topicBriefs.map((b) => (
                <BriefCard
                  key={b.id}
                  brief={b}
                  onClick={() => navigate(`/brief/${b.id}`)}
                />
              ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-stone-400 text-sm">
              {activeTab === "全部"
                ? "该主题下暂无内容"
                : `该主题下暂无${activeTab}`}
            </p>
          </div>
        )}
      </section>

      {/* ====== 6. 本主题相关汇总（仅在"全部"或"汇总"时展示） ====== */}
      {showSyntheses && topicSyntheses.length > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "100ms" }}>
          <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
            本主题相关汇总
          </h2>
          <div className="flex flex-col gap-2.5">
            {topicSyntheses.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-2xl p-4 border border-stone-200/50"
              >
                <h3 className="text-[13px] font-semibold text-stone-800 mb-1">
                  {s.title}
                </h3>
                <p className="text-[12px] text-stone-500 line-clamp-2 mb-3">
                  {s.oneLineSummary}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/synthesis/${s.id}`)}
                    className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-[11px] font-medium"
                  >
                    查看详情
                  </button>
                  <button
                    onClick={async () => {
                      setGeneratingBriefId(s.id);
                      try {
                        const brief = await generateBriefFromSynthesisData(s.id);
                        if (brief) navigate(`/brief/${brief.id}`);
                      } finally {
                        setGeneratingBriefId(null);
                      }
                    }}
                    disabled={generatingBriefId === s.id}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-medium disabled:opacity-50"
                  >
                    {generatingBriefId === s.id ? "生成中..." : "生成 Brief"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ====== 7. 页面底部操作区 ====== */}
      {!selectMode && recordCount > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "120ms" }}>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                if (topicRecords.length >= 2) {
                  setSelectMode(true);
                  setSelectedIds(new Set(topicRecords.slice(0, 2).map((r) => r.id)));
                } else {
                  alert("至少需要 2 条记录才能生成汇总");
                }
              }}
              className="w-full py-3 bg-stone-900 text-white rounded-xl text-[13px] font-medium active:bg-stone-800"
            >
              生成主题汇总
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (topicRecords[0]) {
                    handleGenerateBrief(topicRecords[0].id);
                  }
                }}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-medium active:bg-emerald-700"
              >
                生成 Brief
              </button>
              <button
                onClick={() => setSelectMode(true)}
                className="flex-1 py-2.5 bg-white text-stone-700 rounded-xl text-[13px] font-medium border border-stone-200/80 active:bg-stone-50"
              >
                批量设主题
              </button>
            </div>
          </div>
        </section>
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
              className="flex-1 py-2.5 bg-stone-900 text-white rounded-xl text-[13px] font-medium disabled:opacity-30 active:bg-stone-800"
            >
              {synthesizing ? "生成中..." : "生成汇总"}
            </button>
            <button
              onClick={() => setShowTopicInput(!showTopicInput)}
              disabled={selectedIds.size === 0}
              className="flex-1 py-2.5 bg-white text-stone-700 rounded-xl text-[13px] font-medium border border-stone-200/80 disabled:opacity-30 active:bg-stone-50"
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

/* ========== 子组件 ========== */

function OverviewCard({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3.5 border border-stone-200/50">
      <p className={`text-[18px] font-bold ${accent} truncate leading-tight`}>
        {value}
      </p>
      <p className="text-[11px] text-stone-400 font-medium mt-1">{label}</p>
    </div>
  );
}

function MenuButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-stone-700 hover:bg-stone-50 active:bg-stone-100 transition-colors"
    >
      {children}
    </button>
  );
}

function RecordCard({
  record,
  selectMode,
  selected,
  onToggle,
  onClick,
  onTouchStart,
  onTouchEnd,
  delay,
}: {
  record: ThoughtRecord;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  delay: number;
}) {
  return (
    <button
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={`w-full text-left bg-white rounded-2xl p-4 card-press border transition-all duration-200 animate-fade-in ${
        selected
          ? "border-stone-400 bg-stone-50/80"
          : "border-stone-200/50 hover:border-stone-300/60"
      }`}
      style={{ animationDelay: `${Math.min(delay, 200)}ms` }}
    >
      {selectMode && (
        <div className="flex items-center gap-2.5 mb-2">
          <span
            className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
              selected
                ? "bg-stone-900 border-stone-900"
                : "border-stone-300 bg-white"
            }`}
          >
            {selected && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <span className="text-[11px] text-stone-400 font-medium">
            {selected ? "已选" : "点击选择"}
          </span>
        </div>
      )}
      <div className="flex items-start gap-2.5 mb-2">
        {record.promoteLevel !== "仅保存" && (
          <span
            className={`shrink-0 mt-[6px] w-[6px] h-[6px] rounded-full ${PROMOTE_DOT[record.promoteLevel]}`}
          />
        )}
        <h3 className="text-[13px] font-semibold text-stone-800 line-clamp-1 leading-snug flex-1">
          {record.aiTitle}
        </h3>
        <span
          className={`shrink-0 px-2 py-[3px] rounded-md text-[10px] font-medium tracking-wide ${TYPE_COLORS[record.type]}`}
        >
          {record.aiSubType ? `${record.type} · ${record.aiSubType}` : record.type}
        </span>
      </div>
      <p className="text-[12px] text-stone-500 line-clamp-2 mb-3 leading-[1.6]">
        {record.aiSummary}
      </p>
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
          {formatShortTime(record.updatedAt)}
        </span>
      </div>
    </button>
  );
}

function SynthesisCard({
  synthesis,
  onClick,
  onGenerateBrief,
  generating,
}: {
  synthesis: Synthesis;
  onClick: () => void;
  onGenerateBrief: () => void;
  generating: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
      <h3 className="text-[13px] font-semibold text-stone-800 mb-1">
        {synthesis.title}
      </h3>
      <p className="text-[12px] text-stone-500 line-clamp-2 mb-3">
        {synthesis.oneLineSummary}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onClick}
          className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-[11px] font-medium"
        >
          查看详情
        </button>
        <button
          onClick={onGenerateBrief}
          disabled={generating}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-medium disabled:opacity-50"
        >
          {generating ? "生成中..." : "生成 Brief"}
        </button>
      </div>
    </div>
  );
}

function BriefCard({
  brief,
  onClick,
}: {
  brief: ProjectBrief;
  onClick: () => void;
}) {
  const total = brief.nextActions.length;
  const done = brief.nextActions.filter((a) => a.done).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl p-4 card-press border border-stone-200/50 hover:border-stone-300/60 active:bg-stone-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-[13px] font-semibold text-stone-800 truncate flex-1">
          {brief.title}
        </h3>
        <span
          className={`shrink-0 px-2 py-[2px] rounded text-[10px] font-medium ${
            brief.status === "进行中"
              ? "bg-amber-50 text-amber-600"
              : brief.status === "已完成"
              ? "bg-emerald-50 text-emerald-600"
              : "bg-stone-50 text-stone-400"
          }`}
        >
          {brief.status}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] text-stone-400 font-medium">
          {done}/{total}
        </span>
      </div>
      <p className="text-[11px] text-stone-400 mt-1.5">
        最近更新 {formatShortTime(brief.updatedAt)}
      </p>
    </button>
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
