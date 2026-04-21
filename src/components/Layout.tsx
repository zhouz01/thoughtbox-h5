import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";

const tabs = [
  { path: "/", label: "收件箱", icon: InboxIcon },
  { path: "/topics", label: "主题", icon: TopicsIcon },
  { path: "/review", label: "回顾", icon: ReviewIcon },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  // 详情页等子页面隐藏 FAB
  const hideFab =
    location.pathname.startsWith("/new") ||
    location.pathname.startsWith("/record/");

  return (
    <div className="flex flex-col h-[100dvh] bg-stone-100 text-stone-900">
      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
        <Outlet />
      </main>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-stone-200/60 z-40">
        <div className="flex items-center justify-around h-[56px] max-w-lg mx-auto safe-bottom-internal">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-[2px] px-5 py-1.5 transition-colors duration-200 min-h-[44px] justify-center ${
                  isActive
                    ? "text-stone-900"
                    : "text-stone-400 active:text-stone-500"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon active={isActive} />
                  <span className={`text-[10px] font-medium ${isActive ? "text-stone-900" : "text-stone-400"}`}>
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* FAB */}
      {!hideFab && (
        <button
          onClick={() => navigate("/new")}
          className="fixed z-50 w-[52px] h-[52px] rounded-2xl bg-stone-900 text-white shadow-[0_4px_14px_rgba(28,25,23,0.35)] flex items-center justify-center active:scale-95 active:shadow-[0_2px_8px_rgba(28,25,23,0.3)] transition-all duration-150"
          style={{
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
            right: "20px",
          }}
          aria-label="新建记录"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ========== 图标组件 ========== */

function InboxIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "1.5" : "1.6"} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function TopicsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "1.5" : "1.6"} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ReviewIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "1.5" : "1.6"} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
