import { useState, useMemo } from "react";
import { useApp } from "../context";
import { useNavigate } from "react-router-dom";

export default function TopicsPage() {
  const { records } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const activeRecords = useMemo(
    () => records.filter((r) => !r.archived && r.aiStatus === "done"),
    [records]
  );

  // 主题聚合
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

  // 搜索增强：主题名 + 最近记录标题
  const filtered = search
    ? topics.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.latestTitle.toLowerCase().includes(search.toLowerCase())
      )
    : topics;

  // 本周活跃主题
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const weekTopicStats = new Map<string, number>();
  activeRecords.forEach((r) => {
    const d = new Date(r.createdAt);
    if (d >= monday && d <= sunday) {
      const topic = r.topic || "未分类主题";
      weekTopicStats.set(topic, (weekTopicStats.get(topic) || 0) + 1);
    }
  });
  const weekActiveTopics = Array.from(weekTopicStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => ({ topic, count }));

  return (
    <div className="px-5 pt-5 pb-4">
      {/* ====== 1. 顶部标题区 ====== */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-stone-900 tracking-tight">
            主题
          </h1>
          <p className="text-[13px] text-stone-400 mt-0.5">
            看看想法都积累到了哪里
          </p>
        </div>
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

      {/* 更多菜单 */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="absolute right-5 top-[72px] z-40 w-52 bg-white rounded-2xl shadow-lg border border-stone-200/60 py-1.5 animate-fade-in overflow-hidden">
            <MenuButton onClick={() => { navigate("/briefs"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              查看全部推进卡
            </MenuButton>
            <MenuButton onClick={() => { navigate("/workspace"); setShowMenu(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              进入工作台
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

      {/* ====== 2. 搜索主题 ====== */}
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

      {/* ====== 3. 本周活跃主题 ====== */}
      {!search && weekActiveTopics.length > 0 && (
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "40ms" }}>
          <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
            本周活跃主题
          </h2>
          <div className="flex flex-wrap gap-2">
            {weekActiveTopics.map(({ topic, count }) => (
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

      {/* ====== 4. 全部主题列表 ====== */}
      <section>
        <h2 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-3">
          全部主题
        </h2>
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
            <p className="text-stone-400 text-xs mb-5">
              {search
                ? "试试其他关键词"
                : "当记录开始围绕同一个方向出现时，它们会聚合到这里"}
            </p>
            {!search && (
              <button
                onClick={() => navigate("/new")}
                className="px-5 py-2 bg-stone-900 text-white rounded-xl text-[13px] font-medium active:bg-stone-800"
              >
                去记录一条想法
              </button>
            )}
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
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[14px] font-semibold text-stone-800 truncate">
                    {topic.name}
                  </h3>
                  <span className="text-[11px] text-stone-400 font-medium bg-stone-50 px-2 py-[3px] rounded-lg border border-stone-200/60 shrink-0">
                    {topic.count} 条记录
                  </span>
                </div>
                <p className="text-[12px] text-stone-500 truncate mb-1.5">
                  最近：{topic.latestTitle}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-stone-400">
                    最近更新 {formatShortTime(topic.latestDate)}
                  </span>
                  <span className="text-[11px] text-stone-300 font-medium">
                    查看 →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ========== 子组件 ========== */

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
