import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";

const DRAFT_KEY = "thoughtbox_draft";

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
  const { addRecord } = useApp();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动聚焦
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
      // 如果有草稿，光标放末尾
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
    const timer = setTimeout(() => {
      saveDraft(text);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addRecord(trimmed);
    clearDraft();
    navigate("/", { replace: true });
  };

  const handleCancel = () => {
    // 如果有内容，保存草稿
    if (text.trim()) {
      saveDraft(text);
    }
    navigate(-1);
  };

  const canSave = text.trim().length > 0;

  return (
    <div className="flex flex-col h-full bg-stone-100">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-5 py-3 bg-white/80 backdrop-blur-xl border-b border-stone-200/50 shrink-0">
        <button
          onClick={handleCancel}
          className="text-[13px] text-stone-500 active:text-stone-400 transition-colors min-w-[48px] py-1"
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

      {/* 主体输入区 */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="写下此刻的想法，不用整理，AI 稍后会帮你处理"
          className="w-full min-h-[200px] p-4 bg-white rounded-2xl border border-stone-200/80 text-[14px] text-stone-800 leading-[1.7] placeholder:text-stone-300 focus:ring-2 focus:ring-stone-300/40 focus:border-stone-300 resize-none transition-all duration-200"
        />
      </div>

      {/* 底部说明 */}
      <div className="px-5 pb-8 safe-bottom shrink-0">
        <div className="flex items-center gap-2 justify-center text-[12px] text-stone-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300">
            <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
          <span>标题、摘要、分类、标签会自动生成</span>
        </div>
        <p className="text-center text-[11px] text-stone-300 mt-1">
          原始内容会始终保留
        </p>
      </div>
    </div>
  );
}
