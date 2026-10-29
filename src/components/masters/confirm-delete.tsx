"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/sheet";
import { useErrorText } from "@/lib/vehicle-management/use-vm";

/**
 * Delete confirmation. `permanent` says the row is removed for good (most types); otherwise
 * it's a soft delete (vehicles, drivers). `failHint` replaces the error after a failed delete,
 * e.g. "in use, mark it inactive instead".
 */
export function ConfirmDelete({
  open,
  onOpenChange,
  name,
  permanent = true,
  failHint,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: ReactNode;
  permanent?: boolean;
  failHint?: ReactNode;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("masters.common");
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  const close = (next: boolean) => {
    if (!next) setError(null);
    onOpenChange(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t("deleteTitle", { name: String(name) })}
      description={permanent ? t("deletePermanent") : t("deleteSoft")}
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await onConfirm();
                close(false);
              } catch (err) {
                setError(failHint ?? errorText(err));
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? t("deleting") : t("delete")}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Dialog>
  );
}
