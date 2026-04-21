import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import type { AIProfile, TestStatus } from "../types";

export default function AISettingsPage() {
  const navigate = useNavigate();
  const {
    profiles,
    activeProfile,
    addAIProfile,
    updateAIProfile,
    deleteAIProfile,
    duplicateAIProfile,
    switchAIProfile,
    testConnection,
  } = useApp();

  const [editingProfile, setEditingProfile] = useState<AIProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  // 打开新增表单
  const handleAdd = () => {
    const newProfile: AIProfile = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: "",
      enabled: true,
      isActive: profiles.length === 0,
      apiBaseUrl: "https://api.bltcy.ai",
      apiKey: "",
      model: "gpt-5.4-nano-2026-03-17",
      timeoutMs: 20000,
      fallbackToMock: true,
      allowAsBackup: false,
      providerType: "openai_compatible",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastTestStatus: "untested",
    };
    setEditingProfile(newProfile);
    setShowForm(true);
  };

  // 打开编辑表单
  const handleEdit = (profile: AIProfile) => {
    setEditingProfile({ ...profile });
    setShowForm(true);
  };

  // 保存
  const handleSave = (profile: AIProfile) => {
    if (profiles.find((p) => p.id === profile.id)) {
      updateAIProfile(profile);
    } else {
      addAIProfile(profile);
    }
    setShowForm(false);
    setEditingProfile(null);
  };

  // 设为当前
  const handleSetActive = (id: string) => {
    switchAIProfile(id);
  };

  // 复制
  const handleDuplicate = (id: string) => {
    duplicateAIProfile(id);
  };

  // 删除
  const handleDelete = (id: string) => {
    deleteAIProfile(id);
    setDeleteConfirm(null);
  };

  // 测试连接
  const handleTest = async (profile: AIProfile) => {
    setTesting(profile.id);
    setTestResult(null);
    const result = await testConnection(profile);
    setTestResult({ id: profile.id, ...result });
    setTesting(null);
  };

  // 表单中的测试连接
  const handleFormTest = async () => {
    if (!editingProfile) return;
    setTesting(editingProfile.id);
    setTestResult(null);
    const result = await testConnection(editingProfile);
    setTestResult({ id: editingProfile.id, ...result });
    setTesting(null);
    setEditingProfile({
      ...editingProfile,
      lastTestStatus: result.ok ? "success" : "failed",
      lastTestAt: new Date().toISOString(),
      lastError: result.ok ? undefined : result.message,
    });
  };

  // 当前状态计算
  const anyEnabled = profiles.some((p) => p.enabled);
  const currentMethod = activeProfile
    ? activeProfile.allowAsBackup
      ? "备用配置"
      : "主力模型"
    : anyEnabled
    ? "未选择配置"
    : "本地整理";
  const recentTest = activeProfile?.lastTestStatus === "success"
    ? "连接成功"
    : activeProfile?.lastTestStatus === "failed"
    ? "连接失败"
    : "未测试";

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
        <h1 className="text-[13px] font-semibold text-stone-900">AI 设置</h1>
        <div className="min-w-[48px]" />
      </div>

      {/* ====== 内容区 ====== */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {/* ====== 2. 当前状态卡片 ====== */}
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "20ms" }}>
          <SectionLabel>当前状态</SectionLabel>
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              <StatusRow label="真实 AI" value={anyEnabled ? "已启用" : "未启用"} valueClass={anyEnabled ? "text-emerald-600" : "text-stone-400"} />
              <StatusRow label="当前方式" value={currentMethod} />
              <StatusRow label="最近测试" value={recentTest} valueClass={activeProfile?.lastTestStatus === "success" ? "text-emerald-600" : activeProfile?.lastTestStatus === "failed" ? "text-rose-500" : "text-stone-400"} />
              <StatusRow label="当前模型" value={activeProfile?.model || "—"} />
            </div>
          </div>
        </section>

        {/* ====== 3. 当前激活配置 ====== */}
        {activeProfile && (
          <section className="mb-5 animate-fade-in" style={{ animationDelay: "40ms" }}>
            <SectionLabel>当前激活配置</SectionLabel>
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-stone-800 truncate">{activeProfile.name || "未命名"}</h3>
                    <span className="shrink-0 px-2 py-[2px] rounded-md bg-indigo-100 text-indigo-600 text-[10px] font-medium">使用中</span>
                  </div>
                  <p className="text-[12px] text-stone-500 mt-1">{activeProfile.model}</p>
                  <p className="text-[11px] text-stone-400 mt-0.5 truncate">{shortenUrl(activeProfile.apiBaseUrl)}</p>
                </div>
                <button onClick={() => handleEdit(activeProfile)} className="text-[12px] text-indigo-600 font-medium ml-3 shrink-0">编辑</button>
              </div>
              {activeProfile.lastTestStatus && activeProfile.lastTestStatus !== "untested" && (
                <div className="mt-2 flex items-center gap-1.5">
                  <TestStatusDot status={activeProfile.lastTestStatus} />
                  <span className="text-[10px] text-stone-400">
                    {activeProfile.lastTestStatus === "success" ? "测试通过" : "测试失败"}
                    {activeProfile.lastTestAt && ` · ${formatRelativeTime(activeProfile.lastTestAt)}`}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-indigo-100/60">
                <button
                  onClick={() => handleTest(activeProfile)}
                  disabled={testing === activeProfile.id}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white text-stone-600 active:bg-stone-50 transition-colors disabled:opacity-50"
                >
                  {testing === activeProfile.id ? "测试中…" : "测试连接"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ====== 4. 全部配置列表 ====== */}
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>全部配置</SectionLabel>
            <button
              onClick={handleAdd}
              className="text-[11px] font-semibold text-indigo-600 active:text-indigo-500 transition-colors"
            >
              + 新增配置
            </button>
          </div>
          {profiles.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-stone-400 text-sm">还没有配置</p>
              <p className="text-stone-300 text-xs mt-1">点击「新增配置」添加 AI 配置</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  isActive={profile.id === activeProfile?.id}
                  testing={testing === profile.id}
                  testResult={testResult?.id === profile.id ? testResult : null}
                  onSetActive={() => handleSetActive(profile.id)}
                  onEdit={() => handleEdit(profile)}
                  onDuplicate={() => handleDuplicate(profile.id)}
                  onDelete={() => setDeleteConfirm(profile.id)}
                  onTest={() => handleTest(profile)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ====== 5. 说明区 ====== */}
        <section className="mb-5 animate-fade-in" style={{ animationDelay: "80ms" }}>
          <SectionLabel>说明</SectionLabel>
          <div className="bg-white rounded-2xl p-4 border border-stone-200/50 space-y-2">
            <p className="text-[12px] text-stone-500 leading-relaxed">密钥只保存在当前浏览器</p>
            <p className="text-[12px] text-stone-500 leading-relaxed">不会写入代码，也不会同步到云端</p>
            <p className="text-[12px] text-stone-500 leading-relaxed">如果在手机和电脑都要使用，需要分别填写一次</p>
          </div>
        </section>

        {/* 整理偏好入口 */}
        <button
          onClick={() => navigate("/settings/preferences")}
          className="w-full bg-white rounded-2xl p-4 border border-stone-200/50 flex items-center justify-between hover:bg-stone-50 active:bg-stone-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-[3px] h-3.5 rounded-full bg-violet-400" />
            <div className="text-left">
              <p className="text-[13px] font-semibold text-stone-800">整理偏好</p>
              <p className="text-[11px] text-stone-400 mt-0.5">管理 AI 整理学习偏好</p>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* AI 校准入口 */}
        <button
          onClick={() => navigate("/lab/ai")}
          className="w-full bg-white rounded-2xl p-4 border border-stone-200/50 flex items-center justify-between hover:bg-stone-50 active:bg-stone-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-[3px] h-3.5 rounded-full bg-amber-400" />
            <div className="text-left">
              <p className="text-[13px] font-semibold text-stone-800">AI 校准</p>
              <p className="text-[11px] text-stone-400 mt-0.5">测试和校准 AI 整理质量</p>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

      </div>

      {/* ====== 编辑/新增表单弹窗 ====== */}
      {showForm && editingProfile && (
        <ProfileFormSheet
          profile={editingProfile}
          isNew={!profiles.find((p) => p.id === editingProfile.id)}
          testing={testing === editingProfile.id}
          testResult={testResult?.id === editingProfile.id ? testResult : null}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingProfile(null); }}
          onChange={setEditingProfile}
          onTest={handleFormTest}
        />
      )}

      {/* ====== 删除确认弹窗 ====== */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={() => setDeleteConfirm(null)}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up safe-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5" />
            <h3 className="text-[15px] font-semibold text-stone-900 mb-2">确认删除</h3>
            <p className="text-[13px] text-stone-500 mb-6 leading-relaxed">
              {deleteConfirm === activeProfile?.id
                ? "这是当前正在使用的配置，删除后将自动切换到其他可用配置。"
                : "删除后无法恢复，请确认。"}
              {profiles.length <= 1 && " 删除后将无法使用真实 AI 整理。"}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors">取消</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-rose-500 text-white active:bg-rose-600 transition-colors">删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== 子组件 ========== */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-[3px] h-3.5 rounded-full bg-indigo-400" />
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

function ProfileCard({
  profile, isActive, testing, testResult,
  onSetActive, onEdit, onDuplicate, onDelete, onTest,
}: {
  profile: AIProfile; isActive: boolean; testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onSetActive: () => void; onEdit: () => void; onDuplicate: () => void;
  onDelete: () => void; onTest: () => void;
}) {
  const statusLabel = isActive ? "当前使用中" : profile.enabled ? (profile.allowAsBackup ? "可作为备用" : "已启用") : "已停用";
  const statusColor = isActive ? "bg-indigo-50 text-indigo-600" : profile.enabled ? (profile.allowAsBackup ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600") : "bg-stone-100 text-stone-400";

  return (
    <div className={`bg-white rounded-2xl p-4 border ${isActive ? "border-indigo-200" : "border-stone-200/50"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[13px] font-semibold text-stone-800 truncate">{profile.name || "未命名"}</h3>
            <span className={`shrink-0 px-1.5 py-[1px] rounded text-[9px] font-medium ${statusColor}`}>{statusLabel}</span>
          </div>
          <p className="text-[12px] text-stone-500 mt-0.5">{profile.model}</p>
          <p className="text-[11px] text-stone-400 truncate">{shortenUrl(profile.apiBaseUrl)}</p>
          {profile.lastTestStatus && profile.lastTestStatus !== "untested" && (
            <div className="flex items-center gap-1.5 mt-1">
              <TestStatusDot status={profile.lastTestStatus} />
              <span className="text-[10px] text-stone-400">{profile.lastTestStatus === "success" ? "测试通过" : "测试失败"}</span>
            </div>
          )}
          {testResult && (
            <p className={`text-[11px] mt-1 ${testResult.ok ? "text-emerald-600" : "text-rose-500"}`}>{testResult.message}</p>
          )}
        </div>
      </div>
      {/* 操作按钮 */}
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-stone-100 flex-wrap">
        {!isActive && profile.enabled && (
          <button onClick={onSetActive} className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors">设为当前</button>
        )}
        <button onClick={onTest} disabled={testing} className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-stone-50 text-stone-600 active:bg-stone-100 transition-colors disabled:opacity-50">{testing ? "测试中…" : "测试"}</button>
        <button onClick={onEdit} className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-stone-50 text-stone-600 active:bg-stone-100 transition-colors">编辑</button>
        <button onClick={onDuplicate} className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-stone-50 text-stone-600 active:bg-stone-100 transition-colors">复制</button>
        <button onClick={onDelete} className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-stone-50 text-rose-500 active:bg-rose-50 transition-colors ml-auto">删除</button>
      </div>
    </div>
  );
}

/* ========== 编辑/新增表单弹窗 ========== */

function ProfileFormSheet({
  profile, isNew, testing, testResult,
  onSave, onClose, onChange, onTest,
}: {
  profile: AIProfile; isNew: boolean; testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onSave: (p: AIProfile) => void; onClose: () => void;
  onChange: (p: AIProfile) => void; onTest: () => void;
}) {
  const [showKey, setShowKey] = useState(false);

  const update = (partial: Partial<AIProfile>) => {
    onChange({ ...profile, ...partial });
  };

  const canSave = profile.name.trim() && profile.apiBaseUrl.trim() && profile.apiKey.trim() && profile.model.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-3xl animate-slide-up safe-bottom max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mt-4 mb-2 shrink-0" />
        <h3 className="text-[15px] font-semibold text-stone-900 px-6 mb-4 shrink-0">{isNew ? "新增配置" : "编辑配置"}</h3>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-5">
            {/* ====== 基础信息区 ====== */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">基础信息</h4>
              <FormField label="配置名称">
                <input type="text" value={profile.name} onChange={(e) => update({ name: e.target.value })} placeholder="如：主力模型、备用模型" className="w-full px-3 py-2.5 bg-stone-50 rounded-xl text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 placeholder:text-stone-300 transition-all" />
              </FormField>
              <ToggleRow label="启用真实 AI 整理" value={profile.enabled} onChange={(v) => update({ enabled: v })} />
            </div>

            {/* ====== 连接信息区 ====== */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">连接信息</h4>
              <FormField label="接口地址">
                <input type="url" value={profile.apiBaseUrl} onChange={(e) => update({ apiBaseUrl: e.target.value })} placeholder="https://api.example.ai 或完整路径" className="w-full px-3 py-2.5 bg-stone-50 rounded-xl text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 placeholder:text-stone-300 transition-all" />
              </FormField>
              <FormField label="密钥">
                <div className="relative">
                  <input type={showKey ? "text" : "password"} value={profile.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder="sk-..." className="w-full px-3 py-2.5 pr-12 bg-stone-50 rounded-xl text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 placeholder:text-stone-300 transition-all" />
                  <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors">
                    {showKey ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </FormField>
              <FormField label="模型名称">
                <input type="text" value={profile.model} onChange={(e) => update({ model: e.target.value })} placeholder="gpt-4o-mini" className="w-full px-3 py-2.5 bg-stone-50 rounded-xl text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 placeholder:text-stone-300 transition-all" />
              </FormField>
              <FormField label="请求超时（毫秒）">
                <input type="number" value={profile.timeoutMs} onChange={(e) => update({ timeoutMs: parseInt(e.target.value) || 20000 })} className="w-full px-3 py-2.5 bg-stone-50 rounded-xl text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all" />
              </FormField>
            </div>

            {/* ====== 行为设置区 ====== */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">行为设置</h4>
              <ToggleRow label="整理失败时回退到本地整理" value={profile.fallbackToMock} onChange={(v) => update({ fallbackToMock: v })} />
              <ToggleRow label="允许作为备用配置" value={profile.allowAsBackup} onChange={(v) => update({ allowAsBackup: v })} />
            </div>

            {/* ====== 说明区 ====== */}
            <div className="bg-stone-50 rounded-xl p-3 space-y-1">
              <p className="text-[11px] text-stone-400">密钥仅保存在当前设备本地</p>
              <p className="text-[11px] text-stone-400">不会同步到云端</p>
              <p className="text-[11px] text-stone-400">更换设备后需要重新填写</p>
            </div>

            {/* 测试结果 */}
            {testResult && (
              <div className={`rounded-xl p-3 ${testResult.ok ? "bg-emerald-50" : "bg-rose-50"}`}>
                <p className={`text-[12px] ${testResult.ok ? "text-emerald-700" : "text-rose-600"}`}>{testResult.message}</p>
              </div>
            )}
          </div>
        </div>

        {/* ====== 底部按钮区 ====== */}
        <div className="flex gap-3 px-6 py-4 border-t border-stone-100 shrink-0">
          <button onClick={onTest} disabled={testing || !profile.apiKey || !profile.apiBaseUrl} className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors disabled:opacity-50">{testing ? "测试中…" : "测试连接"}</button>
          <button onClick={() => onSave(profile)} disabled={!canSave} className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors disabled:opacity-50">保存配置</button>
        </div>
      </div>
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
      <button onClick={() => onChange(!value)} className={`w-10 h-[22px] rounded-full transition-colors duration-200 relative ${value ? "bg-indigo-500" : "bg-stone-300"}`}>
        <span className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? "translate-x-[20px]" : "translate-x-[2px]"}`} />
      </button>
    </div>
  );
}

function TestStatusDot({ status }: { status: TestStatus }) {
  if (status === "success") return <span className="shrink-0 w-[6px] h-[6px] rounded-full bg-emerald-400" />;
  if (status === "failed") return <span className="shrink-0 w-[6px] h-[6px] rounded-full bg-rose-400" />;
  return <span className="shrink-0 w-[6px] h-[6px] rounded-full bg-stone-300" />;
}

/* ========== 工具函数 ========== */

function shortenUrl(url: string): string {
  try { return new URL(url).hostname; } catch { return url.slice(0, 30); }
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
