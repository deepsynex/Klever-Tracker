/** Upload rules shared by the browser (early checks) and the /api/upload route (enforced). */

const IMAGE = { types: ["image/jpeg", "image/png", "image/webp"], accept: ".jpg,.jpeg,.png,.webp", maxBytes: 5 * 1024 * 1024, image: true } as const;

export const UPLOAD_PURPOSES = {
  /** Vehicle photo → Vehicle.photoPath */
  vehicle_photo: IMAGE,
  /** User photo → User.photoPath */
  user_photo: IMAGE,
  /** Driver photo → Driver.photoPath */
  driver_photo: IMAGE,
  /** Company logo → Company.logoPath */
  company_logo: IMAGE,
  /** Document scan → Document.filePath */
  document: { types: ["application/pdf"], accept: ".pdf,application/pdf", maxBytes: 10 * 1024 * 1024, image: false },
} as const;

export type UploadPurpose = keyof typeof UPLOAD_PURPOSES;

export function isUploadPurpose(value: unknown): value is UploadPurpose {
  return typeof value === "string" && value in UPLOAD_PURPOSES;
}

/** Why a file can't be uploaded for this purpose, or null if it looks fine. The API checks the real content too. */
export function uploadProblem(file: { type: string; size: number }, purpose: UploadPurpose): "type" | "size" | "empty" | null {
  const rule = UPLOAD_PURPOSES[purpose];
  if (file.size === 0) return "empty";
  if (!(rule.types as readonly string[]).includes(file.type)) return "type";
  if (file.size > rule.maxBytes) return "size";
  return null;
}
