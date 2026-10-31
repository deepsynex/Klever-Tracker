"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/sheet";

/**
 * "Discard unsaved changes?" for a form panel. `requestClose` closes straight away when nothing
 * changed, otherwise asks first; use it for the panel's close (X, Esc, overlay) and Cancel.
 * Render `dialog` inside the panel.
 */
export function useDiscardGuard(dirty: boolean, onClose: () => void) {
  const t = useTranslations("masters.common.unsaved");
  const [asking, setAsking] = useState(false);

  const requestClose = () => (dirty ? setAsking(true) : onClose());

  const dialog = (
    <Dialog
      open={asking}
      onOpenChange={setAsking}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={() => setAsking(false)}>
            {t("keep")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setAsking(false);
              onClose();
            }}
          >
            {t("discard")}
          </Button>
        </>
      }
    />
  );

  return { requestClose, dialog };
}

/** Whether a form's values differ from what was loaded (values are plain strings, booleans and arrays). */
export function isDirty(current: unknown, initial: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(initial);
}
