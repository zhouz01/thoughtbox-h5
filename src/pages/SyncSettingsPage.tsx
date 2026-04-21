import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { SyncStatus } from "../types";
import {
  getSyncConfig,
  saveSyncConfig,
  clearSyncConfig,
  isSyncLoggedIn,
  getSyncMeta,
  getSyncLog,
} from "../syncConfig";
import {
  resetSupabaseClient,
  initSupabaseClient,
  signupWithEmailPassword,
  loginWithEmailPassword,
  logoutSync,
  getCurrentUser,
  pushToCloud,
  pullFromCloud,
  bidirectionalSync,
  createLocalBackup,
  getLocalBackups,
  restoreFromLocalBackup,
  type SyncOperationResult,
} from "../syncService";

// 内联 SVG 图标
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CloudIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CloudOffIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 2l20 20M8.5 8.5a6 6 0 0 0 8.5 8.5M14 14l2.5 2.5M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CheckIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const AlertIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8v4M12 16h.01" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const UploadIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const DownloadIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg className={`w-5 h-5 ${spinning ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const LogoutIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const SaveIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const SmartphoneIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <path d="M12 18h.01" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const LaptopIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM2 18h20" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ShieldIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const InfoIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function SyncSettingsPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(getSyncConfig());
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("未配置");
  const [syncMeta, setSyncMeta] = useState(getSyncMeta());
  const [syncLog, setSyncLog] = useState(getSyncLog());
  const [userEmail, setUserEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);

  const refreshStatus = useCallback(async () => {
    const loggedIn = isSyncLoggedIn();
    setIsLoggedIn(loggedIn);
    setSyncMeta(getSyncMeta());
    setSyncLog(getSyncLog());

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      setSyncStatus("未配置");
      return;
    }
    if (!loggedIn) {
      setSyncStatus("未登录");
      return;
    }
    const user = await getCurrentUser();
    if (user) {
      setUserEmail(user.email ?? "");
      setSyncStatus("已连接");
    } else {
      setSyncStatus("未登录");
    }
  }, [config.supabaseUrl, config.supabaseAnonKey]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleSaveConfig = () => {
    saveSyncConfig(config);
    resetSupabaseClient();
    initSupabaseClient();
    setMessage({ type: "success", text: "配置已保存" });
    setTimeout(() => setMessage(null), 3000);
    refreshStatus();
  };

  const handleClearConfig = () => {
    if (confirm("确定要清除同步配置吗？本地数据不会丢失。")) {
      clearSyncConfig();
      logoutSync();
      resetSupabaseClient();
      setConfig(getSyncConfig());
      setMessage({ type: "success", text: "配置已清除" });
      refreshStatus();
    }
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setMessage({ type: "error", text: "请输入邮箱和密码" });
      return;
    }
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      setMessage({ type: "error", text: "请先配置同步服务" });
      return;
    }
    setIsLoading(true);
    const result = isSignup
      ? await signupWithEmailPassword(loginEmail.trim(), loginPassword.trim())
      : await loginWithEmailPassword(loginEmail.trim(), loginPassword.trim());
    setIsLoading(false);
    if (result.success) {
      setMessage({ type: "success", text: isSignup ? "注册成功" : "登录成功" });
      setLoginPassword("");
      refreshStatus();
    } else {
      setMessage({ type: "error", text: result.error || (isSignup ? "注册失败" : "登录失败") });
    }
  };

  const handleLogout = async () => {
    if (confirm("确定要退出同步账号吗？本地数据不会丢失。")) {
      await logoutSync();
      resetSupabaseClient();
      setMessage({ type: "success", text: "已退出登录" });
      refreshStatus();
    }
  };

  const handleSync = async (action: "push" | "pull" | "merge") => {
    setIsLoading(true);
    setSyncStatus("同步中");
    if (config.autoBackupBeforeSync) {
      createLocalBackup(`before_${action}`);
    }
    let result: SyncOperationResult;
    switch (action) {
      case "push":
        result = await pushToCloud();
        break;
      case "pull":
        result = await pullFromCloud();
        break;
      default:
        result = await bidirectionalSync();
    }
    setIsLoading(false);
    setSyncStatus(result.success ? "同步成功" : "同步失败");
    setSyncMeta(getSyncMeta());
    setSyncLog(getSyncLog());
    setMessage({ type: result.success ? "success" : "error", text: result.error || result.message });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateBackup = () => {
    createLocalBackup("manual");
    setMessage({ type: "success", text: "本地备份已创建" });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleRestoreBackup = (backupId: string) => {
    if (confirm("确定要从此备份恢复吗？当前数据将被覆盖。")) {
      const success = restoreFromLocalBackup(backupId);
      setMessage({ type: success ? "success" : "error", text: success ? "备份已恢复" : "恢复失败" });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const getStatusColor = (status: SyncStatus) => {
    switch (status) {
      case "已连接":
      case "同步成功":
        return "text-emerald-600 bg-emerald-50";
      case "同步中":
        return "text-blue-600 bg-blue-50";
      case "同步失败":
        return "text-rose-600 bg-rose-50";
      default:
        return "text-stone-500 bg-stone-100";
    }
  };

  const backups = getLocalBackups();

  return (
    <div className="min-h-screen bg-[#0f0f11] text-stone-200">
      <div className="sticky top-0 z-10 bg-[#0f0f11]/95 backdrop-blur-sm border-b border-stone-800/50 safe-top">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-stone-800/50 rounded-lg transition-colors">
            <ArrowLeftIcon />
          </button>
          <h1 className="text-base font-medium text-stone-100">数据同步</h1>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 pb-32 space-y-6">
        {message && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
            {message.type === "success" ? <CheckIcon /> : <AlertIcon />}
            <p className="text-sm">{message.text}</p>
          </div>
        )}

        {/* 状态卡片 */}
        <div className="bg-stone-900/50 rounded-2xl p-5 border border-stone-800/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${getStatusColor(syncStatus)}`}>
                {syncStatus === "已连接" || syncStatus === "同步成功" ? <CloudIcon /> : <CloudOffIcon />}
              </div>
              <div>
                <h2 className="text-sm font-medium text-stone-100">同步状态</h2>
                <p className="text-xs text-stone-500 mt-0.5">{syncStatus}</p>
              </div>
            </div>
            {isLoggedIn && userEmail && <span className="text-xs text-stone-400">{userEmail}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-stone-800/30 rounded-lg p-3">
              <p className="text-stone-500 mb-1">当前设备</p>
              <p className="text-stone-300 flex items-center gap-1.5">
                <SmartphoneIcon />
                {syncMeta.deviceName}
              </p>
            </div>
            <div className="bg-stone-800/30 rounded-lg p-3">
              <p className="text-stone-500 mb-1">上次同步</p>
              <p className="text-stone-300">
                {syncMeta.lastSyncAt ? new Date(syncMeta.lastSyncAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "从未"}
              </p>
            </div>
          </div>
        </div>

        {/* 同步服务配置 */}
        <div className="bg-stone-900/50 rounded-2xl p-5 border border-stone-800/50">
          <h2 className="text-sm font-medium text-stone-100 mb-4 flex items-center gap-2">
            <LaptopIcon />
            同步服务配置
          </h2>
          <p className="text-xs text-stone-500 mb-4">支持 MemFire Cloud（国内）或 Supabase，两者 API 兼容</p>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-stone-500 mb-1.5 block">服务地址</label>
              <input
                type="text"
                value={config.supabaseUrl}
                onChange={(e) => setConfig({ ...config, supabaseUrl: e.target.value })}
                placeholder="https://your-project.memfiredb.com 或 https://xxx.supabase.co"
                className="w-full bg-stone-800/50 border border-stone-700/50 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-teal-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1.5 block">Publishable Key (Anon Key)</label>
              <input
                type="password"
                value={config.supabaseAnonKey}
                onChange={(e) => setConfig({ ...config, supabaseAnonKey: e.target.value })}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="w-full bg-stone-800/50 border border-stone-700/50 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-teal-500/50"
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-stone-400">同步前自动本地备份</span>
              <button
                onClick={() => setConfig({ ...config, autoBackupBeforeSync: !config.autoBackupBeforeSync })}
                className={`w-11 h-6 rounded-full transition-colors ${config.autoBackupBeforeSync ? "bg-teal-500" : "bg-stone-700"}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${config.autoBackupBeforeSync ? "translate-x-6" : "translate-x-1"} mt-1`} />
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveConfig} className="flex-1 bg-teal-500 hover:bg-teal-400 text-stone-950 font-medium py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                <SaveIcon />
                保存配置
              </button>
              <button onClick={handleClearConfig} className="px-4 py-3 border border-stone-700/50 text-stone-400 rounded-xl text-sm hover:bg-stone-800/50 transition-colors">
                清除
              </button>
            </div>
          </div>
        </div>

        {/* 登录与连接 */}
        <div className="bg-stone-900/50 rounded-2xl p-5 border border-stone-800/50">
          <h2 className="text-sm font-medium text-stone-100 mb-4">登录与连接</h2>
          {isLoggedIn ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-emerald-500/10 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckIcon />
                </div>
                <div>
                  <p className="text-sm text-stone-200">已连接到同步服务</p>
                  <p className="text-xs text-stone-500">{userEmail}</p>
                </div>
              </div>
              <button onClick={handleLogout} className="w-full py-3 border border-stone-700/50 text-stone-400 rounded-xl text-sm hover:bg-stone-800/50 transition-colors flex items-center justify-center gap-2">
                <LogoutIcon />
                退出同步账号
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="输入邮箱地址"
                className="w-full bg-stone-800/50 border border-stone-700/50 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-teal-500/50"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="输入密码（至少 6 位）"
                className="w-full bg-stone-800/50 border border-stone-700/50 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-teal-500/50"
              />
              <button
                onClick={handleLogin}
                disabled={isLoading || !config.supabaseUrl || !config.supabaseAnonKey}
                className="w-full bg-teal-500 hover:bg-teal-400 disabled:bg-stone-700 disabled:text-stone-500 text-stone-950 font-medium py-3 rounded-xl text-sm transition-colors"
              >
                {isLoading ? "处理中..." : (isSignup ? "注册账号" : "登录")}
              </button>
              <button
                onClick={() => setIsSignup(!isSignup)}
                className="w-full text-xs text-stone-500 hover:text-stone-400 py-2"
              >
                {isSignup ? "已有账号？点击登录" : "没有账号？点击注册"}
              </button>
            </div>
          )}
        </div>

        {/* 同步操作 */}
        {isLoggedIn && (
          <div className="bg-stone-900/50 rounded-2xl p-5 border border-stone-800/50">
            <h2 className="text-sm font-medium text-stone-100 mb-4">同步操作</h2>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleSync("push")}
                disabled={isLoading}
                className="p-4 bg-stone-800/50 hover:bg-stone-800 rounded-xl transition-colors flex flex-col items-center gap-2"
              >
                <UploadIcon />
                <span className="text-xs text-teal-400">上传到云端</span>
              </button>
              <button
                onClick={() => handleSync("pull")}
                disabled={isLoading}
                className="p-4 bg-stone-800/50 hover:bg-stone-800 rounded-xl transition-colors flex flex-col items-center gap-2"
              >
                <DownloadIcon />
                <span className="text-xs text-blue-400">从云端拉取</span>
              </button>
              <button
                onClick={() => handleSync("merge")}
                disabled={isLoading}
                className="p-4 bg-stone-800/50 hover:bg-stone-800 rounded-xl transition-colors flex flex-col items-center gap-2"
              >
                <RefreshIcon spinning={isLoading} />
                <span className="text-xs text-emerald-400">双向同步</span>
              </button>
            </div>
          </div>
        )}

        {/* 本地备份 */}
        <div className="bg-stone-900/50 rounded-2xl p-5 border border-stone-800/50">
          <h2 className="text-sm font-medium text-stone-100 mb-4">本地备份</h2>
          <button onClick={handleCreateBackup} className="w-full mb-4 py-3 bg-stone-800/50 hover:bg-stone-800 text-stone-300 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            <SaveIcon />
            创建本地备份
          </button>
          {backups.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-stone-500">最近备份</p>
              {backups.slice(0, 3).map((backup) => (
                <div key={backup.id} className="flex items-center justify-between p-3 bg-stone-800/30 rounded-lg">
                  <div>
                    <p className="text-xs text-stone-300">{new Date(backup.timestamp).toLocaleString("zh-CN")}</p>
                    <p className="text-xs text-stone-500">{backup.reason}</p>
                  </div>
                  <button onClick={() => handleRestoreBackup(backup.id)} className="px-3 py-1.5 text-xs text-teal-400 hover:bg-teal-500/10 rounded-lg transition-colors">
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 说明 */}
        <div className="bg-stone-900/30 rounded-2xl p-5 border border-stone-800/30">
          <h2 className="text-sm font-medium text-stone-100 mb-3 flex items-center gap-2">
            <InfoIcon />
            说明
          </h2>
          <ul className="space-y-2 text-xs text-stone-500">
            <li className="flex items-start gap-2">
              <ShieldIcon />
              <span>AI API Key 不会同步到云端，仅保存在当前设备</span>
            </li>
            <li className="flex items-start gap-2">
              <CloudIcon />
              <span>支持 MemFire Cloud（国内，无需 VPN）或 Supabase</span>
            </li>
            <li className="flex items-start gap-2">
              <RefreshIcon />
              <span>双向同步默认采用"最近修改优先"策略</span>
            </li>
            <li className="flex items-start gap-2">
              <SmartphoneIcon />
              <span>在手机和电脑间同步，请使用同一个账号登录</span>
            </li>
          </ul>
        </div>

        {/* 同步日志 */}
        {syncLog.length > 0 && (
          <div className="bg-stone-900/50 rounded-2xl p-5 border border-stone-800/50">
            <h2 className="text-sm font-medium text-stone-100 mb-4">最近同步记录</h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {syncLog.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 p-2.5 bg-stone-800/30 rounded-lg">
                  <div className={`w-2 h-2 rounded-full ${entry.status === "success" ? "bg-emerald-500" : "bg-rose-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-300 truncate">{entry.details || entry.error || entry.action}</p>
                    <p className="text-xs text-stone-500">{new Date(entry.timestamp).toLocaleString("zh-CN")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}