import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";

export default function PreferencesPage() {
  const navigate = useNavigate();
  const { preferences, preferenceStats, clearAllPrefs, clearExamplesPrefs, clearTagPrefs, clearTopicAliasPrefs } = useApp();
  const [confirmAction, setConfirmAction] = useState<"all" | "examples" | "tags" | "topics" | null>(null);

  const handleConfirm = () => {
    switch (confirmAction) {
      case "all": clearAllPrefs(); break;
      case "examples": clearExamplesPrefs(); break;
      case "tags": clearTagPrefs(); break;
      case "topics": clearTopicAliasPrefs(); break;
    }
    setConfirmAction(null);
  };

  return (
    <div className="flex flex-col h-full bg-stone-100">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-5 py-3 bg-white/80 backdrop-blur-xl border-b border-stone-200/50 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-[13px] text-stone-500 active:text-stone-400 transition-colors min-w-[48px] py-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回
        </button>
        <h1 className="text-[13px] font-semibold text-stone-900">整理偏好</h1>
        <div className="min-w-[48px]" />
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {/* 概览卡片 */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-[3px] h-3.5 rounded-full bg-violet-400" />
            <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">已保存偏好概览</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="示例数" value={preferenceStats.exampleCount} />
            <StatCard label="主题修正" value={preferenceStats.topicAliasCount} />
            <StatCard label="屏蔽标签" value={preferenceStats.bannedTagCount} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <StatCard label="标题黑名单" value={preferenceStats.titleBlacklistCount} />
            <StatCard label="建议黑名单" value={preferenceStats.suggestionBlacklistCount} />
            <StatCard label="标签偏好" value={preferenceStats.tagsByTopicCount} />
          </div>
        </div>

        {/* 最近记住的偏好 */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-[3px] h-3.5 rounded-full bg-indigo-400" />
            <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">最近记住的偏好</h2>
          </div>
          {preferences.acceptedExamples.length === 0 ? (
            <p className="text-[12px] text-stone-400 text-center py-4">还没有记录</p>
          ) : (
            <div className="space-y-2.5">
              {preferences.acceptedExamples.slice(0, 5).map((example) => (
                <div key={example.id} className="px-3 py-2.5 bg-stone-50 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold text-stone-700 truncate max-w-[70%]">
                      {example.result.title}
                    </span>
                    <span className={`shrink-0 px-1.5 py-[1px] rounded text-[9px] font-medium ${
                      example.source === "edited"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-emerald-50 text-emerald-600"
                    }`}>
                      {example.source === "edited" ? "编辑" : "认可"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 truncate">
                    {example.rawText.slice(0, 40)}{example.rawText.length > 40 ? "…" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 主题修正规则 */}
        {preferences.preferredTopicAliases.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in" style={{ animationDelay: "90ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-[3px] h-3.5 rounded-full bg-teal-400" />
              <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">主题修正规则</h2>
            </div>
            <div className="space-y-1.5">
              {preferences.preferredTopicAliases.slice(0, 10).map((alias, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-stone-50 rounded-lg">
                  <span className="text-[12px] text-stone-500">{alias.from}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="text-[12px] font-medium text-stone-800">{alias.to}</span>
                  <span className="ml-auto text-[10px] text-stone-400">×{alias.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 屏蔽标签 */}
        {preferences.bannedGenericTags.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in" style={{ animationDelay: "100ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-[3px] h-3.5 rounded-full bg-rose-400" />
              <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">屏蔽的泛标签</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preferences.bannedGenericTags.map((tag) => (
                <span key={tag} className="px-2.5 py-[5px] rounded-lg bg-rose-50 text-rose-500 text-[11px] font-medium line-through">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/50 animate-fade-in" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-[3px] h-3.5 rounded-full bg-stone-300" />
            <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">管理</h2>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => setConfirmAction("examples")}
              className="w-full py-2.5 rounded-xl text-[12px] font-medium bg-stone-50 text-stone-600 hover:bg-stone-100 active:bg-stone-100 transition-colors text-left px-4"
            >
              仅清空示例（{preferenceStats.exampleCount} 条）
            </button>
            <button
              onClick={() => setConfirmAction("tags")}
              className="w-full py-2.5 rounded-xl text-[12px] font-medium bg-stone-50 text-stone-600 hover:bg-stone-100 active:bg-stone-100 transition-colors text-left px-4"
            >
              仅清空标签偏好
            </button>
            <button
              onClick={() => setConfirmAction("topics")}
              className="w-full py-2.5 rounded-xl text-[12px] font-medium bg-stone-50 text-stone-600 hover:bg-stone-100 active:bg-stone-100 transition-colors text-left px-4"
            >
              仅清空主题修正规则
            </button>
            <button
              onClick={() => setConfirmAction("all")}
              className="w-full py-2.5 rounded-xl text-[12px] font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 active:bg-rose-100 transition-colors text-left px-4"
            >
              清空全部偏好
            </button>
          </div>
        </div>

        {/* 底部说明 */}
        <div className="text-center py-4">
          <p className="text-[11px] text-stone-300">偏好仅保存在当前浏览器本地</p>
          <p className="text-[11px] text-stone-300 mt-1">
            上次更新：{preferences.lastUpdatedAt ? formatRelativeTime(preferences.lastUpdatedAt) : "无"}
          </p>
        </div>
      </div>

      {/* 确认弹窗 */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={() => setConfirmAction(null)}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up safe-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5" />
            <h3 className="text-[15px] font-semibold text-stone-900 mb-2">
              {confirmAction === "all" ? "清空全部偏好" : "确认清空"}
            </h3>
            <p className="text-[13px] text-stone-500 mb-6 leading-relaxed">
              {confirmAction === "all"
                ? "⚠️ 清空后所有学习记录将丢失，后续 AI 整理将不再参考你的偏好。"
                : "清空后这部分偏好将不再生效。"}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 py-3 rounded-xl text-[13px] font-medium transition-colors ${
                  confirmAction === "all"
                    ? "bg-rose-600 text-white active:bg-rose-700"
                    : "bg-stone-900 text-white active:bg-stone-800"
                }`}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== 子组件 ========== */

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center py-3 px-2 bg-stone-50 rounded-xl">
      <p className="text-[20px] font-bold text-stone-800">{value}</p>
      <p className="text-[10px] text-stone-400 mt-0.5">{label}</p>
    </div>
  );
}

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
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
