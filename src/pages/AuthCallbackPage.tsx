import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { handleAuthCallback } from "../syncService";

// 内联 SVG 图标
const LoaderIcon = () => (
  <svg className="w-8 h-8 text-blue-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CheckIcon = () => (
  <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const AlertIcon = () => (
  <svg className="w-8 h-8 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8v4M12 16h.01" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const processAuth = async () => {
      try {
        // 从 URL 参数中获取 access_token 和 refresh_token
        const accessToken = searchParams.get("access_token");
        const refreshToken = searchParams.get("refresh_token");
        const type = searchParams.get("type");

        // 处理 Magic Link 登录
        if (accessToken && refreshToken) {
          const success = await handleAuthCallback(accessToken, refreshToken);
          if (success) {
            setStatus("success");
            // 延迟跳转，让用户看到成功提示
            setTimeout(() => {
              navigate("/settings/sync", { replace: true });
            }, 1500);
          } else {
            setStatus("error");
            setErrorMessage("登录验证失败，请重试");
          }
          return;
        }

        // 处理 OTP 验证（通过 hash fragment）
        const hash = window.location.hash;
        if (hash) {
          const params = new URLSearchParams(hash.substring(1));
          const hashAccessToken = params.get("access_token");
          const hashRefreshToken = params.get("refresh_token");

          if (hashAccessToken && hashRefreshToken) {
            const success = await handleAuthCallback(hashAccessToken, hashRefreshToken);
            if (success) {
              setStatus("success");
              setTimeout(() => {
                navigate("/settings/sync", { replace: true });
              }, 1500);
            } else {
              setStatus("error");
              setErrorMessage("登录验证失败，请重试");
            }
            return;
          }
        }

        // 检查是否是 recovery 或其他类型
        if (type === "recovery") {
          setStatus("error");
          setErrorMessage("此链接用于密码重置，不适用于同步登录");
          return;
        }

        // 没有有效 token
        setStatus("error");
        setErrorMessage("无效的登录链接，请重新发送验证码");
      } catch (error) {
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "登录处理失败");
      }
    };

    processAuth();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-[#0f0f11] text-stone-200 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <div className="bg-stone-900/50 rounded-2xl p-8 border border-stone-800/50 text-center">
          {status === "processing" && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                <LoaderIcon />
              </div>
              <h1 className="text-lg font-medium text-stone-100 mb-2">正在处理登录</h1>
              <p className="text-sm text-stone-500">请稍候...</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckIcon />
              </div>
              <h1 className="text-lg font-medium text-stone-100 mb-2">登录成功</h1>
              <p className="text-sm text-stone-500">正在跳转到同步设置...</p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-500/10 flex items-center justify-center">
                <AlertIcon />
              </div>
              <h1 className="text-lg font-medium text-stone-100 mb-2">登录失败</h1>
              <p className="text-sm text-stone-500 mb-6">{errorMessage}</p>
              <div className="space-y-3">
                <button
                  onClick={() => navigate("/settings/sync")}
                  className="w-full bg-teal-500 hover:bg-teal-400 text-stone-950 font-medium py-3 rounded-xl text-sm transition-colors"
                >
                  返回同步设置
                </button>
                <button
                  onClick={() => navigate("/")}
                  className="w-full py-3 border border-stone-700/50 text-stone-400 rounded-xl text-sm hover:bg-stone-800/50 transition-colors"
                >
                  返回首页
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-stone-600 mt-6">
          ThoughtBox 数据同步 · 本地优先，云端可选
        </p>
      </div>
    </div>
  );
}
