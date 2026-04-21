import { useMemo, useState } from "react";
import { useApp } from "../context";
import { useNavigate, useParams } from "react-router-dom";
import { TYPE_COLORS, PROMOTE_DOT } from "../types";
import type { Synthesis } from "../types";

export default function SynthesisDetailPage() {
  const { getSynthesis, records, generateSelectionSynthesis, generateWeeklyReview, deleteSynthesisById, generateBriefFromSynthesisData } = useApp();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [regenerating, setRegenerating] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);

  const synthesis = getSynthesis(id || "");

  // 来源记录
  const sourceRecords = useMemo(() => {
    if (!synthesis) return [];
    return synthesis.sourceRecordIds
      .map((rid) => records.find((r) => r.id === rid))
      .filter((r): r is NonNullable<typeof r> => r != null);
  }, [synthesis, records]);

  if (!synthesis) {
    return (
      <div className="px-5 pt-8 pb-4">
        <div className="text-center py-20">
          <p className="text-stone-400 text-sm">未找到该整理结果</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-[13px] font-medium"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const isWeekly = synthesis.mode === "weekly_review";

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      if (isWeekly) {
        const result = await generateWeeklyReview();
        if (result && result.id !== synthesis.id) {
          navigate(`/synthesis/${result.id}`, { replace: true });
        }
      } else {
        const result = await generateSelectionSynthesis(synthesis.sourceRecordIds, synthesis.sourceTopic);
        if (result && result.id !== synthesis.id) {
          navigate(`/synthesis/${result.id}`, { replace: true });
        }
      }
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = () => {
    const confirmed = window.confirm("确定删除该整理结果？来源记录不会被删除。");
    if (!confirmed) return;
    deleteSynthesisById(synthesis.id);
    navigate(-1);
  };

  const handleGenerateBrief = async () => {
    setGeneratingBrief(true);
    try {
      const brief = await generateBriefFromSynthesisData(synthesis.id);
      if (brief) {
        navigate(`/brief/${brief.id}`);
      }
    } finally {
      setGeneratingBrief(false);
    }
  };

  return (
    <div className="px-5 pt-4 pb-8">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center text-stone-500 active:bg-stone-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-bold text-stone-900 truncate">
            {synthesis.title}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <SourceLabel synthesis={synthesis} />
            <span className="text-[11px] text-stone-300">·</span>
            <span className="text-[11px] text-stone-400">{synthesis.sourceRecordCount} 条记录</span>
            <span className="text-[11px] text-stone-300">·</span>
            <span className="text-[11px] text-stone-400">{formatShortTime(synthesis.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* 一句话总结 */}
      <div className="bg-stone-900 rounded-2xl p-4 mb-5 animate-fade-in">
        <div className="flex items-start gap-2.5">
          <span className="text-[14px] mt-0.5">💡</span>
          <p className="text-[13px] text-stone-200 leading-[1.7]">{synthesis.oneLineSummary}</p>
        </div>
      </div>

      {/* 内容区块 */}
      <div className="space-y-4 animate-fade-in" style={{ animationDelay: "40ms" }}>
        {/* 总览 */}
        <SectionBlock title="总览">
          <p className="text-[13px] text-stone-700 leading-[1.7]">{synthesis.overview}</p>
        </SectionBlock>

        {/* 关键主题 */}
        {synthesis.keyThemes.length > 0 && (
          <SectionBlock title="关键主题">
            <div className="flex flex-wrap gap-1.5">
              {synthesis.keyThemes.map((t) => (
                <span key={t} className="px-2.5 py-[5px] rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-medium">
                  {t}
                </span>
              ))}
            </div>
          </SectionBlock>
        )}

        {/* 反复出现的模式 */}
        {synthesis.repeatedPatterns.length > 0 && (
          <SectionBlock title="反复出现的模式">
            <ul className="space-y-1.5">
              {synthesis.repeatedPatterns.map((p, i) => (
                <li key={i} className="text-[13px] text-stone-700 leading-[1.6] flex items-start gap-2">
                  <span className="shrink-0 mt-[5px] w-[5px] h-[5px] rounded-full bg-amber-400" />
                  {p}
                </li>
              ))}
            </ul>
          </SectionBlock>
        )}

        {/* 待观察问题 */}
        {synthesis.openQuestions.length > 0 && (
          <SectionBlock title="待观察问题">
            <ul className="space-y-1.5">
              {synthesis.openQuestions.map((q, i) => (
                <li key={i} className="text-[13px] text-stone-700 leading-[1.6] flex items-start gap-2">
                  <span className="shrink-0 mt-[5px] w-[5px] h-[5px] rounded-full bg-rose-400" />
                  {q}
                </li>
              ))}
            </ul>
          </SectionBlock>
        )}

        {/* 值得推进的机会 */}
        {synthesis.opportunities.length > 0 && (
          <SectionBlock title="值得推进的机会">
            <ul className="space-y-1.5">
              {synthesis.opportunities.map((o, i) => (
                <li key={i} className="text-[13px] text-stone-700 leading-[1.6] flex items-start gap-2">
                  <span className="shrink-0 mt-[5px] w-[5px] h-[5px] rounded-full bg-emerald-400" />
                  {o}
                </li>
              ))}
            </ul>
          </SectionBlock>
        )}

        {/* 下一步建议 */}
        {synthesis.nextActions.length > 0 && (
          <SectionBlock title="下一步建议">
            <ul className="space-y-1.5">
              {synthesis.nextActions.map((a, i) => (
                <li key={i} className="text-[13px] text-stone-700 leading-[1.6] flex items-start gap-2">
                  <span className="shrink-0 mt-[6px] w-[6px] h-[6px] rounded-full bg-stone-900" />
                  {a}
                </li>
              ))}
            </ul>
          </SectionBlock>
        )}
      </div>

      {/* 来源记录区 */}
      {sourceRecords.length > 0 && (
        <section className="mt-6 animate-fade-in" style={{ animationDelay: "80ms" }}>
          <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
            来源记录
          </h2>
          <div className="flex flex-col gap-2">
            {sourceRecords.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/record/${r.id}`)}
                className="w-full text-left bg-white rounded-xl p-3 card-press border border-stone-200/50 hover:border-stone-300/60"
              >
                <div className="flex items-start gap-2">
                  {r.promoteLevel !== "仅保存" && (
                    <span className={`shrink-0 mt-[5px] w-[5px] h-[5px] rounded-full ${PROMOTE_DOT[r.promoteLevel]}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-stone-800 font-medium truncate">{r.aiTitle}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`px-1.5 py-[2px] rounded text-[10px] font-medium ${TYPE_COLORS[r.type]}`}>
                        {r.type}
                      </span>
                      <span className="text-[10px] text-stone-400">{r.topic}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 操作区 */}
      <div className="mt-8 flex flex-col gap-2.5 animate-fade-in" style={{ animationDelay: "120ms" }}>
        <button
          onClick={handleGenerateBrief}
          disabled={generatingBrief}
          className="w-full py-2.5 bg-stone-900 text-white rounded-xl text-[13px] font-medium active:bg-stone-800 disabled:opacity-50 transition-colors"
        >
          {generatingBrief ? "生成 Brief 中..." : "转为推进卡"}
        </button>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="w-full py-2.5 bg-white text-stone-700 rounded-xl text-[13px] font-medium border border-stone-200/80 active:bg-stone-50 disabled:opacity-50 transition-colors"
        >
          {regenerating ? "重新生成中..." : "重新生成"}
        </button>
        <button
          onClick={handleDelete}
          className="w-full py-2.5 text-rose-500 text-[13px] font-medium active:text-rose-600 transition-colors"
        >
          删除本次整理结果
        </button>
      </div>
    </div>
  );
}

/* ========== 子组件 ========== */

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
      <h3 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-2.5">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SourceLabel({ synthesis }: { synthesis: Synthesis }) {
  const sourceText = synthesis.source === "ai" ? "AI 整理" : "本地整理";
  const modelTag = synthesis.aiModel ? ` · ${synthesis.aiModel}` : "";
  return (
    <span className="text-[11px] text-stone-400 font-medium">
      {sourceText}{modelTag}
    </span>
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
