import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context";
import type {
  ThoughtRecord,
  Synthesis,
  ProjectBrief,
  RecordType,
  PromoteLevel,
  BriefActionItem,
} from "../types";
import { saveRecords, loadVisibleRecords } from "../storage";
import { saveSyntheses } from "../synthesisStorage";
import { saveBriefs, updateBrief as storageUpdateBrief } from "../briefStorage";
import {
  getSyncMeta,
  getSyncConfig,
  getSyncSession,
} from "../syncConfig";
import { organizeRecord } from "../ai";
import { generateSynthesisFromRecords } from "../aiService";
import { getExistingTopics, getRecentTopTopics } from "../aiConfig";

const STORAGE_KEY = "thoughtbox_workspace_state";
const MOBILE_BREAKPOINT = 1024;
const MOBILE_FORCE_KEY = "thoughtbox_workspace_mobile_force";

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
    case "建议立项": return "bg-blue-50 text-blue-700 border-blue-200";
    case "建议行动": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "建议观察": return "bg-amber-50 text-amber-700 border-amber-200";
    default: return "bg-stone-50 text-stone-500 border-stone-200";
  }
}

function getPromoteLabel(level?: PromoteLevel) {
  switch (level) {
    case "建议立项": return "立项";
    case "建议行动": return "行动";
    case "建议观察": return "观察";
    default: return "保存";
  }
}

