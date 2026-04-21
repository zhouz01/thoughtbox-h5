import { useState, useMemo } from "react";
import { useApp } from "../context";
import { useNavigate } from "react-router-dom";

const TOPIC_ICONS: Record<string, string> = {
  作品集: "🎨",
  个人品牌: "✨",
  "AI 工具": "🤖",
  客户项目: "💼",
  设计系统: "🧩",
  视觉探索: "👁",
  未分类主题: "📁",
};

export default function TopicsPage() {
  const { records } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const activeRecords = useMemo(
    () => records.filter((r) => !r.archived && r.aiStatus === "done"),
    [records]
  );

  const topics = useMemo(() => {
    const map = new Map<
      string,
      { count: number; latestTitle: string; latestDate: string; latestId: string }
    >();

    activeRecords.forEach((r) => {
      const topic = r.topic || "未分类主题";
      const existing = map.get(topic);
      if (existing) {
        existing.count++;
        if (r.updatedAt > existing.latestDate) {
          existing.latestTitle = r.aiTitle;
          existing.latestDate = r.updatedAt;
          existing.latestId = r.id;
        }
      } else {
        map.set(topic, {
          count: 1,
          latestTitle: r.aiTitle,
          latestDate: r.updatedAt,
          latestId: r.id,
        });
      }
    });

    return Array.from(map.entries())
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => b.count - a.count);
  }, [activeRecords]);

  const filtered = search
    ? topics.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : topics;

  return (
    <div className="px-5 pt-8 pb-4">
      {/* 标题区 */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-stone-900 tracking-tight">
          主题
        </h1>
        <p className="text-[13px] text-stone-400 mt-0.5">思路的自然聚合</p>
      </div>

      {/* 搜索框 */}
      <div className="relative mb-5">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-300"
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="搜索主题"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-9 py-2.5 bg-white rounded-xl border border-stone-200/80 text-[13px] text-stone-800 focus:ring-2 focus:ring-stone-300/50 focus:border-stone-300 placeholder:text-stone-300 transition-all duration-200"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* 主题列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-stone-50 border border-stone-200/60 flex items-center justify-center">
            <svg
              width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <p className="text-stone-500 text-sm font-medium mb-1">
            {search ? "没有匹配的主题" : "还没有主题"}
          </p>
          <p className="text-stone-400 text-xs">
            {search ? "试试其他关键词" : "记录想法后 AI 会自动归类到主题"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((topic, i) => (
            <button
              key={topic.name}
              onClick={() => navigate(`/topics/${encodeURIComponent(topic.name)}`)}
              className="w-full text-left bg-white rounded-2xl p-4 card-press border border-stone-200/50 hover:border-stone-300/60 animate-fade-in"
              style={{ animationDelay: `${Math.min(i * 50, 200)}ms` }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="w-9 h-9 rounded-xl bg-stone-50 border border-stone-200/60 flex items-center justify-center text-base">
                  {TOPIC_ICONS[topic.name] || "📁"}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-semibold text-stone-800 truncate">
                    {topic.name}
                  </h3>
                </div>
                <span className="text-[11px] text-stone-400 font-medium bg-stone-50 px-2 py-[3px] rounded-lg border border-stone-200/60">
                  {topic.count} 条
                </span>
              </div>
              <div className="flex items-center gap-2 pl-12">
                <p className="text-[12px] text-stone-500 truncate flex-1">
                  {topic.latestTitle}
                </p>
                <span className="text-[11px] text-stone-300 shrink-0 font-medium">
                  {formatShortTime(topic.latestDate)}
                </span>
              </div>
            </button>
          ))}
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
