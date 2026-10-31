"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(copiedLabel);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard blocked (insecure origin or denied); nothing to undo.
        }
      }}
      className="grid size-11 shrink-0 place-items-center border-s border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground"
    >
      {copied ? <Check className="size-4 text-moving" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </button>
  );
}
