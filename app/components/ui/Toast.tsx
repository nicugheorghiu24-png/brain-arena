"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
};

type Ctx = {
  push: (t: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<Ctx | null>(null);

const DURATION_MS = 3800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback<Ctx["push"]>((t) => {
    const id = ++idRef.current;
    setToasts((xs) => [...xs, { ...t, id }]);
    setTimeout(() => {
      setToasts((xs) => xs.filter((x) => x.id !== id));
    }, DURATION_MS);
  }, []);

  const value = useMemo<Ctx>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed right-3 top-20 z-[60] flex w-full max-w-sm flex-col gap-2 px-3 sm:right-4 sm:px-0"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const tone: Record<ToastType, string> = {
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  error: "border-rose-400/40 bg-rose-400/10 text-rose-100",
  info: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
};

const icon: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "i",
};

function ToastView({ toast }: { toast: Toast }) {
  return (
    <div
      role="status"
      className={`toast-enter pointer-events-auto rounded-xl border p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur ${tone[toast.type]}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px] font-bold">
          {icon[toast.type]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{toast.title}</div>
          {toast.description && (
            <div className="mt-0.5 text-xs opacity-80">{toast.description}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}
