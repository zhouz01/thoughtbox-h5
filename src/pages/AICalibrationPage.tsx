import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { getActiveProfile, loadProfiles, isProfileConfigured } from "../aiConfig";
import { extractTopicContext, buildPreferenceContext, organizeForCalibration } from "../aiService";
import type { AIOrganizeResult, CalibrationDiagnostic } from "../aiService";
import { loadPreferences, addAcceptedExample, savePreferences } from "../preferences";
import type { RecordType, AIProfile, AIPreferences } from "../types";
import {
  loadCalibrationSamples,
  saveCalibrationSamples,
  addCalibrationSample,
  deleteCalibrationSample,
  toggleKeySample,
  updateCalibrationSample,
  loadLastInput,
  saveLastInput,
  loadLastExpectation,
  saveLastExpectation,
  loadBatchResult,
  saveBatchResult,
  runQualityCheck,
  type CalibrationSample,
  type CalibrationExpectation,
  type CalibrationTestResult,
  type BatchTestSummary,
  type QualityLevel,
} from "../calibrationStorage";

// ============================================================
// 工具函数
// ============================================================

function maskKey(key: string): string {
  if (!key) return "（未设置）";
  if (key.length <= 8) return "****";
  return key.slice(0, 3) + "****" + key.slice(-3);
}

function qualityColor(q: QualityLevel): string {
  switch (q) {
    case "通过": return "text-emerald-600 bg-emerald-50";
    case "需注意": return "text-amber-600 bg-amber-50";
    case "明显不合理": return "text-rose-600 bg-rose-50";
  }
}

function parseStatusColor(s: string): string {
  if (s === "直接解析成功") return "text-emerald-600";
  if (s === "从代码块中提取") return "text-amber-600";
  return "text-rose-600";
}

// ============================================================
// 主组件
// ============================================================

