"use client";

import { Button } from "../atoms/Button";
import { Text } from "../atoms/Text";

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal de confirmación genérico — reemplaza confirm()/alert() nativos. */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
  variant = "warning",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-erie-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-[1rem] bg-white p-6 shadow-xl flex flex-col gap-4">
        <Text variant="h3">{title}</Text>
        <Text variant="body" className="text-cadet-gray text-sm whitespace-pre-wrap">
          {message}
        </Text>
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" size="md" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "accent" : "primary"}
            size="md"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