function getTypeColor(type: RecordType) {
  switch (type) {
    case "随记": return "bg-stone-100 text-stone-500 border-stone-200";
    case "灵感": return "bg-violet-50 text-violet-700 border-violet-200";
    case "待办": return "bg-amber-50 text-amber-700 border-amber-200";
    case "项目": return "bg-blue-50 text-blue-700 border-blue-200";
    case "问题": return "bg-rose-50 text-rose-700 border-rose-200";
    case "复盘": return "bg-slate-100 text-slate-600 border-slate-200";
    case "参考": return "bg-teal-50 text-teal-700 border-teal-200";
    default: return "bg-stone-50 text-stone-500 border-stone-200";
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

/* ============================================================
   Smart Filters
   ============================================================ */

const SMART_FILTERS: { id: string; label: string; predicate: (r: ThoughtRecord) => boolean }[] = [
  { id: "pending", label: "待整理", predicate: (r) => r.aiStatus === "pending" },
  { id: "suggested", label: "建议推进", predicate: (r) => r.promoteLevel === "建议行动" || r.promoteLevel === "建议立项" },
  { id: "recentlyEdited", label: "最近编辑", predicate: (r) => !!r.userEdited },
  { id: "noFeedback", label: "未反馈", predicate: (r) => !r.feedbackStatus },
  { id: "thisWeek", label: "本周新增", predicate: (r) => isThisWeek(r.createdAt) },
  { id: "archived", label: "已归档", predicate: (r) => r.archived },
];

type WorkspaceView = "inbox" | "topics" | "synthesis" | "briefs" | "review";

/* ============================================================
   Main Component
   ============================================================ */

export default function WorkspacePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
    updateRecord,
    toggleBriefAction,
    addBriefAction,
    deleteBriefAction,
    updateBriefAction: updateBriefActionCtx,
  } = useApp();

  /* ---- Mobile handling ---- */
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const [mobileForceOpen, setMobileForceOpen] = useState(() => {
    try { return localStorage.getItem(MOBILE_FORCE_KEY) === "true"; } catch { return false; }
  });
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 移动端提示页
  if (isMobile && !mobileForceOpen) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-50 px-6">
        <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-5">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-stone-800 mb-2">工作台更适合在电脑上使用</h2>
        <p className="text-sm text-stone-400 text-center leading-relaxed mb-6 max-w-xs">
          这里更适合做筛选、批量整理、汇总和推进<br />你仍然可以在手机上继续记录和查看内容
        </p>
        <button
          onClick={() => navigate(-1)}
          className="w-full max-w-xs py-3 text-sm font-medium bg-stone-900 text-white rounded-xl active:bg-stone-800 mb-3"
        >
          返回收件箱
        </button>
        <button
          onClick={() => {
            setMobileForceOpen(true);
            try { localStorage.setItem(MOBILE_FORCE_KEY, "true"); } catch {}
          }}
          className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
        >
          仍然打开
        </button>
      </div>
    );
  }

  /* ---- Parse query params ---- */
  const queryView = searchParams.get("view");
  const queryRecordId = searchParams.get("recordId");
  const queryTopic = searchParams.get("topic");
  const querySynthesisId = searchParams.get("synthesisId");
  const queryBriefId = searchParams.get("briefId");

  const initViewFromQuery = (): WorkspaceView => {
    switch (queryView) {
      case "records": return "inbox";
      case "topics": return "topics";
      case "syntheses": return "synthesis";
      case "briefs": return "briefs";
      case "review": return "review";
      default: return "inbox";
    }
  };

  /* ---- State ---- */
  const [view, setView] = useState<WorkspaceView>(() => {
    if (queryView) return initViewFromQuery();
    return "inbox";
  });
  const [filterId, setFilterId] = useState<string>("");
  const [sortBy, setSortBy] = useState<"updated" | "created" | "promote" | "topic">("updated");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState<"record" | "synthesis" | "brief" | "topic" | null>(null);
  const [selectedItem, setSelectedItem] = useState<ThoughtRecord | Synthesis | ProjectBrief | string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [batchTopic, setBatchTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ---- Debounced search ---- */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* ---- Load persisted state ---- */
  useEffect(() => {
    if (queryView) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.view) setView(s.view);
        if (s.filterId !== undefined) setFilterId(s.filterId);
        if (s.sortBy) setSortBy(s.sortBy);
        if (s.showInspector !== undefined) setShowInspector(s.showInspector);
        if (s.leftPanelCollapsed !== undefined) setLeftPanelCollapsed(s.leftPanelCollapsed);
      }
    } catch {}
  }, []);

  /* ---- Auto-select item from query params ---- */
  useEffect(() => {
    if (queryRecordId) {
      const r = records.find((r) => r.id === queryRecordId);
      if (r) { setSelectedItem(r); setSelectedType("record"); }
    } else if (querySynthesisId) {
      const s = syntheses.find((s) => s.id === querySynthesisId);
      if (s) { setSelectedItem(s); setSelectedType("synthesis"); }
    } else if (queryBriefId) {
      const b = briefs.find((b) => b.id === queryBriefId);
      if (b) { setSelectedItem(b); setSelectedType("brief"); }
    } else if (queryTopic) {
      setSelectedItem(queryTopic);
      setSelectedType("topic");
    }
  }, [queryRecordId, querySynthesisId, queryBriefId, queryTopic, records, syntheses, briefs]);

  /* ---- Persist state ---- */
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ view, filterId, sortBy, showInspector, leftPanelCollapsed, lastView: queryView || view })
    );
  }, [view, filterId, sortBy, showInspector, leftPanelCollapsed, queryView]);

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
    let list = [...records].filter((r) => !r.archived || filterId === "archived");

    const sf = SMART_FILTERS.find((f) => f.id === filterId);
    if (sf) list = list.filter(sf.predicate);

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.rawText.toLowerCase().includes(q) ||
          r.aiTitle.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          r.topic.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "promote": {
          const order: Record<string, number> = { "建议立项": 0, "建议行动": 1, "建议观察": 2, "仅保存": 3 };
          return (order[a.promoteLevel || ""] || 4) - (order[b.promoteLevel || ""] || 4);
        }
        case "topic":
          return (a.topic || "").localeCompare(b.topic || "");
        default:
          return 0;
      }
    });

    return list;
  }, [records, filterId, debouncedSearch, sortBy]);

  const topics = useMemo(() => {
    const map = new Map<string, number>();
    records.filter((r) => !r.archived && r.topic).forEach((r) => {
      map.set(r.topic, (map.get(r.topic) || 0) + 1);
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
        if (next.has(id)) next.delete(id);
        else next.add(id);
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
    setSelectedItem(null);
    setSelectedType(null);
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
      await generateBriefFromRecordData(items[0].id);
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

  /* ---- Selection summary (for multi-select right panel) ---- */
  const selectionSummary = useMemo(() => {
    if (!selectMode || selectedIds.size === 0) return null;
    const items = filteredRecords.filter((r) => selectedIds.has(r.id));
    const topicMap = new Map<string, number>();
    const typeMap = new Map<string, number>();
    const promoteMap = new Map<string, number>();
    items.forEach((r) => {
      const t = r.topic || "未分类";
      topicMap.set(t, (topicMap.get(t) || 0) + 1);
      typeMap.set(r.type, (typeMap.get(r.type) || 0) + 1);
      const p = r.promoteLevel || "仅保存";
      promoteMap.set(p, (promoteMap.get(p) || 0) + 1);
    });
    return {
      count: items.length,
      topics: Array.from(topicMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      types: Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1]),
      promotes: Array.from(promoteMap.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [selectMode, selectedIds, filteredRecords]);

  /* ---- Brief action handlers ---- */
  const handleToggleBriefAction = useCallback((briefId: string, actionId: string) => {
    toggleBriefAction(briefId, actionId);
    // Update the local selected item
    const brief = briefs.find((b) => b.id === briefId);
    if (brief && selectedItem && (selectedItem as ProjectBrief).id === briefId) {
      const updated = { ...brief };
      const idx = updated.nextActions.findIndex((a) => a.id === actionId);
      if (idx >= 0) {
        updated.nextActions[idx] = { ...updated.nextActions[idx], done: !updated.nextActions[idx].done };
        setSelectedItem(updated);
      }
    }
  }, [toggleBriefAction, briefs, selectedItem]);

  const handleAddBriefAction = useCallback((briefId: string, content: string) => {
    addBriefAction(briefId, content);
    const brief = briefs.find((b) => b.id === briefId);
    if (brief && selectedItem && (selectedItem as ProjectBrief).id === briefId) {
      const newAction: BriefActionItem = {
        id: `ba_${Date.now()}`,
        content,
        done: false,
        source: "manual" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = { ...brief, nextActions: [...brief.nextActions, newAction] };
      setSelectedItem(updated);
    }
  }, [addBriefAction, briefs, selectedItem]);

  const handleDeleteBriefAction = useCallback((briefId: string, actionId: string) => {
    deleteBriefAction(briefId, actionId);
    const brief = briefs.find((b) => b.id === briefId);
    if (brief && selectedItem && (selectedItem as ProjectBrief).id === briefId) {
      const updated = { ...brief, nextActions: brief.nextActions.filter((a) => a.id !== actionId) };
      setSelectedItem(updated);
    }
  }, [deleteBriefAction, briefs, selectedItem]);

  /* ---- Active profile info ---- */
  const activeProfile = profiles.find((p) => p.isActive);

  /* ---- Render ---- */
  return (
    <div className="h-screen flex flex-col bg-stone-50 text-stone-800 overflow-hidden">
      {/* ============ Top Toolbar ============ */}
      <header className="shrink-0 h-14 border-b border-stone-200/60 bg-white flex items-center px-4 gap-3">
        {/* Left: breadcrumb */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <button
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate("/");
            }}
            className="p-1 rounded-md hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-600"
            title="返回上一页"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-stone-800">工作台</span>
          <span className="text-xs text-stone-400">/ {viewLabel(view)}</span>
        </div>

        {/* Center: search */}
        <div className="flex-1 max-w-lg mx-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标题、内容、标签或主题 ( / )"
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-stone-50 border border-stone-200/60 rounded-lg focus:outline-none focus:border-stone-400 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* AI status */}
          {activeProfile && (
            <span className="text-[10px] px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100 hidden lg:inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              {activeProfile.name}
            </span>
          )}
          {/* Sync status */}
          <span className="text-[10px] px-2 py-1 rounded-md bg-stone-50 text-stone-500 border border-stone-100 hidden lg:inline-flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${syncSession ? "bg-emerald-400" : "bg-stone-300"}`} />
            {syncSession ? "已同步" : "未同步"}
          </span>
          <button
            onClick={() => navigate("/new")}
            className="px-3 py-1.5 text-sm bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            + 新建记录
          </button>
          <button
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
            className="p-1.5 rounded-md hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-600 hidden lg:flex"
            title={leftPanelCollapsed ? "展开侧栏" : "收起侧栏"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {leftPanelCollapsed ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </>
              ) : (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </>
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* ============ Three-column layout ============ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ---- Left Column ---- */}
        {!leftPanelCollapsed && (
          <LeftPanel
            view={view}
            setView={(v) => { setView(v); setFilterId(""); setSelectedItem(null); setSelectedType(null); }}
            filterId={filterId}
            setFilterId={setFilterId}
            topics={topics}
            activeTopics={activeTopics}
            recentTopics={recentTopics}
            syncMeta={syncMeta}
            syncConfig={syncConfig}
            syncSession={syncSession}
            recordCount={records.filter((r) => !r.archived).length}
            synthesisCount={syntheses.length}
            briefCount={briefs.filter((b) => b.status !== "已归档").length}
            onNavigate={navigate}
            onTopicClick={(topicName) => {
              setView("inbox");
              setFilterId("");
              setSelectedItem(topicName);
              setSelectedType("topic");
            }}
          />
        )}

        {/* ---- Middle Column ---- */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-stone-200/60 bg-white">
          {/* Mid toolbar */}
          <div className="shrink-0 px-4 py-2.5 border-b border-stone-100 flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-xs px-2 py-1.5 bg-stone-50 border border-stone-200/60 rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="updated">最近更新</option>
              <option value="created">最新创建</option>
              <option value="promote">推进优先</option>
              <option value="topic">按主题</option>
            </select>

            {view === "inbox" && filterId && (
              <span className="text-[10px] px-2 py-1 rounded-md bg-stone-100 text-stone-600 flex items-center gap-1">
                {SMART_FILTERS.find((f) => f.id === filterId)?.label}
                <button onClick={() => setFilterId("")} className="text-stone-400 hover:text-stone-600">✕</button>
              </span>
            )}

            <div className="flex-1" />

            <button
              onClick={() => {
                if (selectMode) exitSelectMode();
                else setSelectMode(true);
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
                <button onClick={selectAll} className="text-xs text-stone-500 hover:text-stone-800">全选</button>
                <button onClick={exitSelectMode} className="text-xs text-stone-400 hover:text-stone-600">取消</button>
              </>
            )}

            <span className="text-[11px] text-stone-400 ml-1">
              {view === "inbox" ? `${filteredRecords.length} 条` :
               view === "synthesis" ? `${syntheses.length} 份` :
               view === "briefs" ? `${briefs.filter((b) => b.status !== "已归档").length} 张` :
               view === "topics" ? `${activeTopics.length} 个` : ""}
            </span>
          </div>

          {/* List area */}
          <div className="flex-1 overflow-y-auto">
            {view === "inbox" && (
              <RecordList
                records={filteredRecords}
                selectedIds={selectedIds}
                selectMode={selectMode}
                onToggleSelect={(id) => toggleSelect(id, "record")}
                onClickItem={(r) => {
                  if (selectMode) { toggleSelect(r.id, "record"); }
                  else { setSelectedItem(r); setSelectedType("record"); }
                }}
                onDoubleClickItem={(r) => navigate(`/record/${r.id}`)}
                selectedItemId={selectedType === "record" ? (selectedItem as ThoughtRecord)?.id : undefined}
              />
            )}
            {view === "topics" && (
              <TopicListPanel
                records={records}
                activeTopics={activeTopics}
                onClickTopic={(name) => { setSelectedItem(name); setSelectedType("topic"); }}
                onClickRecord={(r) => { setSelectedItem(r); setSelectedType("record"); }}
                selectedTopicName={selectedType === "topic" ? (selectedItem as string) : undefined}
                onNavigate={navigate}
              />
            )}
            {view === "synthesis" && (
              <SynthesisList
                syntheses={syntheses}
                onClickItem={(s) => { setSelectedItem(s); setSelectedType("synthesis"); }}
                selectedItemId={selectedType === "synthesis" ? (selectedItem as Synthesis)?.id : undefined}
              />
            )}
            {view === "briefs" && (
              <BriefList
                briefs={briefs}
                onClickItem={(b) => { setSelectedItem(b); setSelectedType("brief"); }}
                selectedItemId={selectedType === "brief" ? (selectedItem as ProjectBrief)?.id : undefined}
              />
            )}
            {view === "review" && (
              <ReviewPanel
                currentWeekSynthesis={currentWeekSynthesis}
                weeklyHistory={weeklyHistory}
                records={records}
                onClickSynthesis={(s) => { setSelectedItem(s); setSelectedType("synthesis"); }}
                onNavigate={navigate}
              />
            )}
          </div>

          {/* Batch Actions Bar */}
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
                  >确认</button>
                  <button onClick={() => setShowTopicInput(false)} className="px-3 py-2 text-sm text-stone-500">取消</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTopicInput(true)}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 text-xs bg-white border border-stone-200/60 rounded-lg hover:border-stone-300 disabled:opacity-30"
                  >批量设主题</button>
                  <button
                    onClick={handleBatchArchive}
                    disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 text-xs bg-white border border-stone-200/60 rounded-lg hover:border-stone-300 disabled:opacity-30"
                  >归档</button>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={selectedIds.size < 2 || synthesizing}
                    className="px-3 py-1.5 text-xs bg-stone-900 text-white rounded-lg disabled:opacity-30"
                  >{synthesizing ? "生成中..." : "生成汇总"}</button>
                  <button
                    onClick={handleGenerateBriefFromSelection}
                    disabled={selectedIds.size === 0 || generatingBrief}
                    className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-lg disabled:opacity-30"
                  >{generatingBrief ? "生成中..." : "生成推进卡"}</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Right Column (Inspector) ---- */}
        {showInspector && (
          <div className="w-[400px] shrink-0 bg-stone-50/50 border-l border-stone-200/60 overflow-y-auto">
            {/* Multi-select summary panel */}
            {selectMode && selectedIds.size > 0 && selectionSummary && (
              <SelectionSummaryPanel
                summary={selectionSummary}
                onBatchTopic={() => setShowTopicInput(true)}
                onBatchArchive={handleBatchArchive}
                onGenerateSummary={handleGenerateSummary}
                onGenerateBrief={handleGenerateBriefFromSelection}
                synthesizing={synthesizing}
                generatingBrief={generatingBrief}
              />
            )}

            {/* Single item inspector */}
            {(!selectMode || selectedIds.size === 0) && (
              <>
                {!selectedItem && <InspectorEmptyState />}
                {selectedItem && selectedType === "record" && (
                  <RecordInspector
                    record={selectedItem as ThoughtRecord}
                    onClose={() => { setSelectedItem(null); setSelectedType(null); }}
                    onNavigate={(path) => navigate(path)}
                    onReorganize={handleReorganize}
                    aiActiveProfile={aiActiveProfile}
                    generateBriefFromRecordData={generateBriefFromRecordData}
                    onArchive={handleBatchArchive}
                  />
                )}
                {selectedItem && selectedType === "synthesis" && (
                  <SynthesisInspector
                    synthesis={selectedItem as Synthesis}
                    onClose={() => { setSelectedItem(null); setSelectedType(null); }}
                    onNavigate={(path) => navigate(path)}
                  />
                )}
                {selectedItem && selectedType === "brief" && (
                  <BriefInspector
                    brief={selectedItem as ProjectBrief}
                    onClose={() => { setSelectedItem(null); setSelectedType(null); }}
                    onNavigate={(path) => navigate(path)}
                    onToggleAction={handleToggleBriefAction}
                    onAddAction={handleAddBriefAction}
                    onDeleteAction={handleDeleteBriefAction}
                  />
                )}
                {selectedItem && selectedType === "topic" && (
                  <TopicInspector
                    topicName={selectedItem as string}
                    records={records}
                    syntheses={syntheses}
                    briefs={briefs}
                    onClose={() => { setSelectedItem(null); setSelectedType(null); }}
                    onClickRecord={(r) => { setSelectedItem(r); setSelectedType("record"); }}
                    onNavigate={navigate}
                  />
                )}
              </>
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
  view, setView, filterId, setFilterId, topics, activeTopics, recentTopics,
  syncMeta, syncConfig, syncSession, recordCount, synthesisCount, briefCount,
  onNavigate, onTopicClick,
}: {
  view: WorkspaceView;
  setView: (v: WorkspaceView) => void;
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
  onTopicClick: (name: string) => void;
}) {
  const navItems = [
    { id: "inbox", label: "收件箱", icon: "📥", count: recordCount },
    { id: "topics", label: "主题", icon: "🏷️", count: activeTopics.length },
    { id: "synthesis", label: "汇总", icon: "📊", count: synthesisCount },
    { id: "briefs", label: "推进卡", icon: "🎯", count: briefCount },
    { id: "review", label: "回顾", icon: "📅", count: 0 },
  ];

  return (
    <div className="w-[260px] shrink-0 bg-white border-r border-stone-200/60 flex flex-col overflow-hidden">
      {/* Brand area */}
      <div className="px-5 py-4 border-b border-stone-100">
        <h1 className="text-sm font-semibold text-stone-800">工作台</h1>
        <p className="text-[11px] text-stone-400 mt-0.5">整理 · 回顾 · 推进</p>
      </div>

      {/* Navigation */}
      <div className="px-3 py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as WorkspaceView)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
              view === item.id
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-xs">{item.icon}</span>
              <span>{item.label}</span>
            </span>
            <span className={`text-xs ${view === item.id ? "text-stone-400" : "text-stone-300"}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {/* Smart Filters */}
      {view === "inbox" && (
        <div className="px-5 py-3 border-t border-stone-100">
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

      {/* Recent Active Topics */}
      {view === "inbox" && topics.length > 0 && (
        <div className="px-5 py-3 border-t border-stone-100">
          <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-2">活跃主题</p>
          <div className="space-y-0.5">
            {topics.slice(0, 6).map((t) => (
              <button
                key={t.name}
                onClick={() => onTopicClick(t.name)}
                className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-stone-500 hover:bg-stone-50 hover:text-stone-700 transition-colors flex items-center justify-between"
              >
                <span className="truncate">{t.name}</span>
                <span className="text-stone-300 text-[10px] ml-2">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sync Status */}
      <div className="mt-auto px-5 py-3 border-t border-stone-100">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${syncSession ? "bg-emerald-400" : "bg-stone-300"}`} />
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
  records, selectedIds, selectMode, onToggleSelect, onClickItem, onDoubleClickItem, selectedItemId,
}: {
  records: ThoughtRecord[];
  selectedIds: Set<string>;
  selectMode: boolean;
  onToggleSelect: (id: string) => void;
  onClickItem: (r: ThoughtRecord) => void;
  onDoubleClickItem: (r: ThoughtRecord) => void;
  selectedItemId?: string;
}) {
  return (
    <div className="divide-y divide-stone-50">
      {records.map((record) => {
        const isActive = selectedItemId === record.id;
        return (
          <div
            key={record.id}
            onClick={() => onClickItem(record)}
            onDoubleClick={() => onDoubleClickItem(record)}
            className={`px-4 py-3 cursor-pointer transition-colors ${
              isActive ? "bg-stone-100/80 border-l-2 border-l-stone-900" :
              selectedIds.has(record.id) ? "bg-stone-50/80" :
              "hover:bg-stone-50/60"
            }`}
          >
            <div className="flex items-start gap-3">
              {selectMode && (
                <div
                  onClick={(e) => { e.stopPropagation(); onToggleSelect(record.id); }}
                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                    selectedIds.has(record.id) ? "bg-stone-900 border-stone-900" : "border-stone-300 bg-white"
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
                {/* Status tags */}
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(record.type)}`}>
                    {record.aiSubType ? `${record.type} · ${record.aiSubType}` : record.type}
                  </span>
                  {record.promoteLevel && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPromoteLevelColor(record.promoteLevel)}`}>
                      {getPromoteLabel(record.promoteLevel)}
                    </span>
                  )}
                  {record.userEdited && <span className="text-[10px] text-stone-400">已编辑</span>}
                  {record.feedbackStatus && record.feedbackStatus !== "未反馈" && <span className="text-[10px] text-blue-400">已反馈</span>}
                  {record.organizeSource === "mock" && <span className="text-[10px] text-stone-300">本地</span>}
                  {record.organizeSource === "ai" && <span className="text-[10px] text-indigo-400">AI</span>}
                </div>
                {/* Title */}
                <h3 className={`text-sm font-medium truncate ${isActive ? "text-stone-900" : "text-stone-800"}`}>
                  {record.aiTitle}
                </h3>
                {/* Preview */}
                <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{record.rawText}</p>
                {/* Tags + Topic + Time */}
                <div className="flex items-center gap-2 mt-1.5">
                  {record.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                  {record.topic && <span className="text-[10px] text-stone-400">· {record.topic}</span>}
                  <span className="text-[10px] text-stone-300 ml-auto">{formatRelativeTime(record.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {records.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-stone-400">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-stone-300">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p className="text-sm">暂无记录</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Topic List Panel (two-sub-column)
   ============================================================ */

function TopicListPanel({
  records, activeTopics, onClickTopic, onClickRecord, selectedTopicName, onNavigate,
}: {
  records: ThoughtRecord[];
  activeTopics: string[];
  onClickTopic: (name: string) => void;
  onClickRecord: (r: ThoughtRecord) => void;
  selectedTopicName?: string;
  onNavigate: (path: string) => void;
}) {
  const [internalTopic, setInternalTopic] = useState<string | null>(null);
  const selectedTopic = selectedTopicName || internalTopic;

  const topicRecords = useMemo(() => {
    if (!selectedTopic) return [];
    return records.filter((r) => r.topic === selectedTopic && !r.archived);
  }, [records, selectedTopic]);

  const topicData = useMemo(() => {
    return activeTopics.map((topic) => {
      const topicRecs = records.filter((r) => r.topic === topic && !r.archived);
      return {
        name: topic,
        count: topicRecs.length,
        lastRecord: topicRecs[0]?.aiTitle || "—",
        updatedAt: topicRecs[0]?.updatedAt || "",
      };
    });
  }, [records, activeTopics]);

  return (
    <div className="flex h-full">
      {/* Topic list */}
      <div className="w-[220px] shrink-0 border-r border-stone-100 overflow-y-auto">
        <div className="p-3">
          <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-2">所有主题</p>
          <div className="space-y-0.5">
            {topicData.map((t) => (
              <button
                key={t.name}
                onClick={() => { setInternalTopic(t.name); onClickTopic(t.name); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  selectedTopic === t.name
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{t.name}</span>
                  <span className={`text-xs ${selectedTopic === t.name ? "text-stone-400" : "text-stone-300"}`}>
                    {t.count}
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 truncate ${selectedTopic === t.name ? "text-stone-400" : "text-stone-400"}`}>
                  {t.lastRecord}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Records for topic */}
      <div className="flex-1 overflow-y-auto">
        {selectedTopic ? (
          <div className="divide-y divide-stone-50">
            {topicRecords.map((r) => (
              <div
                key={r.id}
                onClick={() => onClickRecord(r)}
                className="px-4 py-3 cursor-pointer hover:bg-stone-50/80 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(r.type)}`}>
                    {r.aiSubType ? `${r.type} · ${r.aiSubType}` : r.type}
                  </span>
                  {r.promoteLevel && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPromoteLevelColor(r.promoteLevel)}`}>
                      {getPromoteLabel(r.promoteLevel)}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-medium text-stone-800">{r.aiTitle}</h3>
                <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{r.rawText}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-stone-300">{formatRelativeTime(r.updatedAt)}</span>
                </div>
              </div>
            ))}
            {topicRecords.length === 0 && (
              <div className="py-16 text-center text-stone-400 text-sm">该主题下暂无记录</div>
            )}
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
   Synthesis List
   ============================================================ */

function SynthesisList({
  syntheses, onClickItem, selectedItemId,
}: {
  syntheses: Synthesis[];
  onClickItem: (s: Synthesis) => void;
  selectedItemId?: string;
}) {
  const items = [...syntheses].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="divide-y divide-stone-50">
      {items.map((s) => {
        const isActive = selectedItemId === s.id;
        return (
          <div
            key={s.id}
            onClick={() => onClickItem(s)}
            className={`px-4 py-3 cursor-pointer transition-colors ${
              isActive ? "bg-stone-100/80 border-l-2 border-l-stone-900" : "hover:bg-stone-50/60"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-stone-50 text-stone-500 border-stone-200">
                {s.mode === "weekly_review" ? "周回顾" : "内容汇总"}
              </span>
              <span className="text-[10px] text-stone-400">{s.source === "ai" ? "AI" : "本地"}</span>
            </div>
            <h3 className="text-sm font-medium text-stone-800">{s.title}</h3>
            <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{s.oneLineSummary}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {s.keyThemes?.slice(0, 2).map((t) => (
                <span key={t} className="text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded">{t}</span>
              ))}
              <span className="text-[10px] text-stone-300 ml-auto">
                {s.sourceRecordIds.length} 条来源 · {formatRelativeTime(s.updatedAt)}
              </span>
            </div>
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-stone-400">
          <p className="text-sm">暂无汇总</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Brief List
   ============================================================ */

function BriefList({
  briefs, onClickItem, selectedItemId,
}: {
  briefs: ProjectBrief[];
  onClickItem: (b: ProjectBrief) => void;
  selectedItemId?: string;
}) {
  const items = [...briefs]
    .filter((b) => b.status !== "已归档")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="divide-y divide-stone-50">
      {items.map((b) => {
        const completed = b.nextActions.filter((a) => a.done).length;
        const total = b.nextActions.length;
        const isActive = selectedItemId === b.id;
        return (
          <div
            key={b.id}
            onClick={() => onClickItem(b)}
            className={`px-4 py-3 cursor-pointer transition-colors ${
              isActive ? "bg-stone-100/80 border-l-2 border-l-stone-900" : "hover:bg-stone-50/60"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                b.status === "进行中" ? "bg-blue-50 text-blue-700 border-blue-200" :
                b.status === "已完成" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                b.status === "暂停" ? "bg-amber-50 text-amber-700 border-amber-200" :
                "bg-stone-50 text-stone-500 border-stone-200"
              }`}>{b.status}</span>
              {b.topic && <span className="text-[10px] text-stone-400">{b.topic}</span>}
              <span className="text-[10px] text-stone-300">{b.sourceType === "record" ? "来自记录" : "来自汇总"}</span>
            </div>
            <h3 className="text-sm font-medium text-stone-800">{b.title}</h3>
            <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{b.summary}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {/* Progress bar */}
              {total > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{ width: `${(completed / total) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-stone-400">{completed}/{total}</span>
                </div>
              )}
              <span className="text-[10px] text-stone-300 ml-auto">{formatRelativeTime(b.updatedAt)}</span>
            </div>
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-stone-400">
          <p className="text-sm">暂无推进卡</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Review Panel
   ============================================================ */

function ReviewPanel({
  currentWeekSynthesis, weeklyHistory, records, onClickSynthesis, onNavigate,
}: {
  currentWeekSynthesis?: Synthesis;
  weeklyHistory: Synthesis[];
  records: ThoughtRecord[];
  onClickSynthesis: (s: Synthesis) => void;
  onNavigate: (path: string) => void;
}) {
  const thisWeekCount = records.filter((r) => isThisWeek(r.createdAt) && !r.archived).length;
  const pushCount = records.filter((r) => (r.promoteLevel === "建议行动" || r.promoteLevel === "建议立项") && !r.archived).length;
  const topTopic = useMemo(() => {
    const map = new Map<string, number>();
    records.filter((r) => !r.archived).forEach((r) => {
      if (r.topic) map.set(r.topic, (map.get(r.topic) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  }, [records]);

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
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

      {/* Current week */}
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
              onClick={(e) => { e.stopPropagation(); onNavigate(`/synthesis/${currentWeekSynthesis.id}`); }}
              className="text-xs px-3 py-1.5 bg-stone-900 text-white rounded-lg"
            >查看详情</button>
          </div>
        </div>
      ) : (
        <div className="bg-stone-50 rounded-xl p-4 border border-stone-100 text-center">
          <p className="text-sm text-stone-500">本周回顾尚未生成</p>
          <button onClick={() => onNavigate("/review")} className="mt-2 text-xs text-stone-500 hover:text-stone-800">
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
   Inspector Empty State
   ============================================================ */

function InspectorEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-stone-600 mb-1">选择一项开始整理</h3>
      <p className="text-xs text-stone-400 leading-relaxed">
        在中栏选择一条记录、一个主题、一份汇总或一张推进卡<br />
        右侧会在这里显示预览和可执行操作
      </p>
    </div>
  );
}

/* ============================================================
   Selection Summary Panel (multi-select right panel)
   ============================================================ */

function SelectionSummaryPanel({
  summary, onBatchTopic, onBatchArchive, onGenerateSummary, onGenerateBrief,
  synthesizing, generatingBrief,
}: {
  summary: {
    count: number;
    topics: [string, number][];
    types: [string, number][];
    promotes: [string, number][];
  };
  onBatchTopic: () => void;
  onBatchArchive: () => void;
  onGenerateSummary: () => void;
  onGenerateBrief: () => void;
  synthesizing: boolean;
  generatingBrief: boolean;
}) {
  return (
    <div className="p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-stone-800">已选择 {summary.count} 条</h3>
        <p className="text-[11px] text-stone-400 mt-0.5">选择摘要面板</p>
      </div>

      {/* Topic distribution */}
      {summary.topics.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-2">主题分布</p>
          <div className="space-y-1">
            {summary.topics.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="text-stone-600 truncate">{name}</span>
                <span className="text-stone-400">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Type distribution */}
      {summary.types.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-2">类型分布</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.types.map(([name, count]) => (
              <span key={name} className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                {name} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Promote distribution */}
      {summary.promotes.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-2">推进等级</p>
          <div className="space-y-1">
            {summary.promotes.map(([name, count]) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      name === "建议立项" ? "bg-blue-400" :
                      name === "建议行动" ? "bg-emerald-400" :
                      name === "建议观察" ? "bg-amber-400" : "bg-stone-300"
                    }`}
                    style={{ width: `${(count / summary.count) * 100}%` }}
                  />
                </div>
                <span className="text-stone-500 w-14 text-right">{name}</span>
                <span className="text-stone-400 w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="pt-3 border-t border-stone-100 space-y-2">
        <button onClick={onBatchTopic} className="w-full py-2 text-xs bg-white border border-stone-200/60 text-stone-700 rounded-lg hover:border-stone-300 transition-colors">
          批量设主题
        </button>
        <button onClick={onBatchArchive} className="w-full py-2 text-xs bg-white border border-stone-200/60 text-stone-700 rounded-lg hover:border-stone-300 transition-colors">
          归档
        </button>
        <button onClick={onGenerateSummary} disabled={summary.count < 2 || synthesizing} className="w-full py-2 text-xs bg-stone-900 text-white rounded-lg disabled:opacity-30 transition-colors">
          {synthesizing ? "生成中..." : "生成汇总"}
        </button>
        <button onClick={onGenerateBrief} disabled={summary.count === 0 || generatingBrief} className="w-full py-2 text-xs bg-emerald-700 text-white rounded-lg disabled:opacity-30 transition-colors">
          {generatingBrief ? "生成中..." : "生成推进卡"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Record Inspector
   ============================================================ */

function RecordInspector({
  record, onClose, onNavigate, onReorganize, aiActiveProfile,
  generateBriefFromRecordData, onArchive,
}: {
  record: ThoughtRecord;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onReorganize: (r: ThoughtRecord) => void;
  aiActiveProfile: any;
  generateBriefFromRecordData: (id: string) => Promise<ProjectBrief | null>;
  onArchive: () => void;
}) {
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState(false);

  const handleGenerateBrief = async () => {
    setGeneratingBrief(true);
    await generateBriefFromRecordData(record.id);
    setGeneratingBrief(false);
  };

  return (
    <div className="p-5 space-y-5">
      {/* Header tags + close */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(record.type)}`}>
            {record.aiSubType ? `${record.type} · ${record.aiSubType}` : record.type}
          </span>
          {record.promoteLevel && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPromoteLevelColor(record.promoteLevel)}`}>
              {getPromoteLabel(record.promoteLevel)}
            </span>
          )}
          {record.userEdited && <span className="text-[10px] text-amber-500">已编辑</span>}
          {record.feedbackStatus && record.feedbackStatus !== "未反馈" && <span className="text-[10px] text-blue-400">已反馈</span>}
          {record.preferenceApplied && <span className="text-[10px] text-emerald-500">已记住偏好</span>}
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Title */}
      <h2 className="text-base font-semibold text-stone-800 leading-snug">{record.aiTitle}</h2>

      {/* Source + meta */}
      <div className="flex items-center gap-2 text-[11px] text-stone-400">
        <span>{record.aiStatus === "done" ? (record.organizeSource === "ai" ? "AI 整理" : "本地整理") : "整理中"}</span>
        {record.aiProfileName && <span>· {record.aiProfileName}</span>}
        {record.aiModel && <span className="text-stone-300">· {record.aiModel}</span>}
      </div>

      {/* Topic */}
      {record.topic && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-stone-400">主题</span>
          <span className="text-xs text-stone-700 bg-stone-50 px-2 py-0.5 rounded-md border border-stone-100">{record.topic}</span>
        </div>
      )}

      {/* Raw text */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-medium text-stone-400">原始记录</p>
          {record.rawText.length > 200 && (
            <button onClick={() => setExpandedRaw(!expandedRaw)} className="text-[10px] text-stone-400 hover:text-stone-600">
              {expandedRaw ? "收起" : "展开"}
            </button>
          )}
        </div>
        <div className={`text-xs text-stone-600 bg-stone-50 rounded-lg p-3 border border-stone-100 leading-relaxed whitespace-pre-wrap ${!expandedRaw ? "line-clamp-5" : ""}`}>
          {record.rawText}
        </div>
        <div className="text-[10px] text-stone-300 mt-1.5">
          创建于 {formatRelativeTime(record.createdAt)} · 更新于 {formatRelativeTime(record.updatedAt)}
        </div>
      </div>

      {/* AI Summary */}
      {record.aiSummary && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">摘要</p>
          <p className="text-xs text-stone-600 leading-relaxed">{record.aiSummary}</p>
        </div>
      )}

      {/* Tags */}
      {record.tags.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">标签</p>
          <div className="flex flex-wrap gap-1.5">
            {record.tags.map((tag) => (
              <span key={tag} className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200/60 px-2 py-0.5 rounded-md">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {record.suggestions && record.suggestions.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">下一步建议</p>
          <ul className="space-y-1.5">
            {record.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-stone-600 flex items-start gap-2 bg-stone-50 rounded-md px-2.5 py-2">
                <span className="text-stone-300 mt-0.5 shrink-0">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Adopted suggestions */}
      {record.adoptedSuggestions && record.adoptedSuggestions.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">已采纳的建议</p>
          <ul className="space-y-1">
            {record.adoptedSuggestions.map((s, i) => (
              <li key={i} className="text-xs text-stone-500 flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 ${s.as === "todo" ? "text-amber-400" : "text-emerald-400"}`}>
                  {s.as === "todo" ? "✓" : "→"}
                </span>
                <span>{s.content}</span>
                <span className="text-[10px] text-stone-300 ml-auto">{s.as === "todo" ? "待办" : "推进卡"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="pt-4 border-t border-stone-100 space-y-2">
        <button
          onClick={() => onNavigate(`/record/${record.id}`)}
          className="w-full py-2 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >
          打开完整详情页 →
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onNavigate(`/record/${record.id}?edit=1`)}
            className="py-2 text-xs bg-white border border-stone-200/60 text-stone-700 rounded-lg hover:border-stone-300 transition-colors"
          >编辑整理结果</button>
          <button
            onClick={() => onReorganize(record)}
            className="py-2 text-xs bg-white border border-stone-200/60 text-stone-700 rounded-lg hover:border-stone-300 transition-colors"
          >重新整理</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleGenerateBrief}
            disabled={generatingBrief}
            className="py-2 text-xs bg-white border border-stone-200/60 text-stone-700 rounded-lg hover:border-stone-300 disabled:opacity-30 transition-colors"
          >{generatingBrief ? "生成中..." : "生成推进卡"}</button>
          <button
            onClick={() => {
              // Archive single record
              onArchive();
            }}
            className="py-2 text-xs bg-white border border-stone-200/60 text-stone-500 rounded-lg hover:border-stone-300 transition-colors"
          >归档</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Synthesis Inspector
   ============================================================ */

function SynthesisInspector({
  synthesis, onClose, onNavigate,
}: {
  synthesis: Synthesis;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-stone-50 text-stone-500 border-stone-200">
            {synthesis.mode === "weekly_review" ? "周回顾" : "内容汇总"}
          </span>
          <span className="text-[10px] text-stone-400">{synthesis.source === "ai" ? "AI" : "本地"}</span>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <h2 className="text-base font-semibold text-stone-800 leading-snug">{synthesis.title}</h2>

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
              <span key={t} className="text-[10px] text-stone-500 bg-stone-50 border border-stone-200/60 px-2 py-0.5 rounded-md">{t}</span>
            ))}
          </div>
        </div>
      )}

      {synthesis.repeatedPatterns && synthesis.repeatedPatterns.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">反复出现的模式</p>
          <ul className="space-y-1">
            {synthesis.repeatedPatterns.map((p, i) => (
              <li key={i} className="text-xs text-stone-600 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 shrink-0">·</span>{p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {synthesis.openQuestions && synthesis.openQuestions.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">待观察问题</p>
          <ul className="space-y-1">
            {synthesis.openQuestions.map((q, i) => (
              <li key={i} className="text-xs text-stone-600 flex items-start gap-2">
                <span className="text-rose-400 mt-0.5 shrink-0">?</span>{q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {synthesis.opportunities && synthesis.opportunities.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">值得推进的机会</p>
          <ul className="space-y-1">
            {synthesis.opportunities.map((o, i) => (
              <li key={i} className="text-xs text-stone-600 flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5 shrink-0">·</span>{o}
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
                <span className="text-blue-400 mt-0.5 shrink-0">·</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="pt-4 border-t border-stone-100 space-y-2">
        <button
          onClick={() => onNavigate(`/synthesis/${synthesis.id}`)}
          className="w-full py-2 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >打开完整详情页 →</button>
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
  brief, onClose, onNavigate, onToggleAction, onAddAction, onDeleteAction,
}: {
  brief: ProjectBrief;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onToggleAction: (briefId: string, actionId: string) => void;
  onAddAction: (briefId: string, content: string) => void;
  onDeleteAction: (briefId: string, actionId: string) => void;
}) {
  const completed = brief.nextActions.filter((a) => a.done).length;
  const total = brief.nextActions.length;
  const [newActionText, setNewActionText] = useState("");

  const handleAddAction = () => {
    if (!newActionText.trim()) return;
    onAddAction(brief.id, newActionText.trim());
    setNewActionText("");
  };

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
            brief.status === "进行中" ? "bg-blue-50 text-blue-700 border-blue-200" :
            brief.status === "已完成" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            brief.status === "暂停" ? "bg-amber-50 text-amber-700 border-amber-200" :
            "bg-stone-50 text-stone-500 border-stone-200"
          }`}>{brief.status}</span>
          {brief.topic && <span className="text-[10px] text-stone-400">{brief.topic}</span>}
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <h2 className="text-base font-semibold text-stone-800 leading-snug">{brief.title}</h2>

      {/* Progress */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-stone-400">进度</p>
            <span className="text-[11px] text-stone-500">{completed} / {total}</span>
          </div>
          <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${(completed / total) * 100}%` }} />
          </div>
        </div>
      )}

      {brief.summary && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">摘要</p>
          <p className="text-xs text-stone-600 leading-relaxed">{brief.summary}</p>
        </div>
      )}

      {brief.objective && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">目标</p>
          <p className="text-xs text-stone-600 leading-relaxed">{brief.objective}</p>
        </div>
      )}

      {brief.scopeNow && brief.scopeNow.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">当前先做</p>
          <ul className="space-y-1">
            {brief.scopeNow.map((s, i) => (
              <li key={i} className="text-xs text-stone-600 flex items-start gap-2">
                <span className="text-blue-400 mt-0.5 shrink-0">·</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action items - interactive */}
      {brief.nextActions.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-2">行动清单</p>
          <div className="space-y-1.5">
            {brief.nextActions.map((item) => (
              <div key={item.id} className="flex items-start gap-2 text-xs group">
                <button
                  onClick={() => onToggleAction(brief.id, item.id)}
                  className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    item.done ? "bg-emerald-500 border-emerald-500" : "border-stone-300 bg-white hover:border-stone-400"
                  }`}
                >
                  {item.done && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <span className={`flex-1 ${item.done ? "text-stone-400 line-through" : "text-stone-700"}`}>
                  {item.content}
                </span>
                <button
                  onClick={() => onDeleteAction(brief.id, item.id)}
                  className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-rose-400 transition-opacity shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add action */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newActionText}
          onChange={(e) => setNewActionText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddAction(); }}
          placeholder="新增一条行动..."
          className="flex-1 text-xs px-3 py-2 bg-white border border-stone-200/60 rounded-lg focus:outline-none focus:border-stone-400"
        />
        <button
          onClick={handleAddAction}
          disabled={!newActionText.trim()}
          className="px-3 py-2 text-xs bg-stone-900 text-white rounded-lg disabled:opacity-30"
        >添加</button>
      </div>

      {/* Source */}
      {brief.sourceSummary && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-1.5">来源内容</p>
          <p className="text-xs text-stone-500 leading-relaxed line-clamp-3">{brief.sourceSummary}</p>
        </div>
      )}

      {/* Actions */}
      <div className="pt-4 border-t border-stone-100 space-y-2">
        <button
          onClick={() => onNavigate(`/brief/${brief.id}`)}
          className="w-full py-2 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >打开完整详情页 →</button>
      </div>

      <div className="text-[10px] text-stone-300">
        <p>创建于 {new Date(brief.createdAt).toLocaleString("zh-CN")}</p>
        <p>更新于 {new Date(brief.updatedAt).toLocaleString("zh-CN")}</p>
      </div>
    </div>
  );
}

/* ============================================================
   Topic Inspector
   ============================================================ */

function TopicInspector({
  topicName, records, syntheses, briefs, onClose, onClickRecord, onNavigate,
}: {
  topicName: string;
  records: ThoughtRecord[];
  syntheses: Synthesis[];
  briefs: ProjectBrief[];
  onClose: () => void;
  onClickRecord: (r: ThoughtRecord) => void;
  onNavigate: (path: string) => void;
}) {
  const topicRecords = useMemo(() =>
    records.filter((r) => r.topic === topicName && !r.archived),
    [records, topicName]
  );
  const topicBriefs = useMemo(() =>
    briefs.filter((b) => b.topic === topicName && b.status !== "已归档"),
    [briefs, topicName]
  );
  const topicSyntheses = useMemo(() =>
    syntheses.filter((s) => s.sourceTopic === topicName),
    [syntheses, topicName]
  );
  const mostCommonType = useMemo(() => {
    const map = new Map<string, number>();
    topicRecords.forEach((r) => map.set(r.type, (map.get(r.type) || 0) + 1));
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || "—";
  }, [topicRecords]);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-stone-800">{topicName}</h2>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
          <p className="text-[10px] text-stone-400">记录数</p>
          <p className="text-sm font-semibold text-stone-800">{topicRecords.length}</p>
        </div>
        <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
          <p className="text-[10px] text-stone-400">最常见类型</p>
          <p className="text-sm font-semibold text-stone-800">{mostCommonType}</p>
        </div>
        <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
          <p className="text-[10px] text-stone-400">相关汇总</p>
          <p className="text-sm font-semibold text-stone-800">{topicSyntheses.length}</p>
        </div>
        <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
          <p className="text-[10px] text-stone-400">相关推进卡</p>
          <p className="text-sm font-semibold text-stone-800">{topicBriefs.length}</p>
        </div>
      </div>

      {/* Recent records */}
      {topicRecords.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-stone-400 mb-2">最近 3 条记录</p>
          <div className="space-y-2">
            {topicRecords.slice(0, 3).map((r) => (
              <div
                key={r.id}
                onClick={() => onClickRecord(r)}
                className="bg-white rounded-lg p-3 border border-stone-100 cursor-pointer hover:border-stone-200 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(r.type)}`}>{r.type}</span>
                </div>
                <h4 className="text-xs font-medium text-stone-700">{r.aiTitle}</h4>
                <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">{r.rawText}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="pt-4 border-t border-stone-100 space-y-2">
        <button
          onClick={() => onNavigate(`/topics/${encodeURIComponent(topicName)}`)}
          className="w-full py-2 text-xs bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >打开该主题 →</button>
      </div>
    </div>
  );
}
