import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import type {
  ThoughtRecord,
  Synthesis,
  ProjectBrief,
  RecordType,
  PromoteLevel,
} from "../types";
import {
  saveRecords,
  saveSyntheses,
  saveBriefs,
  loadVisibleRecords,
} from "../storage";
import {
  getSyncMeta,
  getSyncConfig,
  getSyncSession,
} from "../syncConfig";
import { organizeRecord, generateSynthesisFromRecords } from "../aiService";
import { getExistingTopics, getRecentTopTopics } from "../aiConfig";

const STORAGE_KEY = "thoughtbox_workspace_state";
const MOBILE_BREAKPOINT = 1024;

/* ============================================================
   Helpers
   ============================================================ */

function formatRelativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}天前`;
  if (d < 30) return `${Math.floor(d / 7)}周前`;
  return `${Math.floor(d / 30)}月前`;
}

function isThisWeek(ts: string) {
  const date = new Date(ts);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

function getPromoteLevelColor(level?: PromoteLevel) {
  switch (level) {
    case "push": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "watch": return "bg-amber-50 text-amber-700 border-amber-200";
    case "track": return "bg-blue-50 text-blue-700 border-blue-200";
    default: return "bg-stone-50 text-stone-500 border-stone-200";
  }
}

function getPromoteLabel(level?: PromoteLevel) {
  switch (level) {
    case "push": return "推进";
    case "watch": return "观察";
    case "track": return "跟踪";
    default: return "待办";
  }
}

function getTypeColor(type: RecordType) {
  switch (type) {
    case "灵感": return "bg-violet-50 text-violet-700 border-violet-200";
    case "待办": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "项目": return "bg-blue-50 text-blue-700 border-blue-200";
    case "决策": return "bg-amber-50 text-amber-700 border-amber-200";
    case "概念": return "bg-rose-50 text-rose-700 border-rose-200";
    case "资源": return "bg-cyan-50 text-cyan-700 border-cyan-200";
    default: return "bg-stone-50 text-stone-500 border-stone-200";
  }
}

/* ============================================================
   Smart Filters
   ============================================================ */

const SMART_FILTERS: { id: string; label: string; predicate: (r: ThoughtRecord) => boolean }[] = [
  { id: "pending", label: "待整理", predicate: (r) => r.aiStatus === "pending" },
  { id: "suggested", label: "建议推进", predicate: (r) => r.promoteLevel === "push" },
  { id: "recentlyEdited", label: "最近编辑", predicate: (r) => !!r.userEdited },
  { id: "noFeedback", label: "未反馈", predicate: (r) => !r.feedbackStatus },
  { id: "thisWeek", label: "本周新增", predicate: (r) => isThisWeek(r.createdAt) },
  { id: "archived", label: "已归档", predicate: (r) => r.archived },
];

/* ============================================================
   Main Component
   ============================================================ */

export default function WorkspacePage() {
  const navigate = useNavigate();
  const {
    records,
    syntheses,
    briefs,
    preferences,
    profiles,
    aiActiveProfile,
    generateBriefFromRecordData,
    batchSetTopic,
    batchArchive,
  } = useApp();

  /* ---- Mobile redirect ---- */
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isMobile) {
      navigate("/", { replace: true });
    }
  }, [isMobile, navigate]);

  if (isMobile) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-50">
        <div className="text-center p-8">
          <p className="text-stone-500 text-sm">请在更宽的屏幕上使用工作台</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-sm"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  /* ---- State ---- */
  const [view, setView] = useState<"inbox" | "topics" | "synthesis" | "briefs" | "review">("inbox");
  const [filterId, setFilterId] = useState<string>("");
  const [sortBy, setSortBy] = useState<"updated" | "created" | "promote" | "topic">("updated");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState<"record" | "synthesis" | "brief" | null>(null);
  const [selectedItem, setSelectedItem] = useState<ThoughtRecord | Synthesis | ProjectBrief | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [batchTopic, setBatchTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ---- Load persisted state ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.view) setView(s.view);
        if (s.filterId !== undefined) setFilterId(s.filterId);
        if (s.sortBy) setSortBy(s.sortBy);
        if (s.showInspector !== undefined) setShowInspector(s.showInspector);
      }
    } catch {}
  }, []);

  /* ---- Persist state ---- */
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ view, filterId, sortBy, showInspector })
    );
  }, [view, filterId, sortBy, showInspector]);

  /* ---- Keyboard shortcuts ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        if (e.key === "Escape") {
          (target as HTMLInputElement).blur?.();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        navigate("/new");
      } else if (e.key === "Escape") {
        if (selectMode) {
          setSelectMode(false);
          setSelectedIds(new Set());
        } else if (selectedItem) {
          setSelectedItem(null);
          setSelectedType(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, selectMode, selectedItem]);

  /* ---- Data filtering & sorting ---- */
  const filteredRecords = useMemo(() => {
    let list = [...records];

    // Smart filter
    const sf = SMART_FILTERS.find((f) => f.id === filterId);
    if (sf) {
      list = list.filter(sf.predicate);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.rawText.toLowerCase().includes(q) ||
          r.aiTitle.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          r.topic.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "promote": {
          const order: Record<string, number> = { push: 0, watch: 1, track: 2 };
          return (order[a.promoteLevel || "" ] || 3) - (order[b.promoteLevel || ""] || 3);
        }
        case "topic":
          return (a.topic || "").localeCompare(b.topic || "");
        default:
          return 0;
      }
    });

    return list;
  }, [records, filterId, searchQuery, sortBy]);

  const topics = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      if (r.topic) {
        map.set(r.topic, (map.get(r.topic) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [records]);

  const activeTopics = getExistingTopics(records);
  const recentTopics = getRecentTopTopics(records, 6);

  /* ---- Sync status ---- */
  const syncMeta = getSyncMeta();
  const syncConfig = getSyncConfig();
  const syncSession = getSyncSession();

  /* ---- Selection helpers ---- */
  const toggleSelect = useCallback(
    (id: string, type: "record" | "synthesis" | "brief") => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setSelectedType(type);
    },
    []
  );

  const selectAll = useCallback(() => {
    if (view === "inbox") {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
      setSelectedType("record");
    }
  }, [view, filteredRecords]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setSelectedType(null);
  }, []);

  /* ---- Actions ---- */
  const handleBatchTopic = async () => {
    if (!batchTopic.trim() || selectedIds.size === 0) return;
    await batchSetTopic(Array.from(selectedIds), batchTopic.trim());
    setBatchTopic("");
    setShowTopicInput(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchArchive = async () => {
    if (selectedIds.size === 0) return;
    await batchArchive(Array.from(selectedIds));
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleGenerateSummary = async () => {
    if (selectedIds.size < 2) return;
    setSynthesizing(true);
    const items = filteredRecords.filter((r) => selectedIds.has(r.id));
    await generateSynthesisFromRecords(items, aiActiveProfile || undefined);
    setSynthesizing(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    setView("synthesis");
  };

  const handleGenerateBriefFromSelection = async () => {
    if (selectedIds.size === 0) return;
    setGeneratingBrief(true);
    const items = filteredRecords.filter((r) => selectedIds.has(r.id));
    if (items.length > 0) {
      await generateBriefFromRecordData(items[0]);
    }
    setGeneratingBrief(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    setView("briefs");
  };

  const handleReorganize = async (record: ThoughtRecord) => {
    const fresh = { ...record, aiStatus: "pending" as const };
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      const next = [...records];
      next[idx] = fresh;
      saveRecords(next);
      setSelectedItem(fresh);
      await organizeRecord(fresh, aiActiveProfile || undefined);
    }
  };

  /* ---- Weekly review ---- */
  const currentWeekSynthesis = useMemo(() => {
    const key = getCurrentWeekKey();
    return syntheses.find((s) => s.weekKey === key && s.mode === "weekly_review");
  }, [syntheses]);

  const weeklyHistory = useMemo(() => {
    return syntheses
      .filter((s) => s.mode === "weekly_review")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);
  }, [syntheses]);

  /* ---- Render ---- */
  return (
    <div className="h-screen flex flex-col bg-stone-50 text-stone-800 overflow-hidden">
      {/* ---- Top Bar ---- */}
      <header className="shrink-0 h-14 border-b border-stone-200/60 bg-white flex items-center px-4 gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-stone-800">工作台</span>
          <span className="text-xs text-stone-400">/ {viewLabel(view)}</span>
        </div>

        <div className="flex-1 max-w-md">
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索记录、标签、主题... ( / )"
            className="w-full px-3 py-1.5 text-sm bg-stone-50 border border-stone-200/60 rounded-lg focus:outline-none focus:border-stone-400 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/new")}
            className="px-3 py-1.5 text-sm bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            + 新建
          </button>
          <button
            onClick={() => navigate("/")}
            className="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            返回
          </button>
        </div>
      </header>

      {/* ---- Three-column layout ---- */}
      <div className="flex-1 flex overflow-hidden">
        {/* ---- Left Column ---- */}
        <LeftPanel
          view={view}
          setView={setView}
          filterId={filterId}
          setFilterId={setFilterId}
          topics={topics}
          activeTopics={activeTopics}
          recentTopics={recentTopics}
          syncMeta={syncMeta}
          syncConfig={syncConfig}
          syncSession={syncSession}
          recordCount={records.length}
          synthesisCount={syntheses.length}
          briefCount={briefs.length}
          onNavigate={navigate}
        />

        {/* ---- Middle Column ---- */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-stone-200/60 bg-white">
          {/* Toolbar */}
          <div className="shrink-0 px-4 py-3 border-b border-stone-100 flex items-center gap-3">
            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs px-2 py-1.5 bg-stone-50 border border-stone-200/60 rounded-lg focus:outline-none"
            >
              <option value="updated">最近更新</option>
              <option value="created">最新创建</option>
              <option value="promote">推进优先</option>
              <option value="topic">按主题</option>
            </select>

            {/* Select mode toggle */}
            <button
              onClick={() => {
                if (selectMode) {
                  exitSelectMode();
                } else {
                  setSelectMode(true);
                }
              }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                selectMode
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-600 border-stone-200/60 hover:border-stone-300"
              }`}
            >
              {selectMode ? `已选 ${selectedIds.size}` : "多选"}
            </button>

            {selectMode && (
              <>
                <button onClick={selectAll} className="text-xs text-stone-500 hover:text-stone-800">
                  全选
                </button>
                <button onClick={exitSelectMode} className="text-xs text-stone-400 hover:text-stone-600">
                  取消
                </button>
              </>
            )}

            <div className="flex-1" />
            <span className="text-xs text-stone-400">{filteredRecords.length} 条</span>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {view === "inbox" && (
              <RecordList
                records={filteredRecords}
                selectedIds={selectedIds}
                selectMode={selectMode}
                onToggleSelect={(id) => toggleSelect(id, "record")}
                onClickItem={(r) => {
                  if (selectMode) {
                    toggleSelect(r.id, "record");
                  } else {
                    setSelectedItem(r);
                    setSelectedType("record");
                  }
                }}
                onDoubleClickItem={(r) => navigate(`/record/${r.id}`)}
              />
            )}
            {view === "synthesis" && (
              <SynthesisList
                syntheses={syntheses}
                onClickItem={(s) => {
                  setSelectedItem(s);
                  setSelectedType("synthesis");
                }}
              />
            )}
            {view === "briefs" && (
              <BriefList
                briefs={briefs}
                onClickItem={(b) => {
                  setSelectedItem(b);
                  setSelectedType("brief");
                }}
              />
            )}
            {view === "review" && (
              <ReviewPanel
                currentWeekSynthesis={currentWeekSynthesis}
                weeklyHistory={weeklyHistory}
                records={records}
                onClickSynthesis={(s) => {
                  setSelectedItem(s);
                  setSelectedType("synthesis");
                }}
                onNavigate={navigate}
              />
            )}
            {view === "topics" && (
              <TopicsPanel
                records={records}
                activeTopics={activeTopics}
                onClickRecord={(r) => {
                  setSelectedItem(r);
                  setSelectedType("record");
                }}
                onNavigate={navigate}
              />
            )}
          </div>

          {/* Batch Actions */}
          {selectMode && view === "inbox" && (
            <div className="shrink-0 px-4 py-3 border-t border-stone-100 bg-stone-50/80">
              {showTopicInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={batchTopic}
                    onChange={(e) => setBatchTopic(e.target.value)}
                    placeholder="输入主题名称"
                    className="flex-1 text-sm px-3 py-2 bg-white border border-stone-200/60 rounded-lg focus:outline-none focus:border-stone-400"
                    autoFocus
                  />
                  <button
                    onClick={handleBatchTopic}
                    disabled={!batchTopic.trim()}
                    className="px-3 py-2 text-sm bg-stone-900 text-white rounded-lg disabled:opacity-30"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => setShowTopicInput(false)}
                    className="px-3 py-2 text-sm text-stone-500"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTopicInput(true)}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 text-xs bg-white border border-stone-200/60 rounded-lg hover:border-stone-300 disabled:opacity-30"
                  >
                    批量设主题
                  </button>
                  <button
                    onClick={handleBatchArchive}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 text-xs bg-white border border-stone-200/60 rounded-lg hover:border-stone-300 disabled:opacity-30"
                  >
                    归档
                  </button>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={selectedIds.size < 2 || synthesizing}
                    className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded-lg disabled:opacity-30"
                  >
                    {synthesizing ? "生成中..." : "生成汇总"}
                  </button>
                  <button
                    onClick={handleGenerateBriefFromSelection}
                    disabled={selectedIds.size === 0 || generatingBrief}
                    className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-lg disabled:opacity-30"
                  >
                    {generatingBrief ? "生成中..." : "生成推进卡"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Right Column (Inspector) ---- */}
        {showInspector && (
          <div className="w-[380px] shrink-0 bg-stone-50/50 border-l border-stone-200/60 overflow-y-auto">
            {!selectedItem && (
              <div className="flex items-center justify-center h-full text-stone-400 text-sm">
                <p>点击列表项查看详情</p>
              </div>
            )}
            {selectedItem && selectedType === "record" && (
              <RecordInspector
                record={selectedItem as ThoughtRecord}
                onClose={() => {
                  setSelectedItem(null);
                  setSelectedType(null);
                }}
                onNavigate={(path) => navigate(path)}
                onReorganize={handleReorganize}
                allRecords={records}
                aiActiveProfile={aiActiveProfile}
                generateBriefFromRecordData={generateBriefFromRecordData}
                onBatchTopic={() => setShowTopicInput(true)}
                onArchive={handleBatchArchive}
              />
            )}
            {selectedItem && selectedType === "synthesis" && (
              <SynthesisInspector
                synthesis={selectedItem as Synthesis}
                onClose={() => {
                  setSelectedItem(null);
                  setSelectedType(null);
                }}
                onNavigate={(path) => navigate(path)}
              />
            )}
            {selectedItem && selectedType === "brief" && (
              <BriefInspector
                brief={selectedItem as ProjectBrief}
                onClose={() => {
                  setSelectedItem(null);
                  setSelectedType(null);
                }}
                onNavigate={(path) => navigate(path)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Left Panel
   ============================================================ */

function LeftPanel({
  view,
  setView,
  filterId,
  setFilterId,
  topics,
  activeTopics,
  recentTopics,
  syncMeta,
  syncConfig,
  syncSession,
  recordCount,
  synthesisCount,
  briefCount,
  onNavigate,
}: {
  view: string;
  setView: (v: any) => void;
  filterId: string;
  setFilterId: (id: string) => void;
  topics: { name: string; count: number }[];
  activeTopics: string[];
  recentTopics: string[];
  syncMeta: any;
  syncConfig: any;
  syncSession: any;
  recordCount: number;
  synthesisCount: number;
  briefCount: number;
  onNavigate: (path: string) => void;
}) {
  const navItems = [
    { id: "inbox", label: "收件箱", count: recordCount },
    { id: "topics", label: "主题", count: activeTopics.length },
    { id: "synthesis", label: "汇总", count: synthesisCount },
    { id: "briefs", label: "推进卡", count: briefCount },
    { id: "review", label: "回顾", count: 0 },
  ];

  return (
    <div className="w-[220px] shrink-0 bg-white border-r border-stone-200/60 flex flex-col overflow-hidden">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-stone-100">
        <h1 className="text-sm font-semibold text-stone-800">工作台</h1>
        <p className="text-[11px] text-stone-400 mt-0.5">整理 · 回顾 · 推进</p>
      </div>

      {/* Navigation */}
      <div className="px-2 py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setView(item.id);
              setFilterId("");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              view === item.id
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-50"
            }`}
          >
            <span>{item.label}</span>
            <span className={`text-xs ${view === item.id ? "text-stone-400" : "text-stone-300"}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {/* Smart Filters */}
      {view === "inbox" && (
        <div className="px-4 py-3 border-t border-stone-100">
          <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-2">智能筛选</p>
          <div className="space-y-0.5">
            {SMART_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterId(filterId === f.id ? "" : f.id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  filterId === f.id
                    ? "bg-stone-100 text-stone-800 font-medium"
                    : "text-stone-500 hover:bg-stone-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Topics */}
      {view === "inbox" && topics.length > 0 && (
        <div className="px-4 py-3 border-t border-stone-100">
          <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-2">活跃主题</p>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <button
                key={t.name}
                onClick={() => {
                  // TODO: filter by topic
                }}
                className="px-2 py-1 text-[11px] bg-stone-50 border border-stone-200/60 rounded-md text-stone-600 hover:bg-stone-100 transition-colors"
              >
                {t.name} <span className="text-stone-300">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sync Status */}
      <div className="mt-auto px-4 py-3 border-t border-stone-100">
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              syncSession ? "bg-emerald-400" : "bg-stone-300"
            }`}
          />
          <span className="text-[11px] text-stone-400">
            {syncSession ? "已同步" : "未同步"}
          </span>
        </div>
        {syncMeta?.lastSyncAt && (
          <p className="text-[10px] text-stone-300 mt-1">
            {formatRelativeTime(syncMeta.lastSyncAt)}
          </p>
        )}
        <button
          onClick={() => onNavigate("/settings/sync")}
          className="text-[11px] text-stone-400 hover:text-stone-600 mt-1"
        >
          同步设置 →
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Record List
   ============================================================ */

function RecordList({
  records,
  selectedIds,
  selectMode,
  onToggleSelect,
  onClickItem,
  onDoubleClickItem,
}: {
  records: ThoughtRecord[];
  selectedIds: Set<string>;
  selectMode: boolean;
  onToggleSelect: (id: string) => void;
  onClickItem: (r: ThoughtRecord) => void;
  onDoubleClickItem: (r: ThoughtRecord) => void;
}) {
  return (
    <div className="divide-y divide-stone-50">
      {records.map((record) => (
        <div
          key={record.id}
          onClick={() => onClickItem(record)}
          onDoubleClick={() => onDoubleClickItem(record)}
          className={`px-4 py-3 cursor-pointer transition-colors hover:bg-stone-50/80 ${
            selectedIds.has(record.id) ? "bg-stone-100/60" : ""
          }`}
        >
          <div className="flex items-start gap-3">
            {selectMode && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(record.id);
                }}
                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                  selectedIds.has(record.id)
                    ? "bg-stone-900 border-stone-900"
                    : "border-stone-300 bg-white"
                }`}
              >
                {selectedIds.has(record.id) && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(record.type)}`}>
                  {record.type}
                </span>
                {record.promoteLevel && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPromoteLevelColor(record.promoteLevel)}`}>
                    {getPromoteLabel(record.promoteLevel)}
                  </span>
                )}
                {record.userEdited && (
                  <span className="text-[10px] text-stone-400">已编辑</span>
                )}
                {record.feedbackStatus && (
                  <span className="text-[10px] text-stone-400">已反馈</span>
                )}
              </div>
              <h3 className="text-sm font-medium text-stone-800 truncate">{record.aiTitle}</h3>
              <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{record.rawText}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {record.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
                {record.topic && (
                  <span className="text-[10px] text-stone-400">· {record.topic}</span>
                )}
                <span className="text-[10px] text-stone-300 ml-auto">
                  {formatRelativeTime(record.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
      {records.length === 0 && (
        <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
          <p>暂无记录</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Synthesis List
   ============================================================ */

function SynthesisList({
  syntheses,
  onClickItem,
}: {
  syntheses: Synthesis[];
  onClickItem: (s: Synthesis) => void;
}) {
  const items = [...syntheses].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="divide-y divide-stone-50">
      {items.map((s) => (
        <div
          key={s.id}
          onClick={() => onClickItem(s)}
          className="px-4 py-3 cursor-pointer hover:bg-stone-50/80 transition-colors"
        >
          <h3 className="text-sm font-medium text-stone-800">{s.title}</h3>
          <p className="text-xs text-stone-400 mt-1">{s.oneLineSummary}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {s.keyThemes?.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">
                {t}
              </span>
            ))}
            <span className="text-[10px] text-stone-300 ml-auto">
              {s.sourceRecordIds.length} 条来源 · {formatRelativeTime(s.updatedAt)}
            </span>
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
          <p>暂无汇总</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Brief List
   ============================================================ */

function BriefList({
  briefs,
  onClickItem,
}: {
  briefs: ProjectBrief[];
  onClickItem: (b: ProjectBrief) => void;
}) {
  const items = [...briefs]
    .filter((b) => b.status !== "archived")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="divide-y divide-stone-50">
      {items.map((b) => {
        const completed = b.actionItems.filter((a) => a.completed).length;
        const total = b.actionItems.length;
        return (
          <div
            key={b.id}
            onClick={() => onClickItem(b)}
            className="px-4 py-3 cursor-pointer hover:bg-stone-50/80 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                b.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : b.status === "completed"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-stone-50 text-stone-500 border-stone-200"
              }`}>
                {b.status === "active" ? "进行中" : b.status === "completed" ? "已完成" : "暂停"}
              </span>
              {b.topic && (
                <span className="text-[10px] text-stone-400">{b.topic}</span>
              )}
            </div>
            <h3 className="text-sm font-medium text-stone-800">{b.title}</h3>
            <p className="text-xs text-stone-400 mt-1">{b.summary}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-stone-400">
                行动 {completed}/{total}
              </span>
              <span className="text-[10px] text-stone-300 ml-auto">
                {formatRelativeTime(b.updatedAt)}
              </span>
            </div>
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
          <p>暂无推进卡</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Review Panel
   ============================================================ */

function ReviewPanel({
  currentWeekSynthesis,
  weeklyHistory,
  records,
  onClickSynthesis,
  onNavigate,
}: {
  currentWeekSynthesis?: Synthesis;
  weeklyHistory: Synthesis[];
  records: ThoughtRecord[];
  onClickSynthesis: (s: Synthesis) => void;
  onNavigate: (path: string) => void;
}) {
  const thisWeekCount = records.filter((r) => isThisWeek(r.createdAt)).length;
  const pushCount = records.filter((r) => r.promoteLevel === "push" && !r.archived).length;
  const topTopic = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      if (r.topic) map.set(r.topic, (map.get(r.topic) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  }, [records]);

  return (
    <div className="p-4 space-y-4">
      {/* Weekly Overview */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "本周记录", value: thisWeekCount },
          { label: "最活跃主题", value: topTopic },
          { label: "建议推进", value: pushCount },
          { label: "历史回顾", value: weeklyHistory.length },
        ].map((stat) => (
          <div key={stat.label} className="bg-stone-50 rounded-xl p-3 border border-stone-100">
            <p className="text-[11px] text-stone-400">{stat.label}</p>
            <p className="text-lg font-semibold text-stone-800 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Current Week */}
      {currentWeekSynthesis ? (
        <div
          onClick={() => onClickSynthesis(currentWeekSynthesis)}
          className="bg-white rounded-xl p-4 border border-stone-200/60 cursor-pointer hover:border-stone-300 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-stone-800">本周回顾</h3>
            <span className="text-[10px] text-stone-400">{formatRelativeTime(currentWeekSynthesis.createdAt)}</span>
          </div>
          <p className="text-xs text-stone-500">{currentWeekSynthesis.oneLineSummary}</p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(`/synthesis/${currentWeekSynthesis.id}`);
              }}
              className="text-xs px-3 py-1.5 bg-stone-900 text-white rounded-lg"
            >
              查看详情
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-stone-50 rounded-xl p-4 border border-stone-100 text-center">
          <p className="text-sm text-stone-500">本周回顾尚未生成</p>
          <button
            onClick={() => onNavigate("/review")}
            className="mt-2 text-xs text-stone-500 hover:text-stone-800"
          >
            前往回顾页 →
          </button>
        </div>
      )}

      {/* History */}
      {weeklyHistory.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-2">历史回顾</p>
          <div className="space-y-2">
            {weeklyHistory.slice(0, 8).map((s) => (
              <div
                key={s.id}
                onClick={() => onClickSynthesis(s)}
                className="bg-white rounded-lg p-3 border border-stone-100 cursor-pointer hover:border-stone-200 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-700">{s.title}</span>
                  <span className="text-[10px] text-stone-300">{s.weekKey}</span>
                </div>
                <p className="text-[11px] text-stone-400 mt-1 truncate">{s.oneLineSummary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Topics Panel
   ============================================================ */

function TopicsPanel({
  records,
  activeTopics,
  onClickRecord,
  onNavigate,
}: {
  records: ThoughtRecord[];
  activeTopics: string[];
  onClickRecord: (r: ThoughtRecord) => void;
  onNavigate: (path: string) => void;
}) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const topicRecords = useMemo(() => {
    if (!selectedTopic) return [];
    return records.filter((r) => r.topic === selectedTopic);
  }, [records, selectedTopic]);

  return (
    <div className="flex h-full">
      {/* Topic list */}
      <div className="w-[200px] shrink-0 border-r border-stone-100 overflow-y-auto">
        <div className="p-3">
          <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-2">所有主题</p>
          <div className="space-y-0.5">
            {activeTopics.map((topic) => {
              const count = records.filter((r) => r.topic === topic).length;
              return (
                <button
                  key={topic}
                  onClick={() => setSelectedTopic(topic)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTopic === topic
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{topic}</span>
                    <span className={`text-xs ${selectedTopic === topic ? "text-stone-400" : "text-stone-300"}`}>
                      {count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Records for selected topic */}
      <div className="flex-1 overflow-y-auto">
        {selectedTopic ? (
          <div className="divide-y divide-stone-50">
            {topicRecords.map((r) => (
              <div
                key={r.id}
                onClick={() => onClickRecord(r)}
                className="px-4 py-3 cursor-pointer hover:bg-stone-50/80 transition-colors"
              >
                <h3 className="text-sm font-medium text-stone-800">{r.aiTitle}</h3>
                <p className="text-xs text-stone-400 mt-0.5 line-clamp-2">{r.rawText}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(r.type)}`}>
                    {r.type}
                  </span>
                  <span className="text-[10px] text-stone-300 ml-auto">
                    {formatRelativeTime(r.updatedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-stone-400 text-sm">
            <p>选择一个主题查看记录</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Record Inspector
   ============================================================ */

function RecordInspector({
  record,
  onClose,
  onNavigate,
  onReorganize,
  allRecords,
  aiActiveProfile,
  generateBriefFromRecordData,
  onBatchTopic,
  onArchive,
}: {
  record: ThoughtRecord;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onReorganize: (r: ThoughtRecord) => void;
  allRecords: ThoughtRecord[];
  aiActiveProfile: any;
  generateBriefFromRecordData: (r: ThoughtRecord) => Promise<ProjectBrief | null>;
  onBatchTopic: () => void;
  onArchive: () => void;
}) {
  const [generatingBrief, setGeneratingBrief] = useState(false);

  const handleGenerateBrief = async () => {
    setGeneratingBrief(true);
    await generateBriefFromRecordData(record);
    setGeneratingBrief(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(record.type)}`}>
            {record.type}
          </span>
          {record.promoteLevel && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPromoteLevelColor(record.promoteLevel)}`}>
              {getPromoteLabel(record.promoteLevel)}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-sm">
          ✕
        </button>
      </div>

      {/* Title */}
      <h2 className="text-base font-semibold text-stone-800 leading-snug">{record.aiTitle}</h2>

      {/* Source info */}
      <div className="flex items-center gap-2 text-[11px] text-stone-400">
        <span>{record.aiStatus === "completed" ? "AI 整理" : "本地整理"}</span>
        {record.aiProfileName && <span>· {record.aiProfileName}</span>}
        {record.userEdited && <span className="text-amber-600">· 已手动调整</span>}
        {record.feedbackStatus && <span className="text-blue-600">· 已记录反馈</span>}
        {record.preferenceApplied && <span className="text-emerald-600">· 已记住偏好</span>}
      </div>

      {/* Raw text */}
      <div>
        <p className="text-[11px] font-medium text-stone-400 mb-1.5">原始记录</p>
        <div className="text-xs text-stone-600 bg-stone-50 rounded-lg p-3 border border-stone-100 leading-relaxed whitespace-pre-wrap">
          {record.rawText}
        </div>
      </div>

      {/* Summary */}
      {record.aiSummary && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">摘要</p>
          <p className="text-xs text-stone-600 leading-relaxed">{record.aiSummary}</p>
        </div>
      )}

      {/* Tags */}
      {record.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {record.tags.map((tag) => (
            <span key={tag} className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200/60 px-2 py-0.5 rounded-md">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Topic */}
      {record.topic && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-stone-400">主题：</span>
          <span className="text-xs text-stone-700 bg-stone-50 px-2 py-0.5 rounded-md">{record.topic}</span>
        </div>
      )}

      {/* Suggestions */}
      {record.suggestions && record.suggestions.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">下一步建议</p>
          <ul className="space-y-1">
            {record.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-stone-600 flex items-start gap-2">
                <span className="text-stone-300 mt-0.5">·</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="pt-3 border-t border-stone-100 space-y-2">
        <button
          onClick={() => onNavigate(`/record/${record.id}`)}
          className="w-full py-2 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >
          打开完整详情页 →
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onReorganize(record)}
            className="py-2 text-xs bg-white border border-stone-200/60 text-stone-700 rounded-lg hover:border-stone-300 transition-colors"
          >
            重新整理
          </button>
          <button
            onClick={handleGenerateBrief}
            disabled={generatingBrief}
            className="py-2 text-xs bg-white border border-stone-200/60 text-stone-700 rounded-lg hover:border-stone-300 disabled:opacity-30 transition-colors"
          >
            {generatingBrief ? "生成中..." : "生成推进卡"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onArchive}
            className="py-2 text-xs bg-white border border-stone-200/60 text-stone-500 rounded-lg hover:border-stone-300 transition-colors"
          >
            归档
          </button>
          <button
            onClick={() => onNavigate(`/record/${record.id}?edit=1`)}
            className="py-2 text-xs bg-white border border-stone-200/60 text-stone-500 rounded-lg hover:border-stone-300 transition-colors"
          >
            编辑
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="text-[10px] text-stone-300 pt-2">
        <p>创建于 {new Date(record.createdAt).toLocaleString("zh-CN")}</p>
        <p>更新于 {new Date(record.updatedAt).toLocaleString("zh-CN")}</p>
      </div>
    </div>
  );
}

/* ============================================================
   Synthesis Inspector
   ============================================================ */

function SynthesisInspector({
  synthesis,
  onClose,
  onNavigate,
}: {
  synthesis: Synthesis;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-stone-50 text-stone-500 border-stone-200">
          {synthesis.mode === "weekly_review" ? "周回顾" : "内容汇总"}
        </span>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-sm">
          ✕
        </button>
      </div>

      <h2 className="text-base font-semibold text-stone-800">{synthesis.title}</h2>

      {synthesis.oneLineSummary && (
        <p className="text-xs text-stone-500 leading-relaxed">{synthesis.oneLineSummary}</p>
      )}

      {synthesis.overview && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">总览</p>
          <p className="text-xs text-stone-600 leading-relaxed">{synthesis.overview}</p>
        </div>
      )}

      {synthesis.keyThemes && synthesis.keyThemes.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">关键主题</p>
          <div className="flex flex-wrap gap-1.5">
            {synthesis.keyThemes.map((t) => (
              <span key={t} className="text-[10px] text-stone-500 bg-stone-50 border border-stone-200/60 px-2 py-0.5 rounded-md">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {synthesis.opportunities && synthesis.opportunities.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">推进机会</p>
          <ul className="space-y-1">
            {synthesis.opportunities.map((o, i) => (
              <li key={i} className="text-xs text-stone-600 flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">·</span>
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {synthesis.nextActions && synthesis.nextActions.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">下一步建议</p>
          <ul className="space-y-1">
            {synthesis.nextActions.map((a, i) => (
              <li key={i} className="text-xs text-stone-600 flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">·</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-3 border-t border-stone-100">
        <button
          onClick={() => onNavigate(`/synthesis/${synthesis.id}`)}
          className="w-full py-2 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >
          打开完整详情页 →
        </button>
      </div>

      <div className="text-[10px] text-stone-300">
        <p>{synthesis.sourceRecordIds.length} 条来源记录</p>
        <p>创建于 {new Date(synthesis.createdAt).toLocaleString("zh-CN")}</p>
      </div>
    </div>
  );
}

/* ============================================================
   Brief Inspector
   ============================================================ */

function BriefInspector({
  brief,
  onClose,
  onNavigate,
}: {
  brief: ProjectBrief;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const completed = brief.actionItems.filter((a) => a.completed).length;
  const total = brief.actionItems.length;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
          brief.status === "active"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : brief.status === "completed"
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-stone-50 text-stone-500 border-stone-200"
        }`}>
          {brief.status === "active" ? "进行中" : brief.status === "completed" ? "已完成" : "暂停"}
        </span>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-sm">
          ✕
        </button>
      </div>

      <h2 className="text-base font-semibold text-stone-800">{brief.title}</h2>

      {brief.summary && (
        <p className="text-xs text-stone-500 leading-relaxed">{brief.summary}</p>
      )}

      {brief.objective && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">目标</p>
          <p className="text-xs text-stone-600 leading-relaxed">{brief.objective}</p>
        </div>
      )}

      {brief.currentFocus && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">当前先做</p>
          <p className="text-xs text-stone-600 leading-relaxed">{brief.currentFocus}</p>
        </div>
      )}

      {/* Action items */}
      {brief.actionItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium text-stone-400">行动清单</p>
            <span className="text-[10px] text-stone-400">{completed}/{total}</span>
          </div>
          <div className="space-y-1.5">
            {brief.actionItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2 text-xs">
                <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                  item.completed
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-stone-300 bg-white"
                }`}>
                  {item.completed && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className={item.completed ? "text-stone-400 line-through" : "text-stone-700"}>
                  {item.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source */}
      {brief.sourceRecordId && (
        <div className="text-[11px] text-stone-400">
          来源：记录
        </div>
      )}
      {brief.sourceSynthesisId && (
        <div className="text-[11px] text-stone-400">
          来源：汇总
        </div>
      )}

      <div className="pt-3 border-t border-stone-100">
        <button
          onClick={() => onNavigate(`/brief/${brief.id}`)}
          className="w-full py-2 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >
          打开完整详情页 →
        </button>
      </div>

      <div className="text-[10px] text-stone-300">
        <p>创建于 {new Date(brief.createdAt).toLocaleString("zh-CN")}</p>
        <p>更新于 {new Date(brief.updatedAt).toLocaleString("zh-CN")}</p>
      </div>
    </div>
  );
}

/* ============================================================
   Helpers
   ============================================================ */

function viewLabel(view: string) {
  switch (view) {
    case "inbox": return "收件箱";
    case "topics": return "主题";
    case "synthesis": return "汇总";
    case "briefs": return "推进卡";
    case "review": return "回顾";
    default: return "";
  }
}

function getCurrentWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
