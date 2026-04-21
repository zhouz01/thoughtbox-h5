import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";

const DRAFT_KEY = "thoughtbox_draft";

type DraftStatus = "idle" | "saving" | "saved" | "restored";

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) || "";
  } catch {
    return "";
  }
}

function saveDraft(text: string): void {
  try {
    if (text.trim()) {
      localStorage.setItem(DRAFT_KEY, text);
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch {
    // ignore
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export default function NewRecordPage() {
  const [text, setText] = useState(loadDraft);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>(
    loadDraft() ? "restored" : "idle"
  );
  const { addRecord } = useApp();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 自动聚焦
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
      if (text) {
        textareaRef.current?.setSelectionRange(text.length, text.length);
      }
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // textarea 自动高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.max(200, el.scrollHeight) + "px";
    }
  }, [text]);

  // 草稿自动保存（debounce 300ms）
  useEffect(() => {
    if (!text.trim()) {
      setDraftStatus("idle");
      return;
    }
    setDraftStatus("saving");
    const timer = setTimeout(() => {
      saveDraft(text);
      setDraftStatus("saved");
    }, 300);
    draftTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [text]);

  // 草稿恢复提示 3 秒后消失
  useEffect(() => {
    if (draftStatus === "restored") {
      const timer = setTimeout(() => setDraftStatus("idle"), 3000);
      return () => clearTimeout(timer);
    }
  }, [draftStatus]);

  const handleSave = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addRecord(trimmed);
    clearDraft();
    navigate("/", { replace: true });
  }, [text, addRecord, navigate]);

  const handleCancel = useCallback(() => {
    if (text.trim()) {
      saveDraft(text);
    }
    navigate(-1);
  }, [text, navigate]);

  const canSave = text.trim().length > 0;

  const draftStatusText = {
    idle: "",
    saving: "正在自动保存草稿…",
    saved: "已自动保存草稿",
    restored: "已恢复上次草稿",
  }[draftStatus];

  return (
    <div className="flex flex-col h-full bg-stone-100">
      {/* ====== 1. 顶部导航栏 ====== */}
      <div className="flex items-center justify-between px-5 py-3 bg-white/80 backdrop-blur-xl border-b border-stone-200/50 shrink-0">
        <button
          onClick={handleCancel}
          className="text-[13px] text-stone-500 active:text-stone-400 transition-colors min-w-[48px] py-1 text-left"
        >
          取消
        </button>
        <h1 className="text-[13px] font-semibold text-stone-900">新建记录</h1>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`text-[13px] font-semibold min-w-[48px] text-right py-1 transition-colors ${
            canSave
              ? "text-stone-900 active:text-stone-600"
              : "text-stone-300 cursor-default"
          }`}
        >
          保存
        </button>
      </div>

      {/* ====== 2. 输入主体区 ====== */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="写下此刻的想法，不用整理，AI 稍后会帮你处理"
          className="w-full min-h-[200px] p-4 bg-white rounded-2xl border border-stone-200/80 text-[14px] text-stone-800 leading-[1.7] placeholder:text-stone-300 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 resize-none transition-all duration-200"
        />
      </div>

      {/* ====== 3. 轻量说明区 ====== */}
      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-center gap-2 justify-center text-[12px] text-stone-400">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-stone-300 shrink-0"
          >
            <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
          <span>标题、摘要、建议类型、标签会在保存后自动生成</span>
        </div>
        <p className="text-center text-[11px] text-stone-300 mt-1">
          原始内容会始终保留
        </p>
      </div>

      {/* ====== 4. 草稿提示区 ====== */}
      {draftStatusText && (
        <div className="px-5 pb-2 shrink-0">
          <p className="text-center text-[11px] text-stone-400 animate-fade-in">
            {draftStatus === "saving" && (
              <span className="inline-block w-3 h-3 border-2 border-stone-300 border-t-stone-500 rounded-full animate-spin mr-1 align-middle" />
            )}
            {draftStatusText}
          </p>
        </div>
      )}

      {/* ====== 5. 底部按钮区 ====== */}
      <div className="px-5 pb-5 safe-bottom shrink-0">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`w-full py-3.5 rounded-2xl text-[14px] font-semibold transition-all duration-200 ${
            canSave
              ? "bg-stone-900 text-white shadow-[0_2px_8px_rgba(28,25,23,0.2)] active:scale-[0.98] active:shadow-none"
              : "bg-stone-200 text-stone-400 cursor-default"
          }`}
        >
          保存记录
        </button>
      </div>
    </div>
  );
}
