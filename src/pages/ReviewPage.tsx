import { useMemo, useState } from "react";
import { useApp } from "../context";
import { useNavigate } from "react-router-dom";
import { PROMOTE_COLORS, PROMOTE_DOT, TYPE_COLORS } from "../types";

export default function ReviewPage() {
  const { records, generateWeeklyReview, getCurrentWeeklySynthesis, getWeeklySyntheses, generateBriefFromRecordData, generateBriefFromSynthesisData, briefs } = useApp();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [generatingBriefId, setGeneratingBriefId] = useState<string | null>(null);

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

  // 历史周回顾
  const weeklySyntheses = getWeeklySyntheses();

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

  // 值得推进的记录
  const actionable = activeRecords
    .filter(
      (r) =>
        r.promoteLevel === "建议行动" || r.promoteLevel === "建议立项"
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  // 最近 7 天内最常出现的主题
  const recentActiveTopics = topWeekTopics.map(([topic, count]) => ({
    topic,
    count,
  }));

  // 一句话总结
  const summary = useMemo(() => {
    if (activeRecords.length === 0) return "还没有记录，开始记录你的想法吧";

    const parts: string[] = [];

    if (topWeekTopics.length > 0) {
      const topicNames = topWeekTopics
        .slice(0, 2)
        .map(([t]) => t)
        .join(" 和 ");
      parts.push(`你最关注的是${topicNames}`);
    }

    if (actionable.length > 0) {
      parts.push(`有 ${actionable.length} 条记录值得继续推进`);
    }

    if (parts.length === 0) {
      parts.push(`已记录 ${activeRecords.length} 条想法`);
    }

    return parts.join("，");
  }, [activeRecords, topWeekTopics, actionable]);

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
    <div className="px-5 pt-8 pb-4">
      {/* 标题区 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-stone-900 tracking-tight">
            回顾
          </h1>
          <p className="text-[13px] text-stone-400 mt-0.5">回看最近的思考脉络</p>
        </div>
        <button
          onClick={() => navigate("/workspace")}
          className="text-[12px] text-stone-500 hover:text-stone-800 px-3 py-1.5 bg-stone-50 rounded-lg border border-stone-200/60 hover:border-stone-300 transition-colors"
        >
          进入工作台 →
        </button>
      </div>

      {/* 一句话总结 */}
      <div className="bg-stone-900 rounded-2xl p-4 mb-5 animate-fade-in">
        <div className="flex items-start gap-2.5">
          <span className="text-[14px] mt-0.5">💡</span>
          <p className="text-[13px] text-stone-200 leading-[1.7]">{summary}</p>
        </div>
      </div>

      {/* 本周概览 */}
      <section className="mb-5 animate-fade-in" style={{ animationDelay: "40ms" }}>
        <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
          本周概览
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          <OverviewCard
            value={String(weekRecords.length)}
            label="本周记录"
            accent="text-stone-900"
          />
          <OverviewCard
            value={topWeekType ? topWeekType[0] : "—"}
            label="常见类型"
            accent="text-indigo-600"
          />
          <OverviewCard
            value={topWeekTopics.length > 0 ? topWeekTopics[0][0] : "—"}
            label="活跃主题"
            accent="text-amber-600"
          />
        </div>
      </section>

      {/* 本周回顾模块 */}
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
                {generatingBriefId === "weekly" ? "生成中..." : "转为推进卡"}
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
        ) : weekRecords.length > 0 ? (
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
        ) : (
          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/50">
            <p className="text-[13px] text-stone-400">本周暂无记录，无法生成回顾</p>
          </div>
        )}
      </section>

      {/* 值得推进 */}
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
          <div className="bg-white rounded-2xl border border-stone-200/50 overflow-hidden">
            {actionable.map((r, i) => (
              <div
                key={r.id}
                className={`w-full flex items-center gap-3 px-4 py-3 ${
                  i < actionable.length - 1 ? "border-b border-stone-100" : ""
                }`}
              >
                <button
                  onClick={() => navigate(`/record/${r.id}`)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left active:opacity-70 transition-opacity"
                >
                  <span className={`shrink-0 w-[6px] h-[6px] rounded-full ${PROMOTE_DOT[r.promoteLevel]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-stone-800 font-medium truncate">
                      {r.aiTitle}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={`px-1.5 py-[2px] rounded text-[10px] font-medium ${TYPE_COLORS[r.type]}`}
                      >
                        {r.type}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {r.topic}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-[3px] rounded-md text-[10px] font-medium ${PROMOTE_COLORS[r.promoteLevel]}`}
                  >
                    {r.promoteLevel}
                  </span>
                </button>
                <button
                  onClick={() => handleGenerateBrief(r.id)}
                  disabled={generatingBriefId === r.id}
                  className="shrink-0 px-2.5 py-1.5 bg-stone-900 text-white rounded-lg text-[10px] font-medium disabled:opacity-50 active:bg-stone-800 transition-colors"
                >
                  {generatingBriefId === r.id ? "..." : "Brief"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 最近活跃主题 */}
      {recentActiveTopics.length > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "100ms" }}>
          <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
            最近活跃主题
          </h2>
          <div className="bg-white rounded-2xl border border-stone-200/50 overflow-hidden">
            {recentActiveTopics.map(({ topic, count }, i) => (
              <button
                key={topic}
                onClick={() =>
                  navigate(`/topics/${encodeURIComponent(topic)}`)
                }
                className={`w-full text-left flex items-center justify-between px-4 py-3 active:bg-stone-50 transition-colors ${
                  i < recentActiveTopics.length - 1 ? "border-b border-stone-100" : ""
                }`}
              >
                <span className="text-[13px] text-stone-700 font-medium">{topic}</span>
                <span className="text-[11px] text-stone-400 font-medium">
                  {count} 条记录
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 历史回顾 */}
      {weeklySyntheses.length > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "120ms" }}>
          <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
            历史回顾
          </h2>
          <div className="flex flex-col gap-2">
            {weeklySyntheses.slice(0, 8).map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/synthesis/${s.id}`)}
                className="w-full text-left bg-white rounded-2xl p-3.5 border border-stone-200/50 card-press"
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

      {/* 全部记录概览（兜底） */}
      {weekRecords.length === 0 && activeRecords.length > 0 && (
        <section className="animate-fade-in" style={{ animationDelay: "160ms" }}>
          <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
            全部类型分布
          </h2>
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
            <div className="flex flex-wrap gap-2">
              {Array.from(
                (() => {
                  const stats = new Map<string, number>();
                  activeRecords.forEach((r) =>
                    stats.set(r.type, (stats.get(r.type) || 0) + 1)
                  );
                  return stats;
                })().entries()
              ).map(([type, count]) => (
                <span
                  key={type}
                  className={`px-2.5 py-[5px] rounded-lg text-[11px] font-medium ${TYPE_COLORS[type as keyof typeof TYPE_COLORS]}`}
                >
                  {type} {count}
                </span>
              ))}
            </div>
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
    <div className="bg-white rounded-2xl p-3.5 border border-stone-200/50 text-center">
      <p className={`text-[15px] font-bold ${accent} truncate leading-tight`}>
        {value}
      </p>
      <p className="text-[10px] text-stone-400 font-medium mt-1">{label}</p>
    </div>
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
