import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context";
import {
  TYPE_COLORS,
  PROMOTE_COLORS,
  PROMOTE_DOT,
  RECORD_TYPES,
  PROMOTE_LEVELS,
  FEEDBACK_REASONS,
} from "../types";
import type { RecordType, PromoteLevel, ThoughtRecord, FeedbackStatus } from "../types";

type ConfirmAction = "archive" | "delete" | "restore" | null;

/** 对比编辑前后，找出哪些字段被修改了 */
function getEditedFields(original: ThoughtRecord, current: EditFormState): string[] {
  const fields: string[] = [];
  if (original.aiTitle !== current.aiTitle) fields.push("aiTitle");
  if (original.aiSummary !== current.aiSummary) fields.push("aiSummary");
  if (original.type !== current.type) fields.push("type");
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
  tags: string[];
  topic: string;
  promoteLevel: PromoteLevel;
  suggestions: string[];
}

export default function RecordDetailPage() {
  const { organizeStatus, saveEditWithPreference, submitFeedback, generateBriefFromRecordData } = useApp();
  const { id } = useParams<{ id: string }>();
  const { getRecord, updateRecord, deleteRecord, reOrganizeRecord } = useApp();
  const navigate = useNavigate();
  const record = id ? getRecord(id) : undefined;

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  // 编辑模式状态
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [rememberPreference, setRememberPreference] = useState(true);

  // 反馈状态
  const [showFeedbackDetail, setShowFeedbackDetail] = useState(false);

  // Brief 生成状态
  const [generatingBrief, setGeneratingBrief] = useState(false);

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

  const handleStartEdit = () => {
    setEditForm({
      aiTitle: record.aiTitle,
      aiSummary: record.aiSummary,
      type: record.type,
      tags: [...record.tags],
      topic: record.topic,
      promoteLevel: record.promoteLevel,
      suggestions: [...record.suggestions],
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    const editedFields = getEditedFields(record, editForm);
    if (editedFields.length === 0) {
      setIsEditing(false);
      setEditForm(null);
      return;
    }
    // 先更新记录字段
    const updated: ThoughtRecord = {
      ...record,
      aiTitle: editForm.aiTitle,
      aiSummary: editForm.aiSummary,
      type: editForm.type,
      tags: editForm.tags,
      topic: editForm.topic,
      promoteLevel: editForm.promoteLevel,
      suggestions: editForm.suggestions,
    };
    saveEditWithPreference(updated, editedFields, rememberPreference);
    setIsEditing(false);
    setEditForm(null);
  };

  const handleRestoreOriginal = () => {
    if (!record.aiOriginalResult) return;
    const original = record.aiOriginalResult;
    const restored: ThoughtRecord = {
      ...record,
      aiTitle: original.title,
      aiSummary: original.summary,
      type: (RECORD_TYPES.includes(original.type as RecordType) ? original.type : "灵感") as RecordType,
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

  const handleReOrganize = () => {
    reOrganizeRecord(record.id);
  };

  const handleGenerateBrief = async () => {
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

  // 编辑表单中的操作
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

  return (
    <div className="flex flex-col h-full bg-stone-100">
      {/* 整理状态 Toast */}
      {organizeStatus && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-stone-900 text-white text-[12px] font-medium rounded-full shadow-lg animate-fade-in">
          {organizeStatus}
        </div>
      )}
      {/* 顶部栏 */}
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
        <button
          onClick={() => setConfirmAction(record.archived ? "restore" : "archive")}
          className="text-[13px] text-stone-400 active:text-stone-500 transition-colors min-w-[48px] text-right py-1"
        >
          {record.archived ? "恢复" : "归档"}
        </button>
      </div>

      {/* 滚动内容区 */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {/* 区块一：原始记录 */}
        <section className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in">
          <SectionLabel color="bg-stone-300">原始记录</SectionLabel>
          <p className="text-[14px] text-stone-700 whitespace-pre-wrap leading-[1.75] mt-3">
            {record.rawText}
          </p>
          <p className="mt-4 text-[11px] text-stone-300 font-medium">
            {formatDateTime(record.createdAt)}
          </p>
        </section>

        {/* 区块二：AI 整理结果 */}
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
              {!isEditing && record.aiStatus === "done" && (
                <button
                  onClick={handleStartEdit}
                  className="px-2 py-[2px] rounded-md text-[10px] font-medium bg-stone-100 text-stone-500 hover:bg-stone-200 active:bg-stone-200 transition-colors"
                >
                  编辑
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
              <p className="text-[13px] font-medium">AI 正在整理...</p>
              <p className="text-[12px] text-stone-300 mt-1">稍等片刻</p>
            </div>
          ) : isEditing && editForm ? (
            /* ========== 编辑模式 ========== */
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
                  onClick={handleCancelEdit}
                  className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 py-3 rounded-xl text-[13px] font-medium bg-stone-900 text-white active:bg-stone-800 transition-colors"
                >
                  保存修改
                </button>
              </div>
            </div>
          ) : (
            /* ========== 只读模式 ========== */
            <div className="space-y-5 mt-3">
              {/* 标题 */}
              <FieldGroup label="标题">
                <p className="text-[15px] font-semibold text-stone-800 leading-snug">{record.aiTitle}</p>
              </FieldGroup>

              {/* 摘要 */}
              <FieldGroup label="摘要">
                <p className="text-[13px] text-stone-600 leading-[1.7]">{record.aiSummary}</p>
              </FieldGroup>

              {/* 建议类型 */}
              <FieldGroup label="建议类型">
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-2.5 py-[5px] rounded-lg text-[11px] font-medium ${TYPE_COLORS[record.type]}`}>
                    {record.type}
                  </span>
                  {record.aiSubType && (
                    <span className="text-[11px] text-stone-400">
                      {record.aiSubType}
                    </span>
                  )}
                </div>
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
                </div>
              </FieldGroup>

              {/* 主题 */}
              <FieldGroup label="主题">
                <p className="text-[13px] text-stone-800">{record.topic}</p>
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

              {/* 下一步建议 */}
              {record.suggestions.length > 0 && (
                <FieldGroup label="下一步建议">
                  <ul className="space-y-2.5">
                    {record.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="shrink-0 mt-[3px] w-[18px] h-[18px] rounded-full bg-stone-100 text-stone-500 flex items-center justify-center text-[10px] font-semibold">
                          {i + 1}
                        </span>
                        <span className="text-[13px] text-stone-600 leading-[1.6]">{s}</span>
                      </li>
                    ))}
                  </ul>
                </FieldGroup>
              )}

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

              {/* 恢复 AI 原结果 */}
              {record.userEdited && record.aiOriginalResult && (
                <button
                  onClick={handleRestoreOriginal}
                  className="w-full py-2.5 rounded-xl text-[12px] font-medium bg-stone-50 text-stone-500 hover:bg-stone-100 active:bg-stone-100 transition-colors border border-stone-200/50"
                >
                  恢复 AI 原结果
                </button>
              )}
            </div>
          )}
        </section>

        {/* 区块三：反馈模块 */}
        {record.aiStatus === "done" && !isEditing && (
          <section className="bg-white rounded-2xl p-5 border border-stone-200/50 mb-3 animate-fade-in" style={{ animationDelay: "90ms" }}>
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

        {/* 反馈详情弹窗（一般/不合适时展示原因标签） */}
        {showFeedbackDetail && (
          <FeedbackReasonSheet
            currentStatus={record.feedbackStatus as FeedbackStatus}
            selectedReasons={record.feedbackReasons || []}
            onSubmit={(reasons) => handleFeedbackWithReasons(record.feedbackStatus as FeedbackStatus, reasons)}
            onClose={() => setShowFeedbackDetail(false)}
          />
        )}

        {/* 区块四：操作区 */}
        <section className="bg-white rounded-2xl p-5 border border-stone-200/50 animate-fade-in" style={{ animationDelay: "120ms" }}>
          <SectionLabel color="bg-stone-200">操作</SectionLabel>
          <div className="space-y-1 mt-3">
            {record.aiStatus === "done" && !record.archived && (
              <ActionButton
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                }
                label={generatingBrief ? "生成 Brief 中..." : "转为推进卡"}
                onClick={handleGenerateBrief}
                disabled={generatingBrief}
              />
            )}
            <ActionButton
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              }
              label="重新整理"
              onClick={handleReOrganize}
            />
            {record.archived ? (
              <ActionButton
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8V21H3V8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                }
                label="恢复记录"
                onClick={() => setConfirmAction("restore")}
              />
            ) : (
              <ActionButton
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8V21H3V8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                }
                label="归档此记录"
                onClick={() => setConfirmAction("archive")}
              />
            )}
            <ActionButton
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              }
              label="删除记录"
              onClick={() => setConfirmAction("delete")}
              danger
            />
          </div>
        </section>
      </div>

      {/* 确认弹窗 */}
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
                  ⚠️ 删除后无法恢复，请确认你不再需要这条记录。
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

function ActionButton({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium transition-colors disabled:opacity-50 ${
        danger
          ? "text-rose-500 hover:bg-rose-50 active:bg-rose-100"
          : "text-stone-600 hover:bg-stone-50 active:bg-stone-100"
      }`}
    >
      {icon}
      {label}
    </button>
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
