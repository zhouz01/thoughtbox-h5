import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import {
  getSyncConfig,
  saveSyncConfig,
  getSyncLog,
  getSyncSession,
  clearSyncSession,
} from "../syncConfig";
import {
  bidirectionalSync,
  pushToCloud,
  pullFromCloud,
  createLocalBackup,
  restoreFromLocalBackup,
  sendMagicLink,
} from "../syncService";

export default function SyncSettingsPage() {
  const navigate = useNavigate();
  const { reloadFromStorage } = useApp();

  const config = getSyncConfig();
  const session = getSyncSession();
  const logs = getSyncLog();

  const [syncState, setSyncState] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [email, setEmail] = useState(session?.email || "");
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [backupState, setBackupState] = useState<"idle" | "backing_up" | "restoring">("idle");
  const [backupMessage, setBackupMessage] = useState("");

  const isConfigured = !!(config.supabaseUrl && config.supabaseKey);
  const isLoggedIn = !!session?.email;

  // 当前设备名
  const deviceName = useMemo(() => {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua)) return "iPad";
    if (/Android/.test(ua)) return "Android";
    if (/Mac/.test(ua)) return "Mac";
    if (/Win/.test(ua)) return "Windows";
    return "当前设备";
  }, []);

  // 上次同步时间
  const lastSyncTime = useMemo(() => {
    const lastLog = logs.find((l) => l.status === "success");
    return lastLog ? lastLog.timestamp : config.lastSyncAt;
  }, [logs, config.lastSyncAt]);

  // 状态计算
  const currentStatus = syncState === "syncing"
    ? "同步中"
    : syncState === "success"
    ? "同步成功"
    : syncState === "error"
    ? "同步失败"
    : !isConfigured
    ? "未配置"
    : !isLoggedIn
    ? "未登录"
    : "已连接";

  const statusColor = syncState === "syncing"
    ? "text-amber-600"
    : syncState === "success"
    ? "text-emerald-600"
    : syncState === "error"
    ? "text-rose-500"
    : !isConfigured || !isLoggedIn
    ? "text-stone-400"
    : "text-emerald-600";

  const statusDot = syncState === "syncing"
    ? "bg-amber-400"
    : syncState === "success"
    ? "bg-emerald-400"
    : syncState === "error"
    ? "bg-rose-400"
    : !isConfigured || !isLoggedIn
    ? "bg-stone-300"
    : "bg-emerald-400";

  // 保存配置
  const handleSaveConfig = (partial: Partial<typeof config>) => {
    saveSyncConfig({ ...config, ...partial });
  };

  // 发送登录链接
  const handleSendLink = async () => {
    if (!email.trim() || !config.supabaseUrl || !config.supabaseKey) return;
    setSendingLink(true);
    setLinkSent(false);
    try {
      const result = await sendMagicLink(email.trim(), config.supabaseUrl, config.supabaseKey);
      if (result.success) {
        setLinkSent(true);
      } else {
        setSyncMessage(result.message || "发送失败");
        setSyncState("error");
      }
    } catch {
      setSyncMessage("网络错误，请检查配置");
      setSyncState("error");
    } finally {
      setSendingLink(false);
    }
  };

  // 退出登录
  const handleLogout = () => {
    clearSyncSession();
    setSyncMessage("已退出同步账号");
    setSyncState("success");
    setTimeout(() => setSyncState("idle"), 2000);
  };

  // 双向同步
  const handleBidirectional = async () => {
    if (!isConfigured || !isLoggedIn) return;
    setSyncState("syncing");
    setSyncMessage("正在双向同步…");
    try {
      const result = await bidirectionalSync();
      if (result.success) {
        setSyncMessage("双向同步成功");
        setSyncState("success");
        reloadFromStorage();
      } else {
        setSyncMessage(result.message || "同步失败");
        setSyncState("error");
      }
    } catch {
      setSyncMessage("同步出错，请检查网络");
      setSyncState("error");
    }
  };

  // 上传到云端
  const handlePush = async () => {
    if (!isConfigured || !isLoggedIn) return;
    setSyncState("syncing");
    setSyncMessage("正在上传到云端…");
    try {
      const result = await pushToCloud();
      if (result.success) {
        setSyncMessage("上传成功");
        setSyncState("success");
      } else {
        setSyncMessage(result.message || "上传失败");
        setSyncState("error");
      }
    } catch {
      setSyncMessage("上传出错");
      setSyncState("error");
    }
  };

  // 从云端拉取
  const handlePull = async () => {
    if (!isConfigured || !isLoggedIn) return;
    setSyncState("syncing");
    setSyncMessage("正在从云端拉取…");
    try {
      const result = await pullFromCloud();
      if (result.success) {
        setSyncMessage("拉取成功");
        setSyncState("success");
        reloadFromStorage();
      } else {
        setSyncMessage(result.message || "拉取失败");
        setSyncState("error");
      }
    } catch {
      setSyncMessage("拉取出错");
      setSyncState("error");
    }
  };

  // 创建本地备份
  const handleCreateBackup = () => {
    setBackupState("backing_up");
    setBackupMessage("");
    try {
      const result = createLocalBackup();
      if (result.success) {
        setBackupMessage("本地备份已创建");
      } else {
        setBackupMessage(result.message || "备份失败");
      }
    } catch {
      setBackupMessage("备份出错");
    } finally {
      setBackupState("idle");
    }
  };

  // 从备份恢复
  const handleRestoreBackup = () => {
    setBackupState("restoring");
    setBackupMessage("");
    try {
      const result = restoreFromLocalBackup();
      if (result.success) {
        setBackupMessage("已从备份恢复");
        reloadFromStorage();
      } else {
        setBackupMessage(result.message || "恢复失败");
      }
    } catch {
      setBackupMessage("恢复出错");
    } finally {
      setBackupState("idle");
    }
  };

  return (
    <div className="flex flex-col h-full bg-stone-100">
      {/* ====== 1. 顶部导航栏 ====== */}
      <div className="flex items-center justify-between px-5 py-3 bg-white/80 backdrop-blur-xl border-b border-stone-200/50">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-[13px] text-stone-500 active:text-stone-400 transition-colors min-w-[48px] py-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回
        </button>
        <h1 className="text-[13px] font-semibold text-stone-900">数据同步</h1>
        <div className="min-w-[48px]" />
      </div>

      {/* ====== 内容区 ====== */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {/* ====== 2. 当前状态卡片 ====== */}
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "20ms" }}>
          <SectionLabel>当前状态</SectionLabel>
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-[7px] h-[7px] rounded-full ${statusDot}`} />
              <span className={`text-[15px] font-bold ${statusColor}`}>{currentStatus}</span>
            </div>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              <StatusRow label="当前设备" value={deviceName} />
              <StatusRow label="同步账号" value={session?.email || "—"} />
              <StatusRow label="上次同步" value={lastSyncTime ? formatRelativeTime(lastSyncTime) : "—"} />
              <StatusRow label="最近结果" value={syncState === "idle" ? "—" : syncMessage} valueClass={syncState === "error" ? "text-rose-500" : syncState === "success" ? "text-emerald-600" : "text-stone-500"} />
            </div>
          </div>
        </section>

        {/* ====== 3. 云端连接配置 ====== */}
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "40ms" }}>
          <SectionLabel>云端连接配置</SectionLabel>
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50 space-y-4">
            <FormField label="服务地址">
              <input
                type="url"
                value={config.supabaseUrl}
                onChange={(e) => handleSaveConfig({ supabaseUrl: e.target.value })}
                placeholder="https://your-project.supabase.co"
                className="w-full px-3 py-2.5 bg-stone-50 rounded-xl text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 placeholder:text-stone-300 transition-all"
              />
            </FormField>
            <FormField label="公开密钥">
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={config.supabaseKey}
                  onChange={(e) => handleSaveConfig({ supabaseKey: e.target.value })}
                  placeholder="eyJ..."
                  className="w-full px-3 py-2.5 pr-12 bg-stone-50 rounded-xl text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 placeholder:text-stone-300 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                >
                  {showKey ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </FormField>
            <ToggleRow label="打开应用时自动检查云端" value={config.autoCheckOnOpen} onChange={(v) => handleSaveConfig({ autoCheckOnOpen: v })} />
            <ToggleRow label="同步前自动本地备份" value={config.autoBackupBeforeSync} onChange={(v) => handleSaveConfig({ autoBackupBeforeSync: v })} />
          </div>
        </section>

        {/* ====== 4. 登录与账号状态 ====== */}
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "60ms" }}>
          <SectionLabel>登录与账号</SectionLabel>
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
            {isLoggedIn ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-[6px] h-[6px] rounded-full bg-emerald-400" />
                  <span className="text-[13px] text-stone-700">已连接</span>
                  <span className="text-[13px] font-medium text-stone-900">{session.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
                >
                  退出同步账号
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-stone-500">当前未登录</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="输入邮箱地址"
                    className="flex-1 px-3 py-2.5 bg-stone-50 rounded-xl text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 placeholder:text-stone-300 transition-all"
                  />
                </div>
                <button
                  onClick={handleSendLink}
                  disabled={sendingLink || !email.trim() || !isConfigured}
                  className="w-full py-2.5 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  {sendingLink ? "发送中…" : "发送登录链接"}
                </button>
                {linkSent && (
                  <p className="text-[12px] text-emerald-600">登录链接已发送到邮箱，请查收</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ====== 5. 同步操作区 ====== */}
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "80ms" }}>
          <SectionLabel>同步操作</SectionLabel>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleBidirectional}
              disabled={!isConfigured || !isLoggedIn || syncState === "syncing"}
              className="w-full py-3 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors disabled:opacity-50 disabled:active:bg-stone-900 flex items-center justify-center gap-2"
            >
              {syncState === "syncing" ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  同步中…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
                  双向同步
                </>
              )}
            </button>
            <div className="flex gap-2">
              <button
                onClick={handlePush}
                disabled={!isConfigured || !isLoggedIn || syncState === "syncing"}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-medium bg-white text-stone-600 border border-stone-200/80 active:bg-stone-50 transition-colors disabled:opacity-50"
              >
                上传到云端
              </button>
              <button
                onClick={handlePull}
                disabled={!isConfigured || !isLoggedIn || syncState === "syncing"}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-medium bg-white text-stone-600 border border-stone-200/80 active:bg-stone-50 transition-colors disabled:opacity-50"
              >
                从云端拉取
              </button>
            </div>
          </div>
          {!isConfigured && (
            <p className="text-[11px] text-stone-400 mt-2">请先填写云端连接配置</p>
          )}
          {isConfigured && !isLoggedIn && (
            <p className="text-[11px] text-stone-400 mt-2">请先登录同步账号</p>
          )}
        </section>

        {/* ====== 6. 本地备份区 ====== */}
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "100ms" }}>
          <SectionLabel>本地备份</SectionLabel>
          <div className="flex gap-2">
            <button
              onClick={handleCreateBackup}
              disabled={backupState !== "idle"}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium bg-white text-stone-600 border border-stone-200/80 active:bg-stone-50 transition-colors disabled:opacity-50"
            >
              {backupState === "backing_up" ? "备份中…" : "创建本地备份"}
            </button>
            <button
              onClick={handleRestoreBackup}
              disabled={backupState !== "idle"}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium bg-white text-stone-600 border border-stone-200/80 active:bg-stone-50 transition-colors disabled:opacity-50"
            >
              {backupState === "restoring" ? "恢复中…" : "从备份恢复"}
            </button>
          </div>
          {backupMessage && (
            <p className={`text-[11px] mt-2 ${backupMessage.includes("失败") || backupMessage.includes("出错") ? "text-rose-500" : "text-emerald-600"}`}>
              {backupMessage}
            </p>
          )}
        </section>

        {/* ====== 7. 最近同步记录 ====== */}
        {logs.length > 0 && (
          <section className="mb-5 animate-fade-in" style={{ animationDelay: "120ms" }}>
            <SectionLabel>最近同步记录</SectionLabel>
            <div className="bg-white rounded-2xl border border-stone-200/50 overflow-hidden">
              {logs.slice(0, 5).map((log, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-3 ${i < logs.slice(0, 5).length - 1 ? "border-b border-stone-100" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-[5px] h-[5px] rounded-full ${log.status === "success" ? "bg-emerald-400" : log.status === "error" ? "bg-rose-400" : "bg-amber-400"}`} />
                    <span className="text-[12px] text-stone-700">{log.action}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${log.status === "success" ? "text-emerald-600" : log.status === "error" ? "text-rose-500" : "text-amber-600"}`}>
                      {log.status === "success" ? "成功" : log.status === "error" ? "失败" : "进行中"}
                    </span>
                    <span className="text-[11px] text-stone-300">{formatRelativeTime(log.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ====== 8. 说明区 ====== */}
        <section className="animate-fade-in" style={{ animationDelay: "140ms" }}>
          <SectionLabel>说明</SectionLabel>
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50 space-y-2">
            <p className="text-[12px] text-stone-500 leading-relaxed">AI 密钥不会同步到云端</p>
            <p className="text-[12px] text-stone-500 leading-relaxed">不登录也可以继续本地使用</p>
            <p className="text-[12px] text-stone-500 leading-relaxed">同步前会先备份本地数据</p>
            <p className="text-[12px] text-stone-500 leading-relaxed">如果要在手机和电脑之间同步，请在两端使用同一个同步账号</p>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ========== 子组件 ========== */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-[3px] h-3.5 rounded-full bg-violet-400" />
      <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">{children}</h2>
    </div>
  );
}

function StatusRow({ label, value, valueClass = "text-stone-700" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] text-stone-400 mb-0.5">{label}</p>
      <p className={`text-[13px] font-semibold ${valueClass} truncate`}>{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-stone-400 font-medium block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-stone-700">{label}</span>
      <button onClick={() => onChange(!value)} className={`w-10 h-[22px] rounded-full transition-colors duration-200 relative ${value ? "bg-violet-500" : "bg-stone-300"}`}>
        <span className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? "translate-x-[20px]" : "translate-x-[2px]"}`} />
      </button>
    </div>
  );
}

/* ========== 工具函数 ========== */

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

  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${m}月${d}日 ${hh}:${mm}`;
}
