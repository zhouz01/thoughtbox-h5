import { useNavigate } from "react-router-dom";

/**
 * 桌面端可见的「进入工作台」快捷入口
 * - 只在 >= 1024px 宽度下显示
 * - 点击后带上下文 query 参数跳转到 /workspace
 */
export function WorkspaceLink({
  view,
  recordId,
  topic,
  synthesisId,
  briefId,
  label = "进入工作台",
  className = "",
}: {
  view?: "records" | "topics" | "syntheses" | "briefs" | "review";
  recordId?: string;
  topic?: string;
  synthesisId?: string;
  briefId?: string;
  label?: string;
  className?: string;
}) {
  const navigate = useNavigate();

  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (recordId) params.set("recordId", recordId);
  if (topic) params.set("topic", topic);
  if (synthesisId) params.set("synthesisId", synthesisId);
  if (briefId) params.set("briefId", briefId);

  const qs = params.toString();
  const url = qs ? `/workspace?${qs}` : "/workspace";

  return (
    <button
      onClick={() => navigate(url)}
      className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-500 bg-white border border-stone-200/80 rounded-lg hover:border-stone-300 hover:text-stone-700 active:bg-stone-50 transition-colors ${className}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      {label}
    </button>
  );
}
