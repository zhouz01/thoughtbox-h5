import { useMemo, useState } from "react";
import { useApp } from "../context";
import { useNavigate } from "react-router-dom";
import { PROMOTE_COLORS, PROMOTE_DOT, TYPE_COLORS } from "../types";
import { WorkspaceLink } from "../components/WorkspaceLink";

export default function ReviewPage() {
  const { records, generateWeeklyReview, getCurrentWeeklySynthesis, getWeeklySyntheses, generateBriefFromRecordData, generateBriefFromSynthesisData, briefs } = useApp();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [generatingBriefId, setGeneratingBriefId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const activeRecords = useMemo(
    () => records.filter((r) => !r.archived && r.aiStatus === "done"),
    [records]
  );

  // 本周记录（当前自然周：周一到周日）
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const weekRecords = activeRecords.filter(
    (r) => {
      const d = new Date(r.createdAt);
      return d >= monday && d <= sunday;
    }
  );

  // 当前周回顾
  const currentWeeklySynthesis = getCurrentWeeklySynthesis();

  // 历史周回顾（排除本周）
  const weeklySyntheses = getWeeklySyntheses().filter(
    (s) => !currentWeeklySynthesis || s.id !== currentWeeklySynthesis.id
  );

  // 本周最常见类型
  const weekTypeStats = new Map<string, number>();
  weekRecords.forEach((r) => {
    weekTypeStats.set(r.type, (weekTypeStats.get(r.type) || 0) + 1);
  });
  const topWeekType = Array.from(weekTypeStats.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];

  // 本周最活跃主题
  const weekTopicStats = new Map<string, number>();
  weekRecords.forEach((r) => {
    const topic = r.topic || "未分类主题";
    weekTopicStats.set(topic, (weekTopicStats.get(topic) || 0) + 1);
  });
  const topWeekTopics = Array.from(weekTopicStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // 值得推进的记录（优先本周，再补全局）
  const weekActionable = weekRecords
    .filter((r) => r.promoteLevel === "建议行动" || r.promoteLevel === "建议立项")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const globalActionable = activeRecords
    .filter((r) => (r.promoteLevel === "建议行动" || r.promoteLevel === "建议立项") && !weekActionable.find((wa) => wa.id === r.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const actionable = [...weekActionable, ...globalActionable].slice(0, 5);

  // 值得推进数量
  const actionableCount = activeRecords.filter(
    (r) => r.promoteLevel === "建议行动" || r.promoteLevel === "建议立项"
  ).length;

  // 最近活跃主题（扩展为 6 个，含全局）
  const globalTopicStats = new Map<string, number>();
  activeRecords.forEach((r) => {
    const topic = r.topic || "未分类主题";
    globalTopicStats.set(topic, (globalTopicStats.get(topic) || 0) + 1);
  });
  const recentActiveTopics = Array.from(globalTopicStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => ({ topic, count }));

  // 生成本周回顾
  const handleGenerateWeekly = async () => {
    setGenerating(true);
    try {
      const result = await generateWeeklyReview();
      if (result) {
        navigate(`/synthesis/${result.id}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  // 从值得推进的记录生成 Brief
  const handleGenerateBrief = async (recordId: string) => {
    setGeneratingBriefId(recordId);
    try {
      const brief = await generateBriefFromRecordData(recordId);
      if (brief) {
        navigate(`/brief/${brief.id}`);
      }
    } finally {
      setGeneratingBriefId(null);
    }
  };

  // 基于本周回顾生成 Brief
  const handleGenerateBriefFromWeekly = async () => {
    if (!currentWeeklySynthesis) return;
    setGeneratingBriefId("weekly");
    try {
      const brief = await generateBriefFromSynthesisData(currentWeeklySynthesis.id);
      if (brief) {
        navigate(`/brief/${brief.id}`);
      }
    } finally {
      setGeneratingBriefId(null);
    }
  };

  return (
    <div className="px-5 pt-5 pb-4">
      {/* ====== 1. 顶部标题区 ====== */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-stone-900 tracking-tight">
            回顾
          </h1>
          <p className="text-[13px] text-stone-400 mt-0.5">看看最近自己在想什么</p>
        </div>
        <div className="flex items-center gap-2">
          <WorkspaceLink view="review" label="在工作台继续整理" />
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
      </div>

      {/* 更多菜单 */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="absolute right-5 top-[72px] z-40 w-52 bg-white rounded-2xl shadow-lg border border-stone-200/60 py-1.5 animate-fade-in overflow-hidden">
            <MenuButton onClick={() => { handleGenerateWeekly(); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              生成本周回顾
            </MenuButton>
            <MenuButton onClick={() => { navigate("/briefs"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              查看全部推进卡
            </MenuButton>
            <div className="my-1.5 border-t border-stone-100" />
            <MenuButton onClick={() => { navigate("/settings/sync"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M18 10h-1.26A8 8 0 1 1 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              数据同步
            </MenuButton>
          </div>
        </>
      )}

      {/* ====== 2. 本周概览（2x2 卡片） ====== */}
      <section className="mb-5 animate-fade-in" style={{ animationDelay: "40ms" }}>
        <div className="grid grid-cols-2 gap-2.5">
          <OverviewCard
            value={String(weekRecords.length)}
            label="本周新增记录"
            accent="text-stone-900"
          />
          <OverviewCard
            value={topWeekTopics.length > 0 ? topWeekTopics[0][0] : "—"}
            label="最活跃主题"
            accent="text-amber-600"
          />
          <OverviewCard
            value={topWeekType ? topWeekType[0] : "—"}
            label="最常见类型"
            accent="text-indigo-600"
          />
          <OverviewCard
            value={String(actionableCount)}
            label="值得推进"
            accent="text-emerald-600"
          />
        </div>
      </section>

      {/* ====== 3. 本周回顾模块 ====== */}
      <section className="mb-5 animate-fade-in" style={{ animationDelay: "60ms" }}>
        <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
          本周回顾
        </h2>
        {currentWeeklySynthesis ? (
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
            <h3 className="text-[14px] font-semibold text-stone-800 mb-1">
              {currentWeeklySynthesis.title}
            </h3>
            <p className="text-[12px] text-stone-500 leading-[1.6] mb-3 line-clamp-2">
              {currentWeeklySynthesis.overview}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigate(`/synthesis/${currentWeeklySynthesis.id}`)}
                className="px-4 py-1.5 bg-stone-900 text-white rounded-lg text-[12px] font-medium active:bg-stone-800"
              >
                查看详情
              </button>
              <button
                onClick={handleGenerateBriefFromWeekly}
                disabled={generatingBriefId === "weekly"}
                className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-[12px] font-medium active:bg-emerald-700 disabled:opacity-50"
              >
                {generatingBriefId === "weekly" ? "生成中..." : "生成 Brief"}
              </button>
              <button
                onClick={handleGenerateWeekly}
                disabled={generating}
                className="px-4 py-1.5 bg-white text-stone-600 rounded-lg text-[12px] font-medium border border-stone-200/80 active:bg-stone-50 disabled:opacity-50"
              >
                {generating ? "生成中..." : "重新生成"}
              </button>
            </div>
          </div>
        ) : weekRecords.length >= 3 ? (
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
            <p className="text-[13px] text-stone-500 mb-1">本周还没有生成回顾</p>
            <p className="text-[12px] text-stone-400 mb-3">用一份回顾，把这周的想法收拢起来</p>
            <button
              onClick={handleGenerateWeekly}
              disabled={generating}
              className="px-4 py-2 bg-stone-900 text-white rounded-xl text-[13px] font-medium active:bg-stone-800 disabled:opacity-50"
            >
              {generating ? "生成中..." : "生成本周回顾"}
            </button>
          </div>
        ) : weekRecords.length > 0 ? (
          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/50">
            <p className="text-[13px] text-stone-500 mb-1">本周还没有足够内容可回顾</p>
            <p className="text-[12px] text-stone-400">先记下几条想法，稍后再回来整理</p>
          </div>
        ) : (
          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/50">
            <p className="text-[13px] text-stone-400">本周暂无记录，无法生成回顾</p>
          </div>
        )}
      </section>

      {/* ====== 4. 值得推进 ====== */}
      {actionable.length > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest">
              值得推进
            </h2>
            {briefs.filter((b) => b.status !== "已归档").length > 0 && (
              <button
                onClick={() => navigate("/briefs")}
                className="text-[11px] text-stone-500 font-medium hover:text-stone-700 active:text-stone-600 transition-colors"
              >
                查看全部推进卡 →
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {actionable.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/record/${r.id}`)}
                className="w-full text-left bg-white rounded-2xl p-3.5 border border-stone-200/50 card-press active:bg-stone-50 transition-colors"
              >
                <div className="flex items-start gap-2.5 mb-1.5">
                  <span className={`shrink-0 mt-[5px] w-[6px] h-[6px] rounded-full ${PROMOTE_DOT[r.promoteLevel]}`} />
                  <h3 className="text-[13px] font-semibold text-stone-800 line-clamp-1 flex-1">
                    {r.aiTitle}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pl-3">
                  <span className={`px-1.5 py-[2px] rounded text-[10px] font-medium ${TYPE_COLORS[r.type]}`}>
                    {r.aiSubType ? `${r.type} · ${r.aiSubType}` : r.type}
                  </span>
                  <span className="text-[10px] text-stone-400">
                    {r.topic && r.topic !== "未分类主题" ? r.topic : ""}
                  </span>
                  <span className="ml-auto text-[10px] text-stone-300 font-medium">
                    {r.promoteLevel}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ====== 5. 最近活跃主题 ====== */}
      {recentActiveTopics.length > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "100ms" }}>
          <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
            最近活跃主题
          </h2>
          <div className="flex flex-wrap gap-2">
            {recentActiveTopics.map(({ topic, count }) => (
              <button
                key={topic}
                onClick={() => navigate(`/topics/${encodeURIComponent(topic)}`)}
                className="px-3 py-1.5 bg-white rounded-xl border border-stone-200/50 text-[12px] text-stone-600 font-medium active:bg-stone-50 transition-colors"
              >
                {topic}
                <span className="text-stone-300 ml-1">{count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ====== 6. 历史回顾 ====== */}
      {weeklySyntheses.length > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "120ms" }}>
          <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
            历史回顾
          </h2>
          <div className="flex flex-col gap-2">
            {weeklySyntheses.slice(0, 6).map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/synthesis/${s.id}`)}
                className="w-full text-left bg-white rounded-2xl p-3.5 border border-stone-200/50 card-press active:bg-stone-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-semibold text-stone-800 truncate">
                      {s.title}
                    </h3>
                    <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                      {s.oneLineSummary}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-stone-300 font-medium">
                    {s.weekKey || formatShortTime(s.createdAt)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
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

function formatShortTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days < 1) return "今天";
  if (days < 2) return "昨天";
  if (days < 7) return `${days}天前`;

  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}月${d}日`;
}
