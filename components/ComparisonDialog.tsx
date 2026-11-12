"use client";

import { useEffect, useRef } from "react";

import ComparisonTable from "./ComparisonTable";
import type { AreaEvaluation, Preferences } from "@/lib/types";

interface ComparisonDialogProps {
  selected: AreaEvaluation[];
  preferences: Preferences;
  onClose: () => void;
  onClear: () => void;
}

export default function ComparisonDialog({
  selected,
  preferences,
  onClose,
  onClear,
}: ComparisonDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
        if (!items?.length) return;
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comparison-dialog-title"
      >
        <div className="modal-head">
          <div>
            <h2 id="comparison-dialog-title">Compare selected areas</h2>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close comparison"
          >
            ×
          </button>
        </div>
        <ComparisonTable selected={selected} preferences={preferences} onClear={onClear} />
      </div>
    </div>
  );
}
