"use client";

import { FileText, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError } from "@/lib/graphql/client";
import { classifyHttpResponse } from "@/lib/graphql/errors";
import { UPLOAD_PURPOSES, uploadProblem, type UploadPurpose } from "@/lib/uploads";
import { useErrorText } from "@/lib/vehicle-management/use-vm";

/** Uploads a file through the same-origin /api/upload proxy and returns its public URL. */
export async function uploadFile(file: File, purpose: UploadPurpose): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  form.set("purpose", purpose);
  let status = 0;
  let text = "";
  try {
    const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "same-origin" });
    status = res.status;
    text = await res.text();
  } catch {
    status = 0;
  }
  const { data, error } = classifyHttpResponse(status, text);
  if (error) throw new ApiRequestError(error);
  return (data as { uploadFile: string }).uploadFile;
}

/**
 * File field for a URL column (Vehicle.photoPath, Document.filePath): shows the current file and
 * lets the user upload, replace or remove it. `value` is the stored URL ("" for none).
 */
export function FileUpload({
  id,
  value,
  onChange,
  purpose,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (url: string) => void;
  purpose: UploadPurpose;
  disabled?: boolean;
}) {
  const t = useTranslations("masters.common.upload");
  const errorText = useErrorText();
  const inputRef = useRef<HTMLInputElement>(null);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPhoto = UPLOAD_PURPOSES[purpose].image;
  const maxMb = UPLOAD_PURPOSES[purpose].maxBytes / (1024 * 1024);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const problem = uploadProblem(file, purpose);
    if (problem) {
      setError(t(`problems.${problem}`, { max: maxMb, kind: t(`kinds.${purpose}`) }));
      return;
    }
    setPending(true);
    try {
      onChange(await uploadFile(file, purpose));
    } catch (err) {
      const field = err instanceof ApiRequestError ? err.error.fields?.file?.[0] : undefined;
      setError(field?.startsWith("upload_") ? t(`problems.${field.slice(7)}`, { max: maxMb, kind: t(`kinds.${purpose}`) }) : errorText(err));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const name = value ? decodeURIComponent(value.split("/").pop() ?? value) : "";

  return (
    <div className="grid gap-1.5">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 max-w-full items-center gap-2 rounded-ctl border border-border bg-surface-2 px-2 py-1 text-[13px] hover:border-primary/50"
            title={t("open")}
          >
            {isPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote URL from the API's storage
              <img src={value} alt="" className="size-8 shrink-0 rounded object-cover" />
            ) : (
              <FileText className="size-4 shrink-0 text-primary" aria-hidden />
            )}
            <span className="truncate" dir="ltr">
              {name}
            </span>
          </a>
        ) : (
          <span className="text-[13px] text-subtle">{t("none")}</span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={UPLOAD_PURPOSES[purpose].accept}
          className="sr-only"
          disabled={disabled || pending}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button variant="secondary" size="sm" disabled={disabled || pending} onClick={() => inputRef.current?.click()}>
          <Upload />
          {pending ? t("uploading") : value ? t("replace") : t("upload")}
        </Button>
        {value ? (
          <Button variant="ghost" size="sm" disabled={disabled || pending} onClick={() => onChange("")} className="hover:text-destructive">
            <X />
            {t("remove")}
          </Button>
        ) : null}
      </div>
      <p className={error ? "text-xs text-destructive" : "text-xs text-subtle"} role={error ? "alert" : undefined}>
        {error ?? t("hint", { kind: t(`kinds.${purpose}`), max: maxMb })}
      </p>
    </div>
  );
}
