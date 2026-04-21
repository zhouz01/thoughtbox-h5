import { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { getActiveProfile, loadProfiles } from "../aiConfig";
import {
  getSyncConfig,
  getSyncSession,
  getSyncMeta,
  getSyncLog,
  getDeviceName,
} from "../syncConfig";
import {
  createLocalBackup,
  getLocalBackups,
  restoreFromLocalBackup,
} from "../syncService";
import { loadVisibleRecords } from "../storage";
import {
  loadVisibleSyntheses,
} from "../synthesisStorage";
import {
  loadVisibleBriefs,
} from "../briefStorage";

// ============================================================
// 相对时间格式化
// ============================================================
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return `${Math.floor(d / 30)} 个月前`;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    records,
    importRecordsMerge,
    importRecordsOverwrite,
    exportRecords,
    importMockRecords,
    reloadFromStorage,
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- AI 状态摘要 ----
  const aiSummary = useMemo(() => {
    const active = getActiveProfile();
    const profiles = loadProfiles();
    if (!active || !active.enabled) {
      return {
        status: profiles.length === 0 ? "未配置" : "未启用",
        label: "当前使用本地整理",
        model: "-",
        name: "-",
      };
    }
    return {
      status: "已启用",
      label: active.name,
      model: active.model,
      name: active.name,
    };
  }, []);

  // ---- 同步状态摘要 ----
  const syncSummary = useMemo(() => {
    const config = getSyncConfig();
    const session = getSyncSession();
    const meta = getSyncMeta();
    const logs = getSyncLog();

    if (!config.supabaseUrl) {
      return {
        status: "未配置" as const,
        email: "",
        lastSync: "",
        device: getDeviceName(),
      };
    }
    if (!session) {
      return {
        status: "未登录" as const,
        email: config.syncEmail || "",
        lastSync: "",
        device: getDeviceName(),
      };
    }

    const lastLog = logs.find((l) => l.status === "success");
    return {
      status: "已连接" as const,
      email: session.email,
      lastSync: lastLog ? relativeTime(lastLog.timestamp) : "",
      device: meta.deviceName || getDeviceName(),
    };
  }, []);

  // ---- 本地数据统计 ----
  const localStats = useMemo(() => {
    const syntheses = loadVisibleSyntheses();
    const briefs = loadVisibleBriefs();
    return {
      records: records.length,
      syntheses: syntheses.length,
      briefs: briefs.length,
    };
  }, [records]);

  // ---- 备份列表 ----
  const [backups, setBackups] = useState(() => getLocalBackups());

  // ---- 导出弹层状态 ----
  const [showExportSheet, setShowExportSheet] = useState(false);

  // ---- 导入弹层状态 ----
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  // ---- 备份状态 ----
  const [backupMessage, setBackupMessage] = useState("");
  const [restoring, setRestoring] = useState(false);

  // ---- Toast ----
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // ============================================================
  // 导出
  // ============================================================
  const handleExport = () => {
    const json = exportRecords();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thoughtbox-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportSheet(false);
    showToast("数据已导出");
  };

  // ============================================================
  // 导入
  // ============================================================
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(data)) {
          setImportMessage("文件格式不正确，请选择 ThoughtBox 导出的 JSON 文件");
          return;
        }
        setImporting(true);
        setImportMessage("");
        if (importMode === "overwrite") {
          importRecordsOverwrite(data);
        } else {
          importRecordsMerge(data);
        }
        reloadFromStorage();
        setImporting(false);
        setShowImportSheet(false);
        showToast(importMode === "overwrite" ? "数据已覆盖导入" : "数据已合并导入");
      } catch {
        setImportMessage("文件解析失败，请检查文件格式");
        setImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ============================================================
  // 备份与恢复
  // ============================================================
  const handleCreateBackup = () => {
    try {
      createLocalBackup("手动备份");
      setBackups(getLocalBackups());
      showToast("本地备份已创建");
    } catch {
      showToast("备份创建失败");
    }
  };

  const handleRestoreBackup = (backupId: string) => {
    if (!confirm("恢复备份将覆盖当前数据，确定要继续吗？")) return;
    setRestoring(true);
    try {
      const ok = restoreFromLocalBackup(backupId);
      if (ok) {
        reloadFromStorage();
        setBackups(getLocalBackups());
        showToast("已从备份恢复");
      } else {
        showToast("恢复失败，备份可能已损坏");
      }
    } catch {
      showToast("恢复出错");
    } finally {
      setRestoring(false);
    }
  };

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="min-h-screen bg-stone-50 pb-8">
      {/* ====== 1. 顶部导航栏 ====== */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-lg border-b border-stone-100">
        <div className="max-w-lg mx-auto flex items-center h-12 px-4">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center -ml-1 text-stone-500 active:bg-stone-100 rounded-lg"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="flex-1 text-center text-[15px] font-semibold text-stone-800">设置与数据</span>
          <div className="w-8" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        {/* ====== 2. 当前使用状态总览 ====== */}
        <section>
          <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2.5 px-0.5">当前状态</h3>
          <div className="bg-white rounded-2xl border border-stone-200/60 p-4 space-y-3">
            {/* AI 状态行 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${aiSummary.status === "已启用" ? "bg-indigo-500" : aiSummary.status === "未配置" ? "bg-stone-300" : "bg-amber-400"}`} />
                <span className="text-[13px] text-stone-600">AI 整理</span>
              </div>
              <span className="text-[13px] font-medium text-stone-800">{aiSummary.status}</span>
            </div>
            {aiSummary.status === "已启用" && (
              <div className="flex items-center justify-between pl-4.5">
                <span className="text-[12px] text-stone-400">当前配置 · {aiSummary.name}</span>
                <span className="text-[12px] text-stone-500">{aiSummary.model}</span>
              </div>
            )}

            <div className="border-t border-stone-100" />

            {/* 同步状态行 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${syncSummary.status === "已连接" ? "bg-emerald-500" : syncSummary.status === "未配置" ? "bg-stone-300" : "bg-amber-400"}`} />
                <span className="text-[13px] text-stone-600">数据同步</span>
              </div>
              <span className="text-[13px] font-medium text-stone-800">{syncSummary.status}</span>
            </div>
            {syncSummary.status === "已连接" && (
              <div className="flex items-center justify-between pl-4.5">
                <span className="text-[12px] text-stone-400">{syncSummary.email}</span>
                {syncSummary.lastSync && (
                  <span className="text-[12px] text-stone-500">最近同步 {syncSummary.lastSync}</span>
                )}
              </div>
            )}

            <div className="border-t border-stone-100" />

            {/* 设备 */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-stone-600">当前设备</span>
              <span className="text-[13px] text-stone-500">{syncSummary.device}</span>
            </div>
          </div>
        </section>

        {/* ====== 3. AI 设置入口卡片 ====== */}
        <section>
          <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2.5 px-0.5">AI 设置</h3>
          <button
            onClick={() => navigate("/settings/ai")}
            className="w-full text-left bg-white rounded-2xl border border-stone-200/60 p-4 active:bg-stone-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${aiSummary.status === "已启用" ? "bg-indigo-50 text-indigo-600" : "bg-stone-100 text-stone-500"}`}>
                    {aiSummary.status}
                  </span>
                  {aiSummary.status === "已启用" && (
                    <span className="text-[12px] text-stone-500">{aiSummary.name}</span>
                  )}
                </div>
                {aiSummary.status === "已启用" ? (
                  <p className="text-[12px] text-stone-400">模型：{aiSummary.model}</p>
                ) : (
                  <p className="text-[12px] text-stone-400">配置 AI 后可自动整理记录</p>
                )}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300 mt-1 shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
            <div className="mt-3 pt-3 border-t border-stone-100">
              <span className="text-[13px] font-medium text-indigo-600">进入 AI 设置</span>
            </div>
          </button>

          {/* AI 校准次级入口 */}
          <button
            onClick={() => navigate("/lab/ai")}
            className="w-full text-left mt-2 bg-stone-50/50 rounded-xl border border-dashed border-stone-200 p-3 active:bg-stone-100 transition-colors flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
              </svg>
              <span className="text-[12px] text-stone-500">AI 校准</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </section>

        {/* ====== 4. 数据同步入口卡片 ====== */}
        <section>
          <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2.5 px-0.5">数据同步</h3>
          <button
            onClick={() => navigate("/settings/sync")}
            className="w-full text-left bg-white rounded-2xl border border-stone-200/60 p-4 active:bg-stone-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${syncSummary.status === "已连接" ? "bg-emerald-50 text-emerald-600" : syncSummary.status === "未配置" ? "bg-stone-100 text-stone-500" : "bg-amber-50 text-amber-600"}`}>
                    {syncSummary.status}
                  </span>
                  {syncSummary.status === "已连接" && (
                    <span className="text-[12px] text-stone-500">{syncSummary.email}</span>
                  )}
                </div>
                {syncSummary.status === "已连接" ? (
                  <p className="text-[12px] text-stone-400">上次同步：{syncSummary.lastSync || "未知"}</p>
                ) : syncSummary.status === "未登录" ? (
                  <p className="text-[12px] text-stone-400">已配置但未登录</p>
                ) : (
                  <p className="text-[12px] text-stone-400">配置后可在设备间同步数据</p>
                )}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300 mt-1 shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
            <div className="mt-3 pt-3 border-t border-stone-100">
              <span className="text-[13px] font-medium text-violet-600">进入数据同步</span>
            </div>
          </button>
        </section>

        {/* ====== 5. 数据工具区 ====== */}
        <section>
          <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2.5 px-0.5">数据工具</h3>
          <div className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden">
            {/* 导出数据 */}
            <button
              onClick={() => setShowExportSheet(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-stone-50 transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </span>
              <div className="flex-1 text-left">
                <p className="text-[13px] font-medium text-stone-800">导出数据</p>
                <p className="text-[11px] text-stone-400">{localStats.records} 条记录 · {localStats.syntheses} 个汇总 · {localStats.briefs} 个推进卡</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300 shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>

            <div className="mx-4 border-t border-stone-100" />

            {/* 导入数据 */}
            <button
              onClick={() => { setShowImportSheet(true); setImportMessage(""); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-stone-50 transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </span>
              <div className="flex-1 text-left">
                <p className="text-[13px] font-medium text-stone-800">导入数据</p>
                <p className="text-[11px] text-stone-400">从 JSON 文件导入记录</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300 shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>

            <div className="mx-4 border-t border-stone-100" />

            {/* 创建本地备份 */}
            <button
              onClick={handleCreateBackup}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-stone-50 transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </span>
              <div className="flex-1 text-left">
                <p className="text-[13px] font-medium text-stone-800">创建本地备份</p>
                <p className="text-[11px] text-stone-400">保存当前数据快照到浏览器</p>
              </div>
            </button>

            {/* 从备份恢复（有备份时显示） */}
            {backups.length > 0 && (
              <>
                <div className="mx-4 border-t border-stone-100" />
                <div className="px-4 py-3">
                  <p className="text-[12px] text-stone-400 mb-2">最近备份</p>
                  <div className="space-y-1.5">
                    {backups.slice(0, 3).map((b) => (
                      <div key={b.id} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-stone-600 truncate">{b.reason || "自动备份"}</p>
                          <p className="text-[11px] text-stone-400">{relativeTime(b.timestamp)}</p>
                        </div>
                        <button
                          onClick={() => handleRestoreBackup(b.id)}
                          disabled={restoring}
                          className="ml-2 px-2.5 py-1 rounded-lg text-[11px] font-medium text-stone-600 bg-stone-100 active:bg-stone-200 disabled:opacity-50 shrink-0"
                        >
                          恢复
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* 导入示例数据（无记录时） */}
            {records.length === 0 && (
              <>
                <div className="mx-4 border-t border-stone-100" />
                <button
                  onClick={() => { importMockRecords(); showToast("示例数据已导入"); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-stone-50 transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </span>
                  <div className="flex-1 text-left">
                    <p className="text-[13px] font-medium text-stone-800">导入示例数据</p>
                    <p className="text-[11px] text-stone-400">快速体验功能</p>
                  </div>
                </button>
              </>
            )}
          </div>
        </section>

        {/* ====== 6. 隐私与安全说明 ====== */}
        <section>
          <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2.5 px-0.5">隐私与安全</h3>
          <div className="bg-white rounded-2xl border border-stone-200/60 p-4 space-y-2.5">
            {[
              "AI 密钥只保存在当前设备本地",
              "AI 密钥不会同步到云端",
              "不登录也可以继续本地使用",
              "同步前建议先创建本地备份",
              "在手机和电脑之间同步，请使用同一个同步账号",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300 mt-0.5 shrink-0">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <p className="text-[12px] text-stone-500">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ====== 7. 本地状态信息 ====== */}
        <section>
          <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2.5 px-0.5">本地数据</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "记录", value: localStats.records, color: "text-stone-800" },
              { label: "汇总", value: localStats.syntheses, color: "text-stone-800" },
              { label: "推进卡", value: localStats.briefs, color: "text-stone-800" },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-xl border border-stone-200/60 p-3 text-center">
                <p className={`text-lg font-semibold ${item.color}`}>{item.value}</p>
                <p className="text-[11px] text-stone-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ====== 导出弹层 ====== */}
      {showExportSheet && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowExportSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl animate-slide-up">
            <div className="max-w-lg mx-auto p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-semibold text-stone-800">导出数据</h3>
                <button onClick={() => setShowExportSheet(false)} className="w-8 h-8 flex items-center justify-center text-stone-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-stone-500">记录</span>
                  <span className="text-stone-800 font-medium">{localStats.records} 条</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-stone-500">汇总</span>
                  <span className="text-stone-800 font-medium">{localStats.syntheses} 个</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-stone-500">推进卡</span>
                  <span className="text-stone-800 font-medium">{localStats.briefs} 个</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-stone-500">偏好数据</span>
                  <span className="text-stone-800 font-medium">已保存</span>
                </div>
              </div>
              <button
                onClick={handleExport}
                className="w-full py-3 rounded-xl bg-stone-900 text-white text-[14px] font-medium active:bg-stone-800 transition-colors"
              >
                确认导出
              </button>
            </div>
          </div>
        </>
      )}

      {/* ====== 导入弹层 ====== */}
      {showImportSheet && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowImportSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl animate-slide-up">
            <div className="max-w-lg mx-auto p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-semibold text-stone-800">导入数据</h3>
                <button onClick={() => setShowImportSheet(false)} className="w-8 h-8 flex items-center justify-center text-stone-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <p className="text-[12px] text-stone-500 mb-4">选择导入方式：</p>

              <div className="space-y-2.5 mb-5">
                <label className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors border-stone-900 bg-stone-50">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === "merge"}
                    onChange={() => setImportMode("merge")}
                    className="accent-stone-900"
                  />
                  <div>
                    <p className="text-[13px] font-medium text-stone-800">合并导入</p>
                    <p className="text-[11px] text-stone-400">保留现有数据，追加新记录</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors border-stone-200">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === "overwrite"}
                    onChange={() => setImportMode("overwrite")}
                    className="accent-stone-900"
                  />
                  <div>
                    <p className="text-[13px] font-medium text-stone-800">覆盖当前数据</p>
                    <p className="text-[11px] text-rose-400">⚠️ 将清除现有数据，不可撤销</p>
                  </div>
                </label>
              </div>

              {importMessage && (
                <p className={`text-[12px] mb-3 ${importMessage.includes("失败") || importMessage.includes("不正确") ? "text-rose-500" : "text-emerald-600"}`}>
                  {importMessage}
                </p>
              )}

              <button
                onClick={() => {
                  if (importMode === "overwrite") {
                    if (!confirm("覆盖导入将清除所有现有数据，此操作不可撤销。确定继续吗？")) return;
                  }
                  fileInputRef.current?.click();
                }}
                disabled={importing}
                className="w-full py-3 rounded-xl bg-stone-900 text-white text-[14px] font-medium active:bg-stone-800 transition-colors disabled:opacity-50"
              >
                {importing ? "导入中…" : "选择文件并导入"}
              </button>
            </div>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* ====== Toast ====== */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-stone-800 text-white text-[13px] px-4 py-2 rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
