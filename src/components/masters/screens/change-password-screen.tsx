"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PASSWORD_MIN, validateChangePassword } from "@/lib/account-management/validation";
import { CHANGE_PASSWORD } from "@/lib/graphql/account-management";
import { ApiRequestError } from "@/lib/graphql/client";
import { useVmMutations } from "@/lib/vehicle-management/use-vm";

const EMPTY = { oldPassword: "", newPassword: "", confirmPassword: "" };

/** 5. Change Password: the signed-in user's own password. */
export function ChangePasswordScreen() {
  const t = useTranslations("masters.am.changePassword");
  const tc = useTranslations("masters.common");
  const { run, errorText } = useVmMutations();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const save = async () => {
    const found = validateChangePassword(values);
    setErrors(found);
    setFormError(null);
    setDone(false);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await run(CHANGE_PASSWORD, { oldPassword: values.oldPassword, newPassword: values.newPassword });
      setValues(EMPTY);
      setDone(true);
      toast.success(t("changed"));
    } catch (err) {
      // A wrong current password comes back as a plain error message, not a field error.
      const message = err instanceof ApiRequestError ? err.error.message : undefined;
      if (message && /current password/i.test(message)) setErrors({ oldPassword: "wrongPassword" });
      else if (err instanceof ApiRequestError && err.error.kind === "validation" && err.error.fields) {
        setErrors(Object.fromEntries(Object.entries(err.error.fields).map(([k, m]) => [k, `server:${m[0] ?? ""}`])));
      } else setFormError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const input = (key: keyof typeof EMPTY, label: string, autoComplete: string, hint?: string) => (
    <Field id={`cp-${key}`} label={`${label} *`} error={errors[key]} hint={hint}>
      <Input
        id={`cp-${key}`}
        type="password"
        dir="ltr"
        autoComplete={autoComplete}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        aria-invalid={errors[key] ? true : undefined}
      />
    </Field>
  );

  return (
    <div className="grid gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      <form
        className="grid max-w-md gap-4 rounded-card border border-border bg-surface p-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {done ? <Alert tone="success">{t("changed")}</Alert> : null}
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        {input("oldPassword", t("old"), "current-password")}
        {input("newPassword", t("new"), "new-password", t("rule", { min: PASSWORD_MIN }))}
        {input("confirmPassword", t("confirm"), "new-password")}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? tc("saving") : t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