export default function AICalibrationPage() {
  const navigate = useNavigate();
  const { records } = useApp();
  const profiles = loadProfiles();
  const activeProfile = getActiveProfile();
  const prefs = loadPreferences();

  // ---- 状态 ----
  const [inputText, setInputText] = useState(loadLastInput());
  const [selectedProfileId, setSelectedProfileId] = useState(activeProfile?.id || "");
  const [useActiveConfig, setUseActiveConfig] = useState(true);
  const [allowFallback, setAllowFallback] = useState(true);
  const [showDebugDetail, setShowDebugDetail] = useState(true);
  const [useRealContext, setUseRealContext] = useState(true);
  const [ignorePreferences, setIgnorePreferences] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [diagnostic, setDiagnostic] = useState<CalibrationDiagnostic | null>(null);
  const [resultVerdict, setResultVerdict] = useState<"acceptable" | "unacceptable" | null>(null);

  const [expectation, setExpectation] = useState<CalibrationExpectation>(loadLastExpectation() || {
    expectedType: "随记",
    expectedHasSuggestions: false,
  });

  const [samples, setSamples] = useState<CalibrationSample[]>(loadCalibrationSamples());
  const [batchResult, setBatchResult] = useState<BatchTestSummary | null>(loadBatchResult());
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    env: true, input: true, output: true, diagnostic: true, expectation: false, samples: false, batch: false, privacy: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- 上下文 ----
  const topicCtx = useRealContext ? extractTopicContext(records) : undefined;
  const prefCtx = useRealContext && !ignorePreferences ? buildPreferenceContext(prefs) : undefined;

  // ---- 获取选中 profile ----
  const getSelectedProfile = useCallback((): AIProfile | null => {
    if (useActiveConfig && activeProfile) return activeProfile;
    return profiles.find((p) => p.id === selectedProfileId) || null;
  }, [useActiveConfig, activeProfile, profiles, selectedProfileId]);

  // ---- 运行整理 ----
  const handleRun = useCallback(async () => {
    const profile = getSelectedProfile();
    if (!profile) { alert("请先选择一个 AI 配置"); return; }
    if (!inputText.trim()) { alert("请输入测试文本"); return; }

    saveLastInput(inputText.trim());
    setIsRunning(true);
    setDiagnostic(null);
    setResultVerdict(null);

    try {
      const diag = await organizeForCalibration(
        inputText.trim(),
        profile,
        topicCtx,
        prefCtx,
        ignorePreferences,
      );
      setDiagnostic(diag);
    } catch (err) {
      setDiagnostic({
        rawModelOutput: "",
        parseStatus: "最终回退本地整理",
        parsedRaw: null,
        corrections: [],
        blacklistHits: [],
        preferenceHits: [],
        retried: false,
        usedBackup: false,
        usedFallback: true,
        failureReason: err instanceof Error ? err.message : "未知错误",
        profileName: profile.name,
        modelName: profile.model,
        durationMs: 0,
        result: null,
      });
    } finally {
      setIsRunning(false);
    }
  }, [inputText, getSelectedProfile, topicCtx, prefCtx, ignorePreferences]);

  // ---- 重新运行 ----
  const handleRerun = () => handleRun();

  // ---- 保存为测试样本 ----
  const handleSaveAsSample = () => {
    if (!inputText.trim()) return;
    const sample = addCalibrationSample({
      name: inputText.trim().slice(0, 20),
      rawText: inputText.trim(),
      expectedType: expectation.expectedType,
      expectedTopic: expectation.expectedTopic,
      expectedHasSuggestions: expectation.expectedHasSuggestions,
      notes: expectation.notes,
      isKeySample: false,
    });
    setSamples(loadCalibrationSamples());
  };

  // ---- 保存为正向示例 ----
  const handleSaveAsPositive = () => {
    if (!diagnostic?.result) return;
    const example = {
      id: "cal_" + Date.now().toString(36),
      rawText: inputText.trim(),
      result: {
        title: diagnostic.result.title,
        summary: diagnostic.result.summary,
        type: diagnostic.result.type,
        tags: diagnostic.result.tags,
        topic: diagnostic.result.topic,
        promoteLevel: diagnostic.result.promoteLevel,
        suggestions: diagnostic.result.suggestions,
      },
      createdAt: new Date().toISOString(),
      source: "liked" as const,
    };
    const updated = addAcceptedExample(prefs, example);
    savePreferences(updated);
    alert("已保存为正向示例");
  };

  // ---- 将当前结果一键写入期望 ----
  const handleCopyResultToExpectation = () => {
    if (!diagnostic?.result) return;
    setExpectation({
      ...expectation,
      expectedType: diagnostic.result.type,
      expectedTopic: diagnostic.result.topic !== "未分类主题" ? diagnostic.result.topic : undefined,
      expectedHasSuggestions: diagnostic.result.suggestions.length > 0,
    });
    saveLastExpectation(expectation);
  };

  // ---- 清空结果 ----
  const handleClear = () => {
    setDiagnostic(null);
    setResultVerdict(null);
  };

  // ---- 从样本填入 ----
  const handleFillFromSample = (sample: CalibrationSample) => {
    setInputText(sample.rawText);
    setExpectation({
      expectedType: sample.expectedType,
      expectedTopic: sample.expectedTopic,
      expectedHasSuggestions: sample.expectedHasSuggestions,
      notes: sample.notes,
    });
    saveLastInput(sample.rawText);
  };

  // ---- 批量测试 ----
  const handleBatchTest = async (keyOnly: boolean) => {
    const profile = getSelectedProfile();
    if (!profile) { alert("请先选择一个 AI 配置"); return; }

    const targets = keyOnly ? samples.filter((s) => s.isKeySample) : samples;
    if (targets.length === 0) { alert("没有可测试的样本"); return; }

    setIsBatchRunning(true);
    const results: CalibrationTestResult[] = [];

    for (const sample of targets) {
      try {
        const diag = await organizeForCalibration(
          sample.rawText,
          profile,
          topicCtx,
          prefCtx,
          ignorePreferences,
        );
        if (diag.result) {
          const qualityCheck = runQualityCheck({
            title: diag.result.title,
            type: diag.result.type,
            tags: diag.result.tags,
            topic: diag.result.topic,
            suggestions: diag.result.suggestions,
            rawText: sample.rawText,
          }, {
            expectedType: sample.expectedType,
            expectedTopic: sample.expectedTopic,
            expectedHasSuggestions: sample.expectedHasSuggestions,
          });

          results.push({
            sampleId: sample.id,
            sampleName: sample.name,
            rawText: sample.rawText,
            actualResult: {
              title: diag.result.title,
              summary: diag.result.summary,
              type: diag.result.type,
              aiSubType: diag.result.aiSubType,
              typeConfidence: diag.result.typeConfidence,
              typeReason: diag.result.typeReason,
              tags: diag.result.tags,
              topic: diag.result.topic,
              promoteLevel: diag.result.promoteLevel,
              suggestions: diag.result.suggestions,
              organizeSource: diag.usedFallback ? "mock" : "ai",
              profileName: diag.profileName,
              modelName: diag.modelName,
              durationMs: diag.durationMs,
              usedBackup: diag.usedBackup,
              usedFallback: diag.usedFallback,
            },
            expectation: {
              expectedType: sample.expectedType,
              expectedTopic: sample.expectedTopic,
              expectedHasSuggestions: sample.expectedHasSuggestions,
            },
            qualityCheck,
            typeMatch: diag.result.type === sample.expectedType,
            topicReasonable: !sample.expectedTopic || diag.result.topic === sample.expectedTopic || diag.result.topic !== "未分类主题",
            suggestionPassed: sample.expectedHasSuggestions === undefined || diag.result.suggestions.length > 0 === sample.expectedHasSuggestions,
            testedAt: new Date().toISOString(),
          });
        }
      } catch {
        // skip failed
      }
    }

    const summary: BatchTestSummary = {
      totalSamples: targets.length,
      typeMatchCount: results.filter((r) => r.typeMatch).length,
      topicReasonableCount: results.filter((r) => r.topicReasonable).length,
      suggestionPassedCount: results.filter((r) => r.suggestionPassed).length,
      failedCount: targets.length - results.length,
      results,
      runAt: new Date().toISOString(),
    };

    saveBatchResult(summary);
    setBatchResult(summary);
    setIsBatchRunning(false);
  };

  // ---- 折叠 ----
  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ---- 配置列表（排除未启用的）----
  const enabledProfiles = profiles.filter((p) => p.enabled || p.id === activeProfile?.id);

  // ---- 质量检查（用于当前结果）----
  const currentQuality = diagnostic?.result ? runQualityCheck({
    title: diagnostic.result.title,
    type: diagnostic.result.type,
    tags: diagnostic.result.tags,
    topic: diagnostic.result.topic,
    suggestions: diagnostic.result.suggestions,
    rawText: inputText,
  }, expectation) : null;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* 1. 顶部导航栏 */}
      <div className="sticky top-0 z-30 bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto flex items-center h-12 px-4">
          <button onClick={() => navigate(-1)} className="text-stone-500 hover:text-stone-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="flex-1 text-center text-[15px] font-medium text-stone-800">AI 校准</h1>
          <div className="w-5" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* 2. 当前运行环境卡片 */}
        <Section title="当前运行环境" expanded={expandedSections.env} onToggle={() => toggleSection("env")}>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between">
              <span className="text-stone-500">AI 模式</span>
              <span className={activeProfile?.enabled ? "text-emerald-600" : "text-stone-400"}>
                {activeProfile?.enabled ? "真实 AI" : "本地整理"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">当前配置</span>
              <span className="text-stone-700">{activeProfile?.name || "未配置"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">当前模型</span>
              <span className="text-stone-700">{activeProfile?.model || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">接口地址</span>
              <span className="text-stone-700 text-[12px]">
                {activeProfile?.apiBaseUrl ? new URL(activeProfile.apiBaseUrl).hostname : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">API Key</span>
              <span className="text-stone-400 font-mono text-[12px]">{maskKey(activeProfile?.apiKey || "")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">回退到本地整理</span>
              <span className={activeProfile?.fallbackToMock ? "text-emerald-600" : "text-stone-400"}>
                {activeProfile?.fallbackToMock ? "已启用" : "未启用"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">备用配置</span>
              <span className="text-stone-700">
                {profiles.filter((p) => p.id !== activeProfile?.id && p.enabled && p.allowAsBackup).length > 0
                  ? `有 ${profiles.filter((p) => p.id !== activeProfile?.id && p.enabled && p.allowAsBackup).length} 个`
                  : "无"}
              </span>
            </div>
          </div>
        </Section>

        {/* 3. 单条测试输入区 */}
        <Section title="测试输入" expanded={expandedSections.input} onToggle={() => toggleSection("input")}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入一段原始文本，测试 AI 会如何整理"
            className="w-full h-28 p-3 bg-stone-50 border border-stone-200 rounded-xl text-[14px] text-stone-800 placeholder:text-stone-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
          />
          <div className="flex justify-between mt-2">
            <button onClick={() => setInputText("")} className="text-[12px] text-stone-400 hover:text-stone-600">清空</button>
            <button onClick={() => {
              if (samples.length > 0) handleFillFromSample(samples[Math.floor(Math.random() * samples.length)]);
            }} className="text-[12px] text-indigo-500 hover:text-indigo-700">随机填入样本</button>
          </div>

          {/* 选项开关 */}
          <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-stone-600">使用当前激活配置</span>
              <MiniToggle value={useActiveConfig} onChange={setUseActiveConfig} />
            </div>
            {!useActiveConfig && (
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full text-[12px] p-2 border border-stone-200 rounded-lg bg-white"
              >
                <option value="">选择配置</option>
                {enabledProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                ))}
              </select>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-stone-600">允许回退到本地整理</span>
              <MiniToggle value={allowFallback} onChange={setAllowFallback} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-stone-600">显示调试细节</span>
              <MiniToggle value={showDebugDetail} onChange={setShowDebugDetail} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-stone-600">使用当前真实上下文</span>
              <MiniToggle value={useRealContext} onChange={setUseRealContext} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-stone-600">忽略用户偏好，只测基础提示词</span>
              <MiniToggle value={ignorePreferences} onChange={setIgnorePreferences} />
            </div>
          </div>
        </Section>

        {/* 4. 运行控制区 */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRun}
            disabled={isRunning || !inputText.trim()}
            className="px-4 py-2 bg-indigo-500 text-white text-[13px] rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? "运行中…" : "运行整理"}
          </button>
          {diagnostic && (
            <>
              <button onClick={handleRerun} disabled={isRunning} className="px-3 py-2 bg-white border border-stone-200 text-[13px] text-stone-600 rounded-lg hover:bg-stone-50 disabled:opacity-50">
                重新运行
              </button>
              <button onClick={handleSaveAsSample} className="px-3 py-2 bg-white border border-stone-200 text-[13px] text-stone-600 rounded-lg hover:bg-stone-50">
                保存为测试样本
              </button>
              {diagnostic.result && (
                <button onClick={handleSaveAsPositive} className="px-3 py-2 bg-emerald-50 border border-emerald-200 text-[13px] text-emerald-700 rounded-lg hover:bg-emerald-100">
                  保存为正向示例
                </button>
              )}
              <button onClick={handleClear} className="px-3 py-2 text-[13px] text-stone-400 hover:text-stone-600">
                清空结果
              </button>
            </>
          )}
        </div>

        {/* 5. 实际输出结果区 */}
        {diagnostic?.result && (
          <Section title="实际输出" expanded={expandedSections.output} onToggle={() => toggleSection("output")}>
            <div className="space-y-3">
              {/* 结果卡片 */}
              <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2">
                <ResultRow label="标题" value={diagnostic.result.title} />
                <ResultRow label="摘要" value={diagnostic.result.summary} />
                <ResultRow label="建议类型" value={diagnostic.result.type} />
                <ResultRow label="子类型" value={diagnostic.result.aiSubType || "—"} />
                <ResultRow label="类型置信度" value={diagnostic.result.typeConfidence !== undefined ? `${(diagnostic.result.typeConfidence * 100).toFixed(0)}%` : "—"} />
                <ResultRow label="类型原因" value={diagnostic.result.typeReason || "—"} />
                <ResultRow label="标签" value={diagnostic.result.tags.join("、") || "—"} />
                <ResultRow label="主题" value={diagnostic.result.topic} />
                <ResultRow label="推进等级" value={diagnostic.result.promoteLevel} />
                <ResultRow label="下一步建议" value={diagnostic.result.suggestions.length > 0 ? diagnostic.result.suggestions.join("；") : "无"} />
              </div>

              {/* 来源信息 */}
              <div className="flex flex-wrap gap-2 text-[12px]">
                <span className={`px-2 py-0.5 rounded-full ${diagnostic.usedFallback ? "bg-stone-100 text-stone-500" : "bg-indigo-50 text-indigo-600"}`}>
                  {diagnostic.usedFallback ? "本地整理" : "AI 整理"}
                </span>
                {diagnostic.profileName && !diagnostic.usedFallback && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">{diagnostic.profileName}</span>
                )}
                {diagnostic.modelName && !diagnostic.usedFallback && (
                  <span className="px-2 py-0.5 rounded-full bg-stone-50 text-stone-500">{diagnostic.modelName}</span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-stone-50 text-stone-500">{diagnostic.durationMs}ms</span>
                {diagnostic.usedBackup && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">触发备用</span>
                )}
                {diagnostic.usedFallback && !diagnostic.usedBackup && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">触发回退</span>
                )}
              </div>

              {/* 质量检查 */}
              {currentQuality && (
                <div className="bg-white border border-stone-200 rounded-xl p-3">
                  <div className="text-[12px] font-medium text-stone-700 mb-2">质量辅助判断</div>
                  <div className="grid grid-cols-5 gap-1 text-center text-[11px]">
                    {[
                      { label: "标题", q: currentQuality.titleQuality },
                      { label: "类型", q: currentQuality.typeQuality },
                      { label: "标签", q: currentQuality.tagQuality },
                      { label: "主题", q: currentQuality.topicQuality },
                      { label: "建议", q: currentQuality.suggestionQuality },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="text-stone-400 mb-0.5">{item.label}</div>
                        <span className={`px-1.5 py-0.5 rounded ${qualityColor(item.q)}`}>{item.q}</span>
                      </div>
                    ))}
                  </div>
                  {currentQuality.warnings.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {currentQuality.warnings.map((w, i) => (
                        <div key={i} className="text-[11px] text-amber-600">⚠ {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setResultVerdict("acceptable"); }}
                  className={`px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${resultVerdict === "acceptable" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"}`}
                >
                  这次结果可接受
                </button>
                <button
                  onClick={() => { setResultVerdict("unacceptable"); }}
                  className={`px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${resultVerdict === "unacceptable" ? "bg-rose-50 border-rose-300 text-rose-700" : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"}`}
                >
                  这次结果不合适
                </button>
                <button onClick={handleCopyResultToExpectation} className="px-3 py-1.5 text-[12px] rounded-lg bg-white border border-stone-200 text-stone-500 hover:bg-stone-50">
                  复制为期望结果
                </button>
              </div>
            </div>
          </Section>
        )}

        {/* 6. 解析与修正诊断区 */}
        {diagnostic && showDebugDetail && (
          <Section title="解析与修正" expanded={expandedSections.diagnostic} onToggle={() => toggleSection("diagnostic")}>
            <div className="space-y-3 text-[13px]">
              {/* 原始模型输出（可折叠） */}
              {diagnostic.rawModelOutput && (
                <details>
                  <summary className="cursor-pointer text-stone-500 text-[12px] hover:text-stone-700">原始模型返回文本</summary>
                  <pre className="mt-1 p-2 bg-stone-100 rounded-lg text-[11px] text-stone-600 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {diagnostic.rawModelOutput}
                  </pre>
                </details>
              )}

              {/* 解析状态 */}
              <div className="flex justify-between">
                <span className="text-stone-500">JSON 解析状态</span>
                <span className={parseStatusColor(diagnostic.parseStatus)}>{diagnostic.parseStatus}</span>
              </div>

              {/* 修正记录 */}
              {diagnostic.corrections.length > 0 ? (
                <div>
                  <div className="text-stone-500 text-[12px] mb-1">字段修正记录</div>
                  <div className="space-y-0.5">
                    {diagnostic.corrections.map((c, i) => (
                      <div key={i} className="text-[12px] text-amber-700 bg-amber-50 px-2 py-1 rounded">✏ {c}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-stone-400">无修正记录</div>
              )}

              {/* 黑名单命中 */}
              {diagnostic.blacklistHits.length > 0 && (
                <div>
                  <div className="text-stone-500 text-[12px] mb-1">命中黑名单</div>
                  <div className="flex flex-wrap gap-1">
                    {diagnostic.blacklistHits.map((h, i) => (
                      <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[11px] rounded-full">{h}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 偏好命中 */}
              {diagnostic.preferenceHits.length > 0 ? (
                <div>
                  <div className="text-stone-500 text-[12px] mb-1">偏好命中</div>
                  <div className="space-y-0.5">
                    {diagnostic.preferenceHits.map((h, i) => (
                      <div key={i} className="text-[12px] text-violet-700 bg-violet-50 px-2 py-1 rounded">🎯 {h}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-stone-400">未命中偏好规则</div>
              )}

              {/* 重试/回退 */}
              {diagnostic.retried && <div className="text-[12px] text-amber-600">↻ 触发了重试</div>}
              {diagnostic.usedBackup && <div className="text-[12px] text-amber-600">⚡ 触发了备用配置</div>}
              {diagnostic.usedFallback && <div className="text-[12px] text-rose-600">⬇ 触发了本地回退</div>}

              {/* 失败原因 */}
              {diagnostic.failureReason && (
                <div className="p-2 bg-rose-50 rounded-lg">
                  <div className="text-[12px] text-rose-700">失败原因: {diagnostic.failureReason}</div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* 7. 期望结果对照区 */}
        <Section title="期望结果" expanded={expandedSections.expectation} onToggle={() => toggleSection("expectation")}>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] text-stone-500 block mb-1">期望主类型</label>
              <select
                value={expectation.expectedType}
                onChange={(e) => setExpectation({ ...expectation, expectedType: e.target.value as RecordType })}
                className="w-full text-[13px] p-2 border border-stone-200 rounded-lg bg-white"
              >
                {(["随记", "灵感", "待办", "项目", "问题", "复盘", "参考"] as RecordType[]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] text-stone-500 block mb-1">期望子类型（可选）</label>
              <input
                value={expectation.expectedSubType || ""}
                onChange={(e) => setExpectation({ ...expectation, expectedSubType: e.target.value })}
                className="w-full text-[13px] p-2 border border-stone-200 rounded-lg bg-white"
                placeholder="如：作品集结构"
              />
            </div>
            <div>
              <label className="text-[12px] text-stone-500 block mb-1">期望主题（可选）</label>
              <input
                value={expectation.expectedTopic || ""}
                onChange={(e) => setExpectation({ ...expectation, expectedTopic: e.target.value })}
                className="w-full text-[13px] p-2 border border-stone-200 rounded-lg bg-white"
                placeholder="如：作品集"
              />
            </div>
            <div>
              <label className="text-[12px] text-stone-500 block mb-1">标签要求（可选，逗号分隔）</label>
              <input
                value={expectation.expectedTags || ""}
                onChange={(e) => setExpectation({ ...expectation, expectedTags: e.target.value })}
                className="w-full text-[13px] p-2 border border-stone-200 rounded-lg bg-white"
                placeholder="如：作品集, 首页"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-stone-500">是否应该有下一步建议</span>
              <MiniToggle
                value={expectation.expectedHasSuggestions ?? false}
                onChange={(v) => setExpectation({ ...expectation, expectedHasSuggestions: v })}
              />
            </div>
            <div>
              <label className="text-[12px] text-stone-500 block mb-1">备注</label>
              <input
                value={expectation.notes || ""}
                onChange={(e) => setExpectation({ ...expectation, notes: e.target.value })}
                className="w-full text-[13px] p-2 border border-stone-200 rounded-lg bg-white"
                placeholder="备注说明"
              />
            </div>
            <button onClick={() => saveLastExpectation(expectation)} className="text-[12px] text-indigo-500 hover:text-indigo-700">保存期望结果</button>

            {/* 对照结果 */}
            {diagnostic?.result && (
              <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
                <div className="text-[12px] font-medium text-stone-700">对照结果</div>
                <CompareRow label="主类型" actual={diagnostic.result.type} expected={expectation.expectedType} />
                <CompareRow label="主题" actual={diagnostic.result.topic} expected={expectation.expectedTopic || "—"} isTopic />
                <CompareRow label="标签" actual={diagnostic.result.tags.join("、") || "无"} expected={expectation.expectedTags || "—"} isTags />
                <CompareRow
                  label="建议"
                  actual={diagnostic.result.suggestions.length > 0 ? "有" : "无"}
                  expected={expectation.expectedHasSuggestions ? "应该有" : "—"}
                />
              </div>
            )}
          </div>
        </Section>

        {/* 8. 测试样本库 */}
        <Section title={`测试样本库 (${samples.length})`} expanded={expandedSections.samples} onToggle={() => toggleSection("samples")}>
          <div className="space-y-2">
            {samples.map((s) => (
              <div key={s.id} className="flex items-start gap-2 p-2.5 bg-white border border-stone-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] text-stone-800 truncate">{s.name}</span>
                    {s.isKeySample && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full">重点</span>}
                  </div>
                  <div className="text-[11px] text-stone-400 truncate mt-0.5">{s.rawText}</div>
                  <div className="text-[11px] text-stone-400 mt-0.5">期望: {s.expectedType}{s.expectedTopic ? ` / ${s.expectedTopic}` : ""}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleFillFromSample(s)} className="px-2 py-1 text-[11px] bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">填入</button>
                  <button onClick={() => { toggleKeySample(s.id); setSamples(loadCalibrationSamples()); }} className={`px-2 py-1 text-[11px] rounded ${s.isKeySample ? "bg-amber-50 text-amber-600" : "bg-stone-50 text-stone-400"}`}>
                    {s.isKeySample ? "取消重点" : "设为重点"}
                  </button>
                  <button onClick={() => { deleteCalibrationSample(s.id); setSamples(loadCalibrationSamples()); }} className="px-2 py-1 text-[11px] bg-rose-50 text-rose-500 rounded hover:bg-rose-100">删</button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 9. 批量测试结果区 */}
        <Section title="批量测试" expanded={expandedSections.batch} onToggle={() => toggleSection("batch")}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => handleBatchTest(false)}
                disabled={isBatchRunning}
                className="px-3 py-2 bg-indigo-500 text-white text-[13px] rounded-lg hover:bg-indigo-600 disabled:opacity-50"
              >
                {isBatchRunning ? "运行中…" : "运行全部样本"}
              </button>
              <button
                onClick={() => handleBatchTest(true)}
                disabled={isBatchRunning}
                className="px-3 py-2 bg-white border border-amber-300 text-[13px] text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-50"
              >
                只运行重点样本
              </button>
            </div>

            {batchResult && (
              <div className="space-y-3">
                {/* 统计 */}
                <div className="grid grid-cols-5 gap-2 text-center">
                  <StatBox label="总样本" value={batchResult.totalSamples} />
                  <StatBox label="主类型匹配" value={batchResult.typeMatchCount} color="emerald" />
                  <StatBox label="主题合理" value={batchResult.topicReasonableCount} color="blue" />
                  <StatBox label="建议通过" value={batchResult.suggestionPassedCount} color="violet" />
                  <StatBox label="失败" value={batchResult.failedCount} color="rose" />
                </div>

                {/* 每条样本结果 */}
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {batchResult.results.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] ${r.typeMatch ? "bg-emerald-50" : "bg-rose-50"}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${r.typeMatch ? "bg-emerald-400" : "bg-rose-400"}`}>
                        {r.typeMatch ? "✓" : "✗"}
                      </span>
                      <span className="flex-1 text-stone-700 truncate">{r.sampleName}</span>
                      <span className="text-stone-500">{r.actualResult.type}</span>
                      <span className="text-stone-400">→</span>
                      <span className="text-stone-500">{r.expectation.expectedType}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${qualityColor(r.qualityCheck.overallQuality)}`}>
                        {r.qualityCheck.overallQuality}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="text-[11px] text-stone-400">
                  运行时间: {new Date(batchResult.runAt).toLocaleString("zh-CN")}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* 10. 隐私与安全说明 */}
        <Section title="隐私与安全" expanded={expandedSections.privacy} onToggle={() => toggleSection("privacy")}>
          <div className="space-y-1.5 text-[12px] text-stone-500">
            <div>🔒 AI 密钥只保存在当前设备本地</div>
            <div>🔒 AI 密钥不会同步到云端</div>
            <div>🔒 本页不会在任何地方明文显示 API Key</div>
            <div>🔒 测试样本和结果仅保存在本地，不同步到云端</div>
            <div>🔒 批量测试的请求是顺序发送，不会并发</div>
          </div>
        </Section>

      </div>
    </div>
  );
}

// ============================================================
// 子组件
// ============================================================

function Section({ title, expanded, onToggle, children }: {
  title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors">
        <span className="text-[14px] font-medium text-stone-800">{title}</span>
        <svg className={`w-4 h-4 text-stone-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function MiniToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={`w-9 h-[20px] rounded-full transition-colors duration-200 relative ${value ? "bg-indigo-500" : "bg-stone-300"}`}>
      <span className={`absolute top-[2px] w-[16px] h-[16px] bg-white rounded-full shadow-sm transition-transform duration-200 ${value ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
    </button>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <span className="text-stone-400 shrink-0 w-20">{label}</span>
      <span className="text-stone-800">{value}</span>
    </div>
  );
}

function CompareRow({ label, actual, expected, isTopic, isTags }: {
  label: string; actual: string; expected: string; isTopic?: boolean; isTags?: boolean;
}) {
  const match = actual === expected || (isTopic && actual !== "未分类主题" && expected === "—") || (isTags && expected === "—");
  const close = isTopic && !match && actual !== "未分类主题";
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="text-stone-400 w-12">{label}</span>
      <span className="text-stone-700">{actual}</span>
      <span className="text-stone-400">→</span>
      <span className="text-stone-500">{expected}</span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] ${match ? "bg-emerald-50 text-emerald-600" : close ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"}`}>
        {match ? "匹配" : close ? "接近" : isTags ? (actual === "无" ? "偏空" : "合理") : "不匹配"}
      </span>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    violet: "text-violet-600",
    rose: "text-rose-600",
  };
  return (
    <div className="bg-stone-50 rounded-lg p-2">
      <div className={`text-lg font-semibold ${color ? colorMap[color] || "text-stone-700" : "text-stone-700"}`}>{value}</div>
      <div className="text-[10px] text-stone-400">{label}</div>
    </div>
  );
}
