import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { addRecord as storageAddRecord, generateId } from "../storage";
import {
  TYPE_COLORS,
  PROMOTE_COLORS,
  PROMOTE_DOT,
  RECORD_TYPES,
  PROMOTE_LEVELS,
  FEEDBACK_REASONS,
} from "../types";
import type { RecordType, PromoteLevel, ThoughtRecord, FeedbackStatus, AdoptedSuggestion, BriefActionItem } from "../types";
import { WorkspaceLink } from "../components/WorkspaceLink";

type ConfirmAction = "archive" | "delete" | "restore" | null;

/** 对比编辑前后，找出哪些字段被修改了 */
function getEditedFields(original: ThoughtRecord, current: EditFormState): string[] {
  const fields: string[] = [];
  if (original.aiTitle !== current.aiTitle) fields.push("aiTitle");
  if (original.aiSummary !== current.aiSummary) fields.push("aiSummary");
  if (original.type !== current.type) fields.push("type");
  if (original.aiSubType !== current.aiSubType) fields.push("aiSubType");
  if (JSON.stringify(original.tags) !== JSON.stringify(current.tags)) fields.push("tags");
  if (original.topic !== current.topic) fields.push("topic");
  if (original.promoteLevel !== current.promoteLevel) fields.push("promoteLevel");
  if (JSON.stringify(original.suggestions) !== JSON.stringify(current.suggestions)) fields.push("suggestions");
  return fields;
}

interface EditFormState {
  aiTitle: string;
  aiSummary: string;
  type: RecordType;
  aiSubType: string;
  tags: string[];
  topic: string;
  promoteLevel: PromoteLevel;
  suggestions: string[];
}

