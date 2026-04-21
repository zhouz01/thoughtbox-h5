import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { BRIEF_STATUSES, BRIEF_STATUS_COLORS } from "../types";
import type { BriefStatus, ProjectBrief } from "../types";
import { WorkspaceLink } from "../components/WorkspaceLink";

interface EditFormState {
  title: string;
  summary: string;
  problemStatement: string;
  objective: string;
  targetContext: string;
  whyNow: string;
  scopeNow: string[];
  scopeLater: string[];
  deliverables: string[];
  risksAndQuestions: string[];
  topic: string;
  status: BriefStatus;
}

export default function BriefDetailPage() {
  const { getBrief, updateBrief, deleteBriefById, records, generateBriefFromRecordData, generateBriefFromSynthesisData, toggleBriefAction, addBriefAction, updateBriefAction, deleteBriefAction } = useApp();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const brief = id ? getBrief(id) : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newActionText, setNewActionText] = useState("");

  // 来源记录
  const sourceRecords = useMemo(() => {
    if (!brief) return [];
    return brief.sourceRecordIds
      .map((rid) => records.find((r) => r.id === rid))
      .filter((r): r is NonNullable<typeof r> => r != null);
  }, [brief, records]);

  // 来源汇总
  const sourceSynthesis = useMemo(() => {
    if (!brief?.sourceSynthesisId) return null;
    // 从 syntheses 中查找
    return null; // context 中暂未暴露 getSynthesis，通过 brief 自身信息展示
  }, [brief]);

  if (!brief) {
    return (
      <div className="px-5 pt-8 pb-4">
        <div className="text-center py-20">
          <p className="text-stone-400 text-sm">未找到该推进卡</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-[13px] font-medium"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const doneCount = brief.nextActions.filter((a) => a.done).length;
  const totalCount = brief.nextActions.length;

  const handleStartEdit = () => {
    setEditForm({
      title: brief.title,
      summary: brief.summary,
      problemStatement: brief.problemStatement,
      objective: brief.objective,
      targetContext: brief.targetContext,
      whyNow: brief.whyNow,
      scopeNow: [...brief.scopeNow],
      scopeLater: [...brief.scopeLater],
      deliverables: [...brief.deliverables],
      risksAndQuestions: [...brief.risksAndQuestions],
      topic: brief.topic || "",
      status: brief.status,
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    const now = new Date().toISOString();
    const editedFields: string[] = [];
    if (brief.title !== editForm.title) editedFields.push("title");
    if (brief.summary !== editForm.summary) editedFields.push("summary");
    if (brief.problemStatement !== editForm.problemStatement) editedFields.push("problemStatement");
    if (brief.objective !== editForm.objective) editedFields.push("objective");
    if (brief.targetContext !== editForm.targetContext) editedFields.push("targetContext");
    if (brief.whyNow !== editForm.whyNow) editedFields.push("whyNow");
    if (JSON.stringify(brief.scopeNow) !== JSON.stringify(editForm.scopeNow)) editedFields.push("scopeNow");
    if (JSON.stringify(brief.scopeLater) !== JSON.stringify(editForm.scopeLater)) editedFields.push("scopeLater");
    if (JSON.stringify(brief.deliverables) !== JSON.stringify(editForm.deliverables)) editedFields.push("deliverables");
    if (JSON.stringify(brief.risksAndQuestions) !== JSON.stringify(editForm.risksAndQuestions)) editedFields.push("risksAndQuestions");
    if (brief.topic !== editForm.topic) editedFields.push("topic");
    if (brief.status !== editForm.status) editedFields.push("status");

    const updated: ProjectBrief = {
      ...brief,
      title: editForm.title,
      summary: editForm.summary,
      problemStatement: editForm.problemStatement,
      objective: editForm.objective,
      targetContext: editForm.targetContext,
      whyNow: editForm.whyNow,
      scopeNow: editForm.scopeNow,
      scopeLater: editForm.scopeLater,
      deliverables: editForm.deliverables,
      risksAndQuestions: editForm.risksAndQuestions,
      topic: editForm.topic || undefined,
      status: editForm.status,
      userEdited: editedFields.length > 0 ? true : brief.userEdited,
      userEditedAt: editedFields.length > 0 ? now : brief.userEditedAt,
      editedFields: editedFields.length > 0 ? editedFields : brief.editedFields,
      updatedAt: now,
    };
    updateBrief(updated);
    setIsEditing(false);
    setEditForm(null);
  };

  const handleRestoreOriginal = () => {
    if (!brief.aiOriginalBriefResult) return;
    const now = new Date().toISOString();
    const orig = brief.aiOriginalBriefResult;
    const updated: ProjectBrief = {
      ...brief,
      title: orig.title,
      summary: orig.summary,
      problemStatement: orig.problemStatement,
      objective: orig.objective,
      targetContext: orig.targetContext,
      whyNow: orig.whyNow,
      scopeNow: orig.scopeNow,
      scopeLater: orig.scopeLater,
      deliverables: orig.deliverables,
      risksAndQuestions: orig.risksAndQuestions,
      // nextActions 不恢复（用户可能已经手动添加了）
      userEdited: false,
      userEditedAt: undefined,
      editedFields: [],
      updatedAt: now,
    };
    updateBrief(updated);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      let result: ProjectBrief | null = null;
      if (brief.sourceType === "record" && brief.sourceRecordIds.length > 0) {
        result = await generateBriefFromRecordData(brief.sourceRecordIds[0]);
      } else if (brief.sourceType === "synthesis" && brief.sourceSynthesisId) {
        result = await generateBriefFromSynthesisData(brief.sourceSynthesisId);
      }
      if (result && result.id !== brief.id) {
        navigate(`/brief/${result.id}`, { replace: true });
      }
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = () => {
    deleteBriefById(brief.id);
    navigate("/briefs", { replace: true });
  };

  const handleAddAction = () => {
    if (!newActionText.trim()) return;
    addBriefAction(brief.id, newActionText.trim());
    setNewActionText("");
  };

  // 编辑表单中的列表操作
  const editRemoveItem = (field: "scopeNow" | "scopeLater" | "deliverables" | "risksAndQuestions", index: number) => {
    if (!editForm) return;
    const list = [...editForm[field]];
    list.splice(index, 1);
    setEditForm({ ...editForm, [field]: list });
  };

  const editAddItem = (field: "scopeNow" | "scopeLater" | "deliverables" | "risksAndQuestions", value: string) => {
    if (!editForm || !value.trim()) return;
    setEditForm({ ...editForm, [field]: [...editForm[field], value.trim()] });
  };

  return (
    <div className="px-5 pt-4 pb-8">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center text-stone-500 active:bg-stone-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-bold text-stone-900 truncate">
            {brief.title}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`px-2 py-[2px] rounded-md text-[10px] font-medium ${BRIEF_STATUS_COLORS[brief.status]}`}>
              {brief.status}
            </span>
            <span className="text-[11px] text-stone-300">·</span>
            <span className="text-[11px] text-stone-400 font-medium">
              {brief.source === "ai" ? "AI 生成" : "本地生成"}{brief.aiModel ? ` · ${brief.aiModel}` : ""}
            </span>
            <span className="text-[11px] text-stone-300">·</span>
            <span className="text-[11px] text-stone-400">{formatShortTime(brief.createdAt)}</span>
          </div>
        </div>
        {!isEditing && (
          <div className="flex items-center gap-2">
            <WorkspaceLink view="briefs" briefId={brief.id} label="在工作台打开" />
            <button
              onClick={handleStartEdit}
              className="px-3 py-1.5 text-[12px] font-medium text-stone-600 bg-white rounded-xl border border-stone-200/80 active:bg-stone-50"
            >
              编辑
            </button>
          </div>
        )}
      </div>

      {isEditing && editForm ? (
        /* ========== 编辑模式 ========== */
        <div className="space-y-4">
          <EditField label="标题">
            <input
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[14px] text-stone-800 font-semibold border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all"
            />
          </EditField>

          <EditField label="简介">
            <textarea
              value={editForm.summary}
              onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-600 leading-[1.7] border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all resize-none"
            />
          </EditField>

          <EditField label="当前要解决的问题">
            <textarea
              value={editForm.problemStatement}
              onChange={(e) => setEditForm({ ...editForm, problemStatement: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-600 leading-[1.7] border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all resize-none"
            />
          </EditField>

          <EditField label="本次目标">
            <input
              type="text"
              value={editForm.objective}
              onChange={(e) => setEditForm({ ...editForm, objective: e.target.value })}
              className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-600 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all"
            />
          </EditField>

          <EditField label="使用场景">
            <input
              type="text"
              value={editForm.targetContext}
              onChange={(e) => setEditForm({ ...editForm, targetContext: e.target.value })}
              className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-600 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all"
            />
          </EditField>

          <EditField label="为什么现在值得推进">
            <input
              type="text"
              value={editForm.whyNow}
              onChange={(e) => setEditForm({ ...editForm, whyNow: e.target.value })}
              className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-600 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all"
            />
          </EditField>

          <EditListField label="当前先做" items={editForm.scopeNow} onRemove={(i) => editRemoveItem("scopeNow", i)} onAdd={(v) => editAddItem("scopeNow", v)} />
          <EditListField label="后续再做" items={editForm.scopeLater} onRemove={(i) => editRemoveItem("scopeLater", i)} onAdd={(v) => editAddItem("scopeLater", v)} />
          <EditListField label="本轮产出" items={editForm.deliverables} onRemove={(i) => editRemoveItem("deliverables", i)} onAdd={(v) => editAddItem("deliverables", v)} />
          <EditListField label="待确认问题" items={editForm.risksAndQuestions} onRemove={(i) => editRemoveItem("risksAndQuestions", i)} onAdd={(v) => editAddItem("risksAndQuestions", v)} />

          <EditField label="主题">
            <input
              type="text"
              value={editForm.topic}
              onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
              className="w-full px-3 py-2 bg-stone-50 rounded-lg text-[13px] text-stone-600 border border-stone-200/80 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 transition-all"
            />
          </EditField>

          <EditField label="状态">
            <div className="flex flex-wrap gap-1.5">
              {BRIEF_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setEditForm({ ...editForm, status: s })}
                  className={`px-2.5 py-[5px] rounded-lg text-[11px] font-medium transition-all duration-150 ${
                    editForm.status === s
                      ? BRIEF_STATUS_COLORS[s] + " ring-[1.5px] ring-offset-1 ring-current/20"
                      : "bg-stone-50 text-stone-400 active:bg-stone-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </EditField>

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
        <div className="space-y-4">
          {/* 简介 */}
          <SectionBlock title="简介">
            <p className="text-[13px] text-stone-700 leading-[1.7]">{brief.summary}</p>
          </SectionBlock>

          {/* 当前要解决的问题 */}
          {brief.problemStatement && (
            <SectionBlock title="当前要解决的问题">
              <p className="text-[13px] text-stone-700 leading-[1.7]">{brief.problemStatement}</p>
            </SectionBlock>
          )}

          {/* 本次目标 */}
          {brief.objective && (
            <SectionBlock title="本次目标">
              <p className="text-[13px] text-stone-700 leading-[1.7]">{brief.objective}</p>
            </SectionBlock>
          )}

          {/* 使用场景 */}
          {brief.targetContext && (
            <SectionBlock title="使用场景">
              <p className="text-[13px] text-stone-700 leading-[1.7]">{brief.targetContext}</p>
            </SectionBlock>
          )}

          {/* 为什么现在值得推进 */}
          {brief.whyNow && (
            <SectionBlock title="为什么现在值得推进">
              <p className="text-[13px] text-stone-700 leading-[1.7]">{brief.whyNow}</p>
            </SectionBlock>
          )}

          {/* 当前先做 */}
          {brief.scopeNow.length > 0 && (
            <SectionBlock title="当前先做">
              <ul className="space-y-1.5">
                {brief.scopeNow.map((s, i) => (
                  <li key={i} className="text-[13px] text-stone-700 leading-[1.6] flex items-start gap-2">
                    <span className="shrink-0 mt-[5px] w-[5px] h-[5px] rounded-full bg-emerald-400" />
                    {s}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* 后续再做 */}
          {brief.scopeLater.length > 0 && (
            <SectionBlock title="后续再做">
              <ul className="space-y-1.5">
                {brief.scopeLater.map((s, i) => (
                  <li key={i} className="text-[13px] text-stone-500 leading-[1.6] flex items-start gap-2">
                    <span className="shrink-0 mt-[5px] w-[5px] h-[5px] rounded-full bg-stone-300" />
                    {s}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* 本轮产出 */}
          {brief.deliverables.length > 0 && (
            <SectionBlock title="本轮产出">
              <ul className="space-y-1.5">
                {brief.deliverables.map((s, i) => (
                  <li key={i} className="text-[13px] text-stone-700 leading-[1.6] flex items-start gap-2">
                    <span className="shrink-0 mt-[5px] w-[5px] h-[5px] rounded-full bg-blue-400" />
                    {s}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* 待确认问题 */}
          {brief.risksAndQuestions.length > 0 && (
            <SectionBlock title="待确认问题">
              <ul className="space-y-1.5">
                {brief.risksAndQuestions.map((s, i) => (
                  <li key={i} className="text-[13px] text-stone-700 leading-[1.6] flex items-start gap-2">
                    <span className="shrink-0 mt-[5px] w-[5px] h-[5px] rounded-full bg-amber-400" />
                    {s}
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* 行动清单 */}
          <SectionBlock title="下一步行动">
            {totalCount > 0 && (
              <p className="text-[11px] text-stone-400 mb-2.5">
                已完成 {doneCount} / {totalCount}
              </p>
            )}
            <div className="space-y-2">
              {brief.nextActions.map((action) => (
                <div key={action.id} className="flex items-start gap-2.5 group">
                  <button
                    onClick={() => toggleBriefAction(brief.id, action.id)}
                    className={`shrink-0 mt-[3px] w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all ${
                      action.done
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-stone-300 bg-white hover:border-stone-400"
                    }`}
                  >
                    {action.done && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <span className={`text-[13px] leading-[1.6] flex-1 ${action.done ? "text-stone-400 line-through" : "text-stone-700"}`}>
                    {action.content}
                  </span>
                  <button
                    onClick={() => deleteBriefAction(brief.id, action.id)}
                    className="shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-600"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            {/* 添加新行动 */}
            <div className="flex items-center gap-2 mt-3">
              <input
                type="text"
                value={newActionText}
                onChange={(e) => setNewActionText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddAction(); }}
                placeholder="添加一个下一步..."
                className="flex-1 px-3 py-2 bg-stone-50 rounded-lg text-[12px] text-stone-700 border border-stone-200/80 focus:ring-1 focus:ring-stone-300/40 transition-all placeholder:text-stone-300"
              />
              <button
                onClick={handleAddAction}
                disabled={!newActionText.trim()}
                className="px-3 py-2 bg-stone-900 text-white rounded-lg text-[12px] font-medium disabled:opacity-30 active:bg-stone-800 transition-colors"
              >
                添加
              </button>
            </div>
            {totalCount === 0 && (
              <p className="text-[11px] text-stone-400 mt-2">还没有行动项，先添加一个最小的下一步</p>
            )}
          </SectionBlock>

          {/* 来源内容 */}
          <SectionBlock title="来源内容">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-[2px] rounded-md text-[10px] font-medium ${
                brief.sourceType === "record" ? "bg-indigo-50 text-indigo-500" : "bg-teal-50 text-teal-600"
              }`}>
                {brief.sourceType === "record" ? "来自记录" : "来自汇总"}
              </span>
              <span className={`px-2 py-[2px] rounded-md text-[10px] font-medium ${
                brief.source === "ai" ? "bg-indigo-50 text-indigo-500" : "bg-stone-50 text-stone-400"
              }`}>
                {brief.source === "ai" ? "AI 生成" : "本地生成"}
              </span>
            </div>
            {brief.sourceSummary && (
              <p className="text-[12px] text-stone-500 leading-[1.6] mb-2 line-clamp-3">
                {brief.sourceSummary}
              </p>
            )}
            {sourceRecords.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {sourceRecords.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/record/${r.id}`)}
                    className="w-full text-left px-3 py-2 bg-stone-50 rounded-lg text-[12px] text-stone-600 hover:bg-stone-100 active:bg-stone-100 transition-colors truncate"
                  >
                    {r.aiTitle || r.rawText.slice(0, 30)}
                  </button>
                ))}
                {sourceRecords.length > 5 && (
                  <p className="text-[11px] text-stone-400">还有 {sourceRecords.length - 5} 条来源记录</p>
                )}
              </div>
            )}
            {brief.sourceSynthesisId && (
              <button
                onClick={() => navigate(`/synthesis/${brief.sourceSynthesisId}`)}
                className="w-full text-left px-3 py-2 bg-stone-50 rounded-lg text-[12px] text-stone-600 hover:bg-stone-100 active:bg-stone-100 transition-colors"
              >
                查看来源汇总 →
              </button>
            )}
          </SectionBlock>

          {/* 状态信息 */}
          {brief.userEdited && (
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-[2px] rounded-md text-[10px] font-medium bg-amber-50 text-amber-600">
                已手动调整
              </span>
            </div>
          )}

          {/* 恢复 AI 原结果 */}
          {brief.userEdited && brief.aiOriginalBriefResult && (
            <button
              onClick={handleRestoreOriginal}
              className="w-full py-2.5 rounded-xl text-[12px] font-medium bg-stone-50 text-stone-500 hover:bg-stone-100 active:bg-stone-100 transition-colors border border-stone-200/50"
            >
              恢复 AI 原结果
            </button>
          )}

          {/* 操作区 */}
          <div className="pt-4 flex flex-col gap-2.5">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="w-full py-2.5 bg-white text-stone-700 rounded-xl text-[13px] font-medium border border-stone-200/80 active:bg-stone-50 disabled:opacity-50 transition-colors"
            >
              {regenerating ? "重新生成中..." : "重新生成 Brief"}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2.5 text-rose-500 text-[13px] font-medium active:text-rose-600 transition-colors"
            >
              删除推进卡
            </button>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={() => setConfirmDelete(false)}>
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-5" />
            <h3 className="text-[15px] font-semibold text-rose-600 mb-2">删除推进卡</h3>
            <p className="text-[13px] text-stone-500 mb-6 leading-relaxed">
              ⚠️ 删除后无法恢复，来源记录不会被删除。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
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
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== 子组件 ========== */

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
      <h3 className="text-[11px] text-stone-400 font-semibold uppercase tracking-widest mb-2.5">
        {title}
      </h3>
      {children}
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
      <label className="text-[10px] text-stone-300 font-semibold uppercase tracking-widest mb-2 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function EditListField({
  label,
  items,
  onRemove,
  onAdd,
}: {
  label: string;
  items: string[];
  onRemove: (index: number) => void;
  onAdd: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAdd(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-200/50">
      <label className="text-[10px] text-stone-300 font-semibold uppercase tracking-widest mb-2 block">
        {label}
      </label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[13px] text-stone-700 flex-1">{item}</span>
            <button
              onClick={() => onRemove(i)}
              className="text-stone-400 hover:text-stone-600 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="添加..."
            className="flex-1 px-2 py-1.5 bg-stone-50 rounded-lg text-[12px] text-stone-700 border border-stone-200/80 focus:ring-1 focus:ring-stone-300/40 transition-all placeholder:text-stone-300"
          />
          <button
            onClick={handleAdd}
            disabled={!inputValue.trim()}
            className="px-2 py-1.5 bg-stone-900 text-white rounded-lg text-[11px] font-medium disabled:opacity-30 active:bg-stone-800 transition-colors"
          >
            添加
          </button>
        </div>
      </div>
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
