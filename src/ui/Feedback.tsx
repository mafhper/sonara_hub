import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Info,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { IconButton } from "../inspectors/fields";

export type ToastTone = "success" | "info" | "warning" | "error";
export type ToastNotice = {
  id: number;
  message: string;
  tone: ToastTone;
  copyText?: string;
};
export type InteractionDialogState = {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "default" | "danger";
  input?: {
    label: string;
    value: string;
  };
  resolve: (value: string | boolean | null) => void;
};

export function ToastViewport({
  onCopy,
  onDismiss,
  toasts,
}: {
  onCopy: (toast: ToastNotice) => void;
  onDismiss: (id: number) => void;
  toasts: ToastNotice[];
}) {
  if (!toasts.length) return null;
  return (
    <div className="toast-viewport" aria-label="Notificações">
      {toasts.map((toast) => (
        <section
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
          className={`toast-notice ${toast.tone}`}
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <span className="toast-icon">{toastIcon(toast.tone)}</span>
          <p>{toast.message}</p>
          <div className="toast-actions">
            {toast.copyText && (
              <button type="button" onClick={() => onCopy(toast)}>
                <Copy /> Copiar
              </button>
            )}
            <button
              aria-label="Fechar notificação"
              className="toast-close"
              type="button"
              onClick={() => onDismiss(toast.id)}
            >
              <X />
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

function toastIcon(tone: ToastTone) {
  if (tone === "success") return <CheckCircle2 />;
  if (tone === "warning" || tone === "error") return <AlertTriangle />;
  return <Info />;
}

export function NotificationCenter({
  notifications,
  onClear,
  onClose,
  onCopy,
}: {
  notifications: ToastNotice[];
  onClear: () => void;
  onClose: () => void;
  onCopy: (text: string) => void;
}) {
  return (
    <div
      className="notification-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        aria-label="Notificações da sessão"
        className="notification-panel"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>Notificações da sessão</strong>
          {notifications.length > 0 && (
            <button className="quiet-action" type="button" onClick={onClear}>
              Limpar
            </button>
          )}
        </header>
        {notifications.length === 0 ? (
          <p className="helper-copy">Nenhuma notificação ainda.</p>
        ) : (
          <ul className="notification-list">
            {notifications.map((notice) => (
              <li
                className={`notification-item ${notice.tone}`}
                key={notice.id}
              >
                <span className="notification-item-icon">
                  {toastIcon(notice.tone)}
                </span>
                <p>{notice.message}</p>
                {notice.copyText && (
                  <button
                    aria-label="Copiar"
                    className="icon-button"
                    type="button"
                    onClick={() => onCopy(notice.copyText ?? notice.message)}
                  >
                    <Copy />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function InteractionDialog({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: InteractionDialogState;
  onCancel: () => void;
  onConfirm: (value: string | boolean) => void;
}) {
  const [inputValue, setInputValue] = useState(dialog.input?.value ?? "");
  return (
    <div
      className="interaction-dialog-overlay"
      role="presentation"
      onMouseDown={onCancel}
    >
      <form
        aria-labelledby={`interaction-dialog-title-${dialog.id}`}
        aria-modal="true"
        className={`interaction-dialog ${dialog.tone}`}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(dialog.input ? inputValue : true);
        }}
      >
        <header>
          <div>
            <span className="overline">
              {dialog.tone === "danger" ? "Confirmar operação" : "Sonara Hub"}
            </span>
            <h2 id={`interaction-dialog-title-${dialog.id}`}>{dialog.title}</h2>
          </div>
          <IconButton label="Fechar diálogo" onClick={onCancel}>
            <X />
          </IconButton>
        </header>
        <div className="interaction-dialog-body">
          <p>{dialog.message}</p>
          {dialog.input && (
            <label className="field">
              <span>{dialog.input.label}</span>
              <input
                autoFocus
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
              />
            </label>
          )}
        </div>
        <footer>
          <button className="quiet-action" type="button" onClick={onCancel}>
            {dialog.cancelLabel}
          </button>
          <button
            autoFocus={!dialog.input}
            className={
              dialog.tone === "danger"
                ? "danger-confirm-action"
                : "primary-action"
            }
            type="submit"
          >
            {dialog.tone === "danger" ? <Trash2 /> : <Check />}
            {dialog.confirmLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
