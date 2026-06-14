import { useRef, useState } from "react";
import type { InteractionDialogState } from "../ui/Feedback";

export type InteractionDialogApi = {
  closeInteractionDialog: (value: string | boolean | null) => void;
  interactionDialog: InteractionDialogState | null;
  requestConfirmation: (options: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: InteractionDialogState["tone"];
  }) => Promise<boolean>;
  requestTextInput: (options: {
    title: string;
    message: string;
    label: string;
    value: string;
    confirmLabel: string;
    cancelLabel?: string;
  }) => Promise<string | null>;
};

export function useInteractionDialog(): InteractionDialogApi {
  const [interactionDialog, setInteractionDialog] =
    useState<InteractionDialogState | null>(null);
  const dialogSequenceRef = useRef(0);

  function requestConfirmation(options: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: InteractionDialogState["tone"];
  }) {
    return new Promise<boolean>((resolve) => {
      setInteractionDialog({
        id: ++dialogSequenceRef.current,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel ?? "Cancelar",
        tone: options.tone ?? "default",
        resolve: (value) => resolve(value === true),
      });
    });
  }

  function requestTextInput(options: {
    title: string;
    message: string;
    label: string;
    value: string;
    confirmLabel: string;
    cancelLabel?: string;
  }) {
    return new Promise<string | null>((resolve) => {
      setInteractionDialog({
        id: ++dialogSequenceRef.current,
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel ?? "Cancelar",
        tone: "default",
        input: { label: options.label, value: options.value },
        resolve: (value) =>
          resolve(typeof value === "string" ? value.trim() || null : null),
      });
    });
  }

  function closeInteractionDialog(value: string | boolean | null) {
    const dialog = interactionDialog;
    setInteractionDialog(null);
    dialog?.resolve(value);
  }

  return {
    closeInteractionDialog,
    interactionDialog,
    requestConfirmation,
    requestTextInput,
  };
}