export default function RecordDetailPage() {
  const {
    organizeStatus,
    saveEditWithPreference,
    submitFeedback,
    generateBriefFromRecordData,
    updateBrief,
    briefs,
  } = useApp();
  const { id } = useParams<{ id: string }>();
  const { getRecord, updateRecord, deleteRecord, reOrganizeRecord } = useApp();
  const navigate = useNavigate();
  const record = id ? getRecord(id) : undefined;

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // 编辑原文
  const [editingRaw, setEditingRaw] = useState(false);
  const [rawTextDraft, setRawTextDraft] = useState("");

  // 编辑整理结果
  const [isEditingResult, setIsEditingResult] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [rememberPreference, setRememberPreference] = useState(true);

  // 编辑单条建议
  const [editingSuggestionIndex, setEditingSuggestionIndex] = useState<number | null>(null);
  const [editingSuggestionText, setEditingSuggestionText] = useState("");

  // Brief 生成
  const [generatingBrief, setGeneratingBrief] = useState(false);

  // 反馈
  const [showFeedbackDetail, setShowFeedbackDetail] = useState(false);

  // 当 record 变化时同步反馈
  useEffect(() => {
    // 用于触发重渲染
  }, [record]);

  if (!record) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400 text-sm">
        记录不存在
      </div>
    );
  }

  // ====== 更多菜单操作 ======
  const handleMoreAction = (action: "archive" | "delete" | "reorganize") => {
    setShowMoreMenu(false);
    if (action === "reorganize") {
      reOrganizeRecord(record.id);
    } else {
      setConfirmAction(action);
    }
  };

  // ====== 编辑原文 ======
  const handleStartEditRaw = () => {
    setRawTextDraft(record.rawText);
    setEditingRaw(true);
  };

  const handleSaveRaw = () => {
    if (!rawTextDraft.trim()) return;
    updateRecord({ ...record, rawText: rawTextDraft.trim(), updatedAt: new Date().toISOString() });
    setEditingRaw(false);
  };

  const handleCancelEditRaw = () => {
    setEditingRaw(false);
    setRawTextDraft("");
  };

  // ====== 编辑整理结果 ======
  const handleStartEditResult = () => {
    setEditForm({
      aiTitle: record.aiTitle,
      aiSummary: record.aiSummary,
      type: record.type,
      aiSubType: record.aiSubType || "",
      tags: [...record.tags],
      topic: record.topic,
      promoteLevel: record.promoteLevel,
      suggestions: [...record.suggestions],
    });
    setIsEditingResult(true);
  };

  const handleCancelEditResult = () => {
    setIsEditingResult(false);
    setEditForm(null);
  };

  const handleSaveEditResult = () => {
    if (!editForm) return;
    const editedFields = getEditedFields(record, editForm);
    if (editedFields.length === 0) {
      setIsEditingResult(false);
      setEditForm(null);
      return;
    }
    const updated: ThoughtRecord = {
      ...record,
      aiTitle: editForm.aiTitle,
      aiSummary: editForm.aiSummary,
      type: editForm.type,
      aiSubType: editForm.aiSubType,
      tags: editForm.tags,
      topic: editForm.topic,
      promoteLevel: editForm.promoteLevel,
      suggestions: editForm.suggestions,
    };
    saveEditWithPreference(updated, editedFields, rememberPreference);
    setIsEditingResult(false);
    setEditForm(null);
  };

  const handleRestoreOriginal = () => {
    if (!record.aiOriginalResult) return;
    const original = record.aiOriginalResult;
    const restored: ThoughtRecord = {
      ...record,
      aiTitle: original.title,
      aiSummary: original.summary,
      type: (RECORD_TYPES.includes(original.type as RecordType) ? original.type : "随记") as RecordType,
      aiSubType: original.aiSubType,
      typeConfidence: original.typeConfidence,
      typeReason: original.typeReason,
      tags: original.tags,
      topic: original.topic,
      promoteLevel: (PROMOTE_LEVELS.includes(original.promoteLevel as PromoteLevel) ? original.promoteLevel : "仅保存") as PromoteLevel,
      suggestions: original.suggestions,
      userEdited: false,
      userEditedAt: undefined,
      editedFields: [],
      updatedAt: new Date().toISOString(),
    };
    updateRecord(restored);
  };

  // ====== 建议操作 ======
  const handleStartEditSuggestion = (index: number) => {
    setEditingSuggestionIndex(index);
    setEditingSuggestionText(record.suggestions[index]);
  };

  const handleSaveSuggestionEdit = () => {
    if (editingSuggestionIndex === null) return;
    const newSuggestions = [...record.suggestions];
    newSuggestions[editingSuggestionIndex] = editingSuggestionText.trim();
    updateRecord({ ...record, suggestions: newSuggestions, updatedAt: new Date().toISOString() });
    setEditingSuggestionIndex(null);
    setEditingSuggestionText("");
  };

  const handleCancelSuggestionEdit = () => {
    setEditingSuggestionIndex(null);
    setEditingSuggestionText("");
  };

  const handleDeleteSuggestion = (index: number) => {
    const newSuggestions = record.suggestions.filter((_, i) => i !== index);
    updateRecord({ ...record, suggestions: newSuggestions, updatedAt: new Date().toISOString() });
  };

  const handleAddSuggestion = (text: string) => {
    if (!text.trim()) return;
    updateRecord({ ...record, suggestions: [...record.suggestions, text.trim()], updatedAt: new Date().toISOString() });
  };

  // ====== 转为待办 ======
  const handleConvertToTodo = (suggestionText: string) => {
    const newId = generateId();
    const todoRecord: ThoughtRecord = {
      id: newId,
      rawText: suggestionText,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aiStatus: "done",
      aiTitle: suggestionText.slice(0, 30),
      aiSummary: suggestionText,
      type: "待办",
      tags: [...record.tags],
      topic: record.topic,
      promoteLevel: "建议行动",
      suggestions: [],
      archived: false,
      organizeSource: "mock",
    };
    storageAddRecord(todoRecord);

    const current = getRecord(record.id);
    if (current) {
      updateRecord({
        ...current,
        adoptedSuggestions: [...(current.adoptedSuggestions || []), {
          content: suggestionText,
          as: "todo",
          targetId: newId,
          createdAt: new Date().toISOString(),
        }],
        updatedAt: new Date().toISOString(),
      });
    }
  };

  // ====== 加入推进卡 ======
  // 如果已有该记录的 brief，则添加行动项；否则只标记建议，稍后由用户手动生成 brief
  const handleAddToBrief = async (suggestionText: string) => {
    const existingBrief = briefs.find((b) => b.sourceType === "record" && b.sourceRecordIds.includes(record.id));

    if (existingBrief) {
      // 已有 brief：直接添加行动项
      const newAction: BriefActionItem = {
        id: generateId(),
        content: suggestionText,
        done: false,
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updateBrief({
        ...existingBrief,
        nextActions: [...existingBrief.nextActions, newAction],
        updatedAt: new Date().toISOString(),
      });

      // 标记建议为已加入推进卡
      const current = getRecord(record.id);
      if (current) {
        updateRecord({
          ...current,
          adoptedSuggestions: [...(current.adoptedSuggestions || []), {
            content: suggestionText,
            as: "brief",
            targetId: existingBrief.id,
            createdAt: new Date().toISOString(),
          }],
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      // 没有 brief：仅标记建议为"待加入推进卡"，不自动生成
      const current = getRecord(record.id);
      if (current) {
        updateRecord({
          ...current,
          adoptedSuggestions: [...(current.adoptedSuggestions || []), {
            content: suggestionText,
            as: "brief",
            targetId: undefined,
            createdAt: new Date().toISOString(),
          }],
          updatedAt: new Date().toISOString(),
        });
      }
    }
  };

  // ====== 归档/恢复/删除 ======
  const handleArchive = () => {
    updateRecord({ ...record, archived: true });
    navigate("/", { replace: true });
  };

  const handleRestore = () => {
    updateRecord({ ...record, archived: false });
    navigate("/", { replace: true });
  };

  const handleDelete = () => {
    deleteRecord(record.id);
    navigate("/", { replace: true });
  };

  // ====== 底部生成 Brief ======
  const handleGenerateBrief = async () => {
    // 如果已有 brief，直接跳转
    const existingBrief = briefs.find((b) => b.sourceType === "record" && b.sourceRecordIds.includes(record.id));
    if (existingBrief) {
      navigate(`/brief/${existingBrief.id}`);
      return;
    }
    setGeneratingBrief(true);
    try {
      const brief = await generateBriefFromRecordData(record.id);
      if (brief) {
        navigate(`/brief/${brief.id}`);
      }
    } finally {
      setGeneratingBrief(false);
    }
  };

  // ====== 反馈 ======
  const handleFeedback = (status: FeedbackStatus) => {
    submitFeedback(record.id, status, []);
    if (status === "一般" || status === "不合适") {
      setShowFeedbackDetail(true);
    }
  };

  const handleFeedbackWithReasons = (status: FeedbackStatus, reasons: string[]) => {
    submitFeedback(record.id, status, reasons);
    setShowFeedbackDetail(false);
  };

  // ====== 编辑表单操作 ======
  const handleEditTagRemove = (tag: string) => {
    if (!editForm) return;
    setEditForm({ ...editForm, tags: editForm.tags.filter((t) => t !== tag) });
  };

  const handleEditTagAdd = (tag: string) => {
    if (!editForm) return;
    if (tag.trim() && !editForm.tags.includes(tag.trim())) {
      setEditForm({ ...editForm, tags: [...editForm.tags, tag.trim()] });
    }
  };

  const handleEditSuggestionRemove = (index: number) => {
    if (!editForm) return;
    setEditForm({ ...editForm, suggestions: editForm.suggestions.filter((_, i) => i !== index) });
  };

  const handleEditSuggestionAdd = (text: string) => {
    if (!editForm) return;
    if (text.trim()) {
      setEditForm({ ...editForm, suggestions: [...editForm.suggestions, text.trim()] });
    }
  };

  const handleEditSuggestionChange = (index: number, text: string) => {
    if (!editForm) return;
    const newSuggestions = [...editForm.suggestions];
    newSuggestions[index] = text;
    setEditForm({ ...editForm, suggestions: newSuggestions });
  };

  // ====== 判断是否已采纳 ======
  const isAdopted = (text: string) => {
    return (record.adoptedSuggestions || []).some((a) => a.content === text);
  };

  return (
    <div className="flex flex-col h-full bg-stone-100">
      {/* 整理状态 Toast */}
      {organizeStatus && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-stone-900 text-white text-[12px] font-medium rounded-full shadow-lg animate-fade-in">
          {organizeStatus}
        </div>
      )}

      {/* ========== 1. 顶部导航栏 ========== */}
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
        <h1 className="text-[13px] font-semibold text-stone-900">记录详情</h1>
        <div className="flex items-center gap-2">
          <WorkspaceLink view="records" recordId={id} label="在工作台继续整理" />
          <button
            onClick={() => setShowMoreMenu(true)}
            className="text-[13px] text-stone-400 active:text-stone-500 transition-colors min-w-[48px] text-right py-1"
          >
            更多
          </button>
        </div>
      </div>

      {/* ========== 滚动内容区 ========== */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">

        {/* ========== 2. 原始记录区 ========== */}
        <section className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <SectionLabel color="bg-stone-300">原始记录</SectionLabel>
            {!editingRaw && (
              <button
                onClick={handleStartEditRaw}
                className="px-2 py-[2px] rounded-md text-[10px] font-medium bg-stone-100 text-stone-500 hover:bg-stone-200 active:bg-stone-200 transition-colors"
              >
                编辑原文
              </button>
            )}
          </div>

          {editingRaw ? (
            <div className="mt-3 space-y-3">
              <textarea
                value={rawTextDraft}
                onChange={(e) => setRawTextDraft(e.target.value)}
                rows={6}
                className="w-full px-3 py-3 bg-stone-50 rounded-xl text-[14px] text-stone-700 leading-[1.75] border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all duration-200 resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleCancelEditRaw}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveRaw}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[14px] text-stone-700 whitespace-pre-wrap leading-[1.75] mt-3">
                {record.rawText}
              </p>
              <div className="mt-4 flex items-center gap-3 text-[11px] text-stone-300 font-medium">
                <span>创建于 {formatDateTime(record.createdAt)}</span>
                {record.updatedAt !== record.createdAt && (
                  <span>更新于 {formatDateTime(record.updatedAt)}</span>
                )}
              </div>
            </>
          )}
        </section>

        {/* ========== 3. AI 整理结果区 ========== */}
        <section className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center justify-between">
            <SectionLabel color="bg-indigo-400">AI 整理结果</SectionLabel>
            <div className="flex items-center gap-1.5">
              {/* 状态标签 */}
              {record.organizeSource && record.aiStatus === "done" && (
                <>
                  <span className={`px-2 py-[2px] rounded-md text-[10px] font-medium ${
                    record.organizeSource === "ai"
                      ? "bg-indigo-50 text-indigo-500"
                      : "bg-stone-50 text-stone-400"
                  }`}>
                    {record.organizeSource === "ai" ? "AI 整理" : "本地整理"}
                  </span>
                  {record.aiModel && (
                    <span className="px-2 py-[2px] rounded-md text-[10px] font-medium bg-stone-50 text-stone-400">
                      {record.aiModel}
                    </span>
                  )}
                </>
              )}
              {/* 编辑按钮 */}
              {!isEditingResult && record.aiStatus === "done" && (
                <button
                  onClick={handleStartEditResult}
                  className="px-2 py-[2px] rounded-md text-[10px] font-medium bg-stone-100 text-stone-500 hover:bg-stone-200 active:bg-stone-200 transition-colors"
                >
                  编辑整理结果
                </button>
              )}
            </div>
          </div>

          {record.organizeError && record.aiStatus === "done" && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 text-[11px] text-amber-700 leading-relaxed">
              {record.organizeError}
            </div>
          )}

          {record.aiStatus === "pending" ? (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400">
              <span className="inline-block w-5 h-5 border-[1.5px] border-stone-200 border-t-indigo-400 rounded-full animate-spin mb-3" />
              <p className="text-[13px] font-medium">整理中...</p>
              <p className="text-[12px] text-stone-300 mt-1">稍等片刻</p>
            </div>
          ) : isEditingResult && editForm ? (
            /* ========== 编辑整理结果模式 ========== */
            <div className="space-y-5 mt-3">
              {/* 标题 */}
              <FieldGroup label="标题">
                <input
                  type="text"
                  value={editForm.aiTitle}
                  onChange={(e) => setEditForm({ ...editForm, aiTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[14px] text-stone-800 font-semibold border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all duration-200"
                />
              </FieldGroup>

              {/* 摘要 */}
              <FieldGroup label="摘要">
                <textarea
                  value={editForm.aiSummary}
                  onChange={(e) => setEditForm({ ...editForm, aiSummary: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-600 leading-[1.7] border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all duration-200 resize-none"
                />
              </FieldGroup>

              {/* 建议类型 */}
              <FieldGroup label="建议类型">
                <div className="flex flex-wrap gap-1.5">
                  {RECORD_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setEditForm({ ...editForm, type: t })}
                      className={`px-2.5 py-[5px] rounded-lg text-[11px] font-medium transition-all duration-150 ${
                        editForm.type === t
                          ? TYPE_COLORS[t] + " ring-[1.5px] ring-offset-1 ring-current/20"
                          : "bg-stone-50 text-stone-400 active:bg-stone-100"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              {/* 子类型 */}
              <FieldGroup label="子类型">
                <input
                  type="text"
                  value={editForm.aiSubType}
                  onChange={(e) => setEditForm({ ...editForm, aiSubType: e.target.value })}
                  placeholder="如：生活感受、网页案例"
                  className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all duration-200"
                />
              </FieldGroup>

              {/* 标签 */}
              <FieldGroup label="标签">
                <div className="flex flex-wrap gap-1.5">
                  {editForm.tags.map((tag) => (
                    <span
                      key={tag}
                      className="group inline-flex items-center gap-1 px-2.5 py-[5px] rounded-lg bg-stone-50 text-stone-600 text-[11px] font-medium"
                    >
                      #{tag}
                      <button
                        onClick={() => handleEditTagRemove(tag)}
                        className="text-stone-400 hover:text-stone-600 transition-colors"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  <AddItemInline onAdd={handleEditTagAdd} placeholder="输入标签" />
                </div>
              </FieldGroup>

              {/* 主题 */}
              <FieldGroup label="主题">
                <input
                  type="text"
                  value={editForm.topic}
                  onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-800 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all duration-200"
                />
              </FieldGroup>

              {/* 推进等级 */}
              <FieldGroup label="推进建议">
                <div className="flex flex-wrap gap-1.5">
                  {PROMOTE_LEVELS.map((level) => (
                    <button
                      key={level}
                      onClick={() => setEditForm({ ...editForm, promoteLevel: level })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg text-[11px] font-medium transition-all duration-150 ${
                        editForm.promoteLevel === level
                          ? PROMOTE_COLORS[level] + " ring-[1.5px] ring-offset-1 ring-current/20"
                          : "bg-stone-50 text-stone-400 active:bg-stone-100"
                      }`}
                    >
                      {editForm.promoteLevel === level && (
                        <span className={`w-[5px] h-[5px] rounded-full ${PROMOTE_DOT[level]}`} />
                      )}
                      {level}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              {/* 下一步建议 */}
              <FieldGroup label="下一步建议">
                <div className="space-y-2">
                  {editForm.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="shrink-0 mt-[6px] w-[18px] h-[18px] rounded-full bg-stone-100 text-stone-500 flex items-center justify-center text-[10px] font-semibold">
                        {i + 1}
                      </span>
                      <input
                        type="text"
                        value={s}
                        onChange={(e) => handleEditSuggestionChange(i, e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-stone-50 rounded-lg text-[13px] text-stone-600 border border-stone-200/80 focus:ring-1 focus:ring-stone-300/40 transition-all"
                      />
                      <button
                        onClick={() => handleEditSuggestionRemove(i)}
                        className="shrink-0 mt-1.5 text-stone-400 hover:text-stone-600 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <AddItemInline onAdd={handleEditSuggestionAdd} placeholder="添加建议" />
                </div>
              </FieldGroup>

              {/* 记住偏好 */}
              <div className="flex items-center justify-between py-2 px-3 bg-stone-50 rounded-xl">
                <span className="text-[12px] text-stone-600">记住这次修改，用于后续整理</span>
                <button
                  onClick={() => setRememberPreference(!rememberPreference)}
                  className={`w-10 h-[22px] rounded-full transition-colors duration-200 relative ${rememberPreference ? "bg-indigo-500" : "bg-stone-300"}`}
                >
                  <span className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform duration-200 ${rememberPreference ? "translate-x-[20px]" : "translate-x-[2px]"}`} />
                </button>
              </div>

              {/* 保存/取消按钮 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCancelEditResult}
                  className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEditResult}
                  className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors"
                >
                  保存修改
                </button>
              </div>
            </div>
          ) : (
            /* ========== 只读模式 ========== */
            <div className="space-y-5 mt-3">
              {/* 建议类型 */}
              <FieldGroup label="建议类型">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-block px-2.5 py-[5px] rounded-lg text-[11px] font-medium ${TYPE_COLORS[record.type]}`}>
                    {record.type}
                  </span>
                  {record.aiSubType && (
                    <span className="text-[11px] text-stone-400">
                      {record.aiSubType}
                    </span>
                  )}
                  {record.typeConfidence !== undefined && record.typeConfidence < 0.6 && (
                    <span className="text-[10px] text-stone-300">
                      置信度 {Math.round(record.typeConfidence * 100)}%
                    </span>
                  )}
                </div>
              </FieldGroup>

              {/* 摘要 */}
              <FieldGroup label="摘要">
                <p className="text-[13px] text-stone-600 leading-[1.7]">{record.aiSummary}</p>
              </FieldGroup>

              {/* 标签 */}
              <FieldGroup label="标签">
                <div className="flex flex-wrap gap-1.5">
                  {record.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2.5 py-[5px] rounded-lg bg-stone-50 text-stone-600 text-[11px] font-medium"
                    >
                      #{tag}
                    </span>
                  ))}
                  {record.tags.length === 0 && (
                    <span className="text-[12px] text-stone-300">无标签</span>
                  )}
                </div>
              </FieldGroup>

              {/* 主题 */}
              <FieldGroup label="主题">
                <p className="text-[13px] text-stone-800">{record.topic || <span className="text-stone-300">无主题</span>}</p>
              </FieldGroup>

              {/* 推进等级 */}
              <FieldGroup label="推进建议">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg text-[11px] font-medium ${PROMOTE_COLORS[record.promoteLevel]}`}>
                  {record.promoteLevel === "建议行动" || record.promoteLevel === "建议立项" ? (
                    <span className={`w-[5px] h-[5px] rounded-full ${PROMOTE_DOT[record.promoteLevel]}`} />
                  ) : null}
                  {record.promoteLevel}
                </span>
              </FieldGroup>

              {/* 状态信息条 */}
              {record.aiStatus === "done" && (record.userEdited || record.feedbackStatus !== "未反馈" || record.preferenceApplied) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {record.userEdited && (
                    <span className="px-2 py-[2px] rounded-md text-[10px] font-medium bg-amber-50 text-amber-600">
                      已手动调整
                    </span>
                  )}
                  {record.feedbackStatus && record.feedbackStatus !== "未反馈" && (
                    <span className="px-2 py-[2px] rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-600">
                      已记录反馈
                    </span>
                  )}
                  {record.preferenceApplied && (
                    <span className="px-2 py-[2px] rounded-md text-[10px] font-medium bg-violet-50 text-violet-600">
                      已记住偏好
                    </span>
                  )}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleStartEditResult}
                  className="px-3 py-2 rounded-lg text-[11px] font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 active:bg-stone-200 transition-colors"
                >
                  编辑整理结果
                </button>
                <button
                  onClick={() => reOrganizeRecord(record.id)}
                  className="px-3 py-2 rounded-lg text-[11px] font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 active:bg-stone-200 transition-colors"
                >
                  重新整理
                </button>
                {record.userEdited && record.aiOriginalResult && (
                  <button
                    onClick={handleRestoreOriginal}
                    className="px-3 py-2 rounded-lg text-[11px] font-medium bg-stone-100 text-stone-500 hover:bg-stone-200 active:bg-stone-200 transition-colors"
                  >
                    恢复 AI 原结果
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ========== 4. AI 建议的下一步区 ========== */}
        {record.aiStatus === "done" && !isEditingResult && (
          <section className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in" style={{ animationDelay: "90ms" }}>
            <SectionLabel color="bg-emerald-400">AI 建议的下一步</SectionLabel>
            <p className="text-[11px] text-stone-400 mt-1 mb-3 leading-relaxed">
              以下内容由 AI 自动生成，你可以采纳、修改或忽略。这些建议不会自动变成任务。
            </p>

            {record.suggestions.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[13px] text-stone-400">当前没有建议的下一步</p>
                <p className="text-[11px] text-stone-300 mt-1">这条记录更适合先保存观察</p>
              </div>
            ) : (
              <div className="space-y-3">
                {record.suggestions.map((s, i) => {
                  const adopted = isAdopted(s);
                  const isEditing = editingSuggestionIndex === i;
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-3 transition-all ${
                        adopted
                          ? "bg-stone-50 border-stone-100 opacity-60"
                          : "bg-white border-stone-100"
                      }`}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editingSuggestionText}
                            onChange={(e) => setEditingSuggestionText(e.target.value)}
                            className="w-full px-2 py-1.5 bg-stone-50 rounded-lg text-[13px] text-stone-700 border border-stone-200/80 focus:ring-1 focus:ring-stone-300/40 transition-all"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleCancelSuggestionEdit}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleSaveSuggestionEdit}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-stone-900 text-white hover:bg-stone-800 transition-colors"
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start gap-2.5">
                            <span className="shrink-0 mt-[1px] w-[18px] h-[18px] rounded-full bg-stone-100 text-stone-500 flex items-center justify-center text-[10px] font-semibold">
                              {i + 1}
                            </span>
                            <p className={`text-[13px] leading-[1.6] flex-1 ${adopted ? "text-stone-400 line-through" : "text-stone-700"}`}>
                              {s}
                            </p>
                          </div>

                          {!adopted && (
                            <div className="mt-2.5 pl-[26px] flex flex-wrap gap-2">
                              {/* 第一行操作 */}
                              <button
                                onClick={() => handleConvertToTodo(s)}
                                className="px-2.5 py-[3px] rounded-md text-[11px] font-medium bg-amber-50 text-amber-600 hover:bg-amber-100 active:bg-amber-100 transition-colors"
                              >
                                转为待办
                              </button>
                              <button
                                onClick={() => handleAddToBrief(s)}
                                disabled={generatingBrief}
                                className="px-2.5 py-[3px] rounded-md text-[11px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-100 transition-colors disabled:opacity-50"
                              >
                                {generatingBrief ? "处理中..." : "加入推进卡"}
                              </button>
                              {/* 第二行操作 */}
                              <button
                                onClick={() => handleStartEditSuggestion(i)}
                                className="px-2.5 py-[3px] rounded-md text-[11px] font-medium bg-stone-50 text-stone-500 hover:bg-stone-100 active:bg-stone-100 transition-colors"
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => handleDeleteSuggestion(i)}
                                className="px-2.5 py-[3px] rounded-md text-[11px] font-medium bg-stone-50 text-stone-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-50 transition-colors"
                              >
                                删除
                              </button>
                            </div>
                          )}

                          {adopted && (
                            <div className="mt-1.5 pl-[26px]">
                              <span className="text-[10px] text-stone-300">
                                {record.adoptedSuggestions?.find((a) => a.content === s)?.as === "todo"
                                  ? "已转为待办"
                                  : record.adoptedSuggestions?.find((a) => a.content === s)?.targetId
                                    ? "已加入推进卡"
                                    : "待生成推进卡"}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ========== 5. 已采纳的内容区 ========== */}
        {record.adoptedSuggestions && record.adoptedSuggestions.length > 0 && (
          <section className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in" style={{ animationDelay: "120ms" }}>
            <SectionLabel color="bg-teal-400">已采纳的内容</SectionLabel>
            <div className="mt-3 space-y-2.5">
              {record.adoptedSuggestions.map((adopted, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-100"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${adopted.as === "todo" ? "bg-amber-400" : "bg-blue-400"}`} />
                    <span className="text-[13px] text-stone-600 truncate">{adopted.content}</span>
                  </div>
                  <span className={`shrink-0 ml-2 px-2 py-[2px] rounded-md text-[10px] font-medium ${
                    adopted.as === "todo" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                  }`}>
                    {adopted.as === "todo" ? "已转为待办" : adopted.targetId ? "已加入推进卡" : "待生成推进卡"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ========== 反馈模块 ========== */}
        {record.aiStatus === "done" && !isEditingResult && (
          <section className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in" style={{ animationDelay: "150ms" }}>
            <SectionLabel color="bg-emerald-400">整理反馈</SectionLabel>
            <div className="mt-3 space-y-3">
              {/* 快速反馈按钮 */}
              <div className="flex gap-2">
                {(["准确", "一般", "不合适"] as FeedbackStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleFeedback(status)}
                    className={`flex-1 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-150 ${
                      record.feedbackStatus === status
                        ? status === "准确"
                          ? "bg-emerald-50 text-emerald-700 ring-[1.5px] ring-emerald-200"
                          : status === "一般"
                          ? "bg-amber-50 text-amber-700 ring-[1.5px] ring-amber-200"
                          : "bg-rose-50 text-rose-700 ring-[1.5px] ring-rose-200"
                        : "bg-stone-50 text-stone-500 hover:bg-stone-100 active:bg-stone-100"
                    }`}
                  >
                    {record.feedbackStatus === status && "✓ "}{status}
                  </button>
                ))}
              </div>

              {/* 已反馈提示 */}
              {record.feedbackStatus && record.feedbackStatus !== "未反馈" && (
                <p className="text-[11px] text-stone-400 text-center">已记录反馈</p>
              )}
            </div>
          </section>
        )}

        {/* 反馈详情弹窗 */}
        {showFeedbackDetail && (
          <FeedbackReasonSheet
            currentStatus={record.feedbackStatus as FeedbackStatus}
            selectedReasons={record.feedbackReasons || []}
            onSubmit={(reasons) => handleFeedbackWithReasons(record.feedbackStatus as FeedbackStatus, reasons)}
            onClose={() => setShowFeedbackDetail(false)}
          />
        )}

        {/* ========== 6. 页面底部操作区 ========== */}
        {record.aiStatus === "done" && !isEditingResult && !record.archived && (
          <section className="bg-white rounded-2xl p-5 border border-stone-200/50 animate-fade-in" style={{ animationDelay: "180ms" }}>
            <SectionLabel color="bg-stone-200">操作</SectionLabel>
            <div className="mt-3 space-y-2">
              {/* 主按钮：生成 Brief */}
              <button
                onClick={handleGenerateBrief}
                disabled={generatingBrief}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors disabled:opacity-50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                {generatingBrief ? "生成 Brief 中..." : "生成推进卡"}
              </button>

              {/* 次按钮行 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmAction("archive")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 active:bg-stone-200 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8V21H3V8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                  归档
                </button>
                <button
                  onClick={() => setConfirmAction("delete")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-rose-500 hover:bg-rose-50 active:bg-rose-100 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  删除
                </button>
              </div>
            </div>
          </section>
        )}

        {/* 已归档记录的恢复按钮 */}
        {record.archived && (
          <section className="bg-white rounded-2xl p-5 border border-stone-200/50 animate-fade-in">
            <SectionLabel color="bg-stone-200">操作</SectionLabel>
            <div className="mt-3">
              <button
                onClick={() => setConfirmAction("restore")}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 8V21H3V8" />
                  <rect x="1" y="3" width="22" height="5" />
                  <line x1="10" y1="12" x2="14" y2="12" />
                </svg>
                恢复记录
              </button>
            </div>
          </section>
        )}
      </div>

      {/* ========== 更多菜单弹窗 ========== */}
      {showMoreMenu && (
        <MoreMenuSheet
          isArchived={record.archived}
          onAction={handleMoreAction}
          onClose={() => setShowMoreMenu(false)}
        />
      )}

      {/* ========== 确认弹窗 ========== */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={() => setConfirmAction(null)}>
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5" />
            {confirmAction === "archive" && (
              <>
                <h3 className="text-[15px] font-semibold text-stone-900 mb-2">确认归档</h3>
                <p className="text-[13px] text-stone-500 mb-6 leading-relaxed">
                  归档后记录将从收件箱中隐藏，但不会删除。你可以在收件箱的「已归档」中找到并恢复它。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleArchive}
                    className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors"
                  >
                    确认归档
                  </button>
                </div>
              </>
            )}
            {confirmAction === "restore" && (
              <>
                <h3 className="text-[15px] font-semibold text-stone-900 mb-2">恢复记录</h3>
                <p className="text-[13px] text-stone-500 mb-6 leading-relaxed">
                  恢复后记录将重新显示在收件箱中。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleRestore}
                    className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors"
                  >
                    确认恢复
                  </button>
                </div>
              </>
            )}
            {confirmAction === "delete" && (
              <>
                <h3 className="text-[15px] font-semibold text-rose-600 mb-2">删除记录</h3>
                <p className="text-[13px] text-stone-500 mb-6 leading-relaxed">
                  删除后无法恢复，请确认你不再需要这条记录。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-rose-600 text-white active:bg-rose-700 transition-colors"
                  >
                    确认删除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== 更多菜单弹窗 ========== */

function MoreMenuSheet({
  isArchived,
  onAction,
  onClose,
}: {
  isArchived: boolean;
  onAction: (action: "archive" | "delete" | "reorganize") => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5" />
        <h3 className="text-[15px] font-semibold text-stone-900 mb-4">更多操作</h3>
        <div className="space-y-1">
          {!isArchived && (
            <button
              onClick={() => onAction("reorganize")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium text-stone-600 hover:bg-stone-50 active:bg-stone-100 transition-colors text-left"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              重新整理
            </button>
          )}
          <button
            onClick={() => onAction(isArchived ? "archive" : "archive")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium text-stone-600 hover:bg-stone-50 active:bg-stone-100 transition-colors text-left"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8V21H3V8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            {isArchived ? "恢复记录" : "归档"}
          </button>
          <button
            onClick={() => onAction("delete")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium text-rose-500 hover:bg-rose-50 active:bg-rose-100 transition-colors text-left"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            删除
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}

/* ========== 反馈原因弹窗 ========== */

function FeedbackReasonSheet({
  currentStatus,
  selectedReasons,
  onSubmit,
  onClose,
}: {
  currentStatus: FeedbackStatus;
  selectedReasons: string[];
  onSubmit: (reasons: string[]) => void;
  onClose: () => void;
}) {
  const [reasons, setReasons] = useState<string[]>(selectedReasons);

  const toggleReason = (reason: string) => {
    setReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5" />
        <h3 className="text-[15px] font-semibold text-stone-900 mb-2">
          哪些地方需要改进？
        </h3>
        <p className="text-[12px] text-stone-400 mb-4">
          你的反馈会帮助后续整理更准确（可多选）
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {FEEDBACK_REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => toggleReason(reason)}
              className={`px-3 py-2 rounded-xl text-[12px] font-medium transition-all duration-150 ${
                reasons.includes(reason)
                  ? "bg-stone-900 text-white"
                  : "bg-stone-50 text-stone-600 hover:bg-stone-100 active:bg-stone-100"
              }`}
            >
              {reason}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
          >
            跳过
          </button>
          <button
            onClick={() => { onSubmit(reasons); onClose(); }}
            className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors"
          >
            提交反馈
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========== 通用子组件 ========== */

function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-[3px] h-3.5 rounded-full ${color}`} />
      <h2 className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest">
        {children}
      </h2>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-stone-300 font-semibold uppercase tracking-widest mb-2 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function AddItemInline({ onAdd, placeholder }: { onAdd: (text: string) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue("");
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="px-2.5 py-[5px] rounded-lg text-[11px] text-stone-400 border border-dashed border-stone-200 hover:border-stone-300 hover:text-stone-500 transition-colors"
      >
        + 添加
      </button>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSubmit();
        if (e.key === "Escape") {
          setEditing(false);
          setValue("");
        }
      }}
      placeholder={placeholder}
      autoFocus
      className="px-2.5 py-[5px] rounded-lg text-[11px] bg-stone-50 border border-stone-300 focus:ring-1 focus:ring-stone-300 w-20"
    />
  );
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${hour}:${min}`;
}
