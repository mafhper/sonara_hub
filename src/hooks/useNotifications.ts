import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ToastNotice, ToastTone } from "../ui/Feedback";

export type NotificationApi = {
  dismissToast: (id: number) => void;
  notificationLog: ToastNotice[];
  notificationsOpen: boolean;
  setBatchFeedback: (message: string, tone?: ToastTone) => void;
  setError: (message: string) => void;
  setNotificationLog: Dispatch<SetStateAction<ToastNotice[]>>;
  setNotificationsOpen: Dispatch<SetStateAction<boolean>>;
  showToast: (
    message: string,
    tone?: ToastTone,
    options?: { copyText?: string; persistent?: boolean },
  ) => void;
  toasts: ToastNotice[];
};

export function useNotifications(): NotificationApi {
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [notificationLog, setNotificationLog] = useState<ToastNotice[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const toastSequenceRef = useRef(0);
  const toastTimersRef = useRef(new Map<number, number>());

  function dismissToast(id: number) {
    const timer = toastTimersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(
    message: string,
    tone: ToastTone = "success",
    options: { copyText?: string; persistent?: boolean } = {},
  ) {
    if (!message) return;
    const id = ++toastSequenceRef.current;
    const notice = { id, message, tone, copyText: options.copyText };
    setToasts((current) =>
      [
        ...current.filter(
          (toast) => toast.message !== message || toast.tone !== tone,
        ),
        notice,
      ].slice(-4),
    );
    setNotificationLog((current) => [notice, ...current].slice(0, 50));
    if (!options.persistent) {
      const duration =
        tone === "error" ? 10_000 : tone === "warning" ? 7_000 : 5_000;
      const timer = window.setTimeout(() => dismissToast(id), duration);
      toastTimersRef.current.set(id, timer);
    }
  }

  function setBatchFeedback(message: string, tone: ToastTone = "success") {
    showToast(message, tone);
  }

  function setError(message: string) {
    if (!message) {
      setToasts((current) => current.filter((toast) => toast.tone !== "error"));
      return;
    }
    showToast(message, "error", { copyText: message });
  }

  useEffect(
    () => () => {
      for (const timer of toastTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  return {
    dismissToast,
    notificationLog,
    notificationsOpen,
    setBatchFeedback,
    setError,
    setNotificationLog,
    setNotificationsOpen,
    showToast,
    toasts,
  };
}
