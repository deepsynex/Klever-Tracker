import { z } from "zod";

/**
 * Form schemas shared by the client forms and the Server Actions.
 * Messages are translation keys under `validation.*` in messages/*.json.
 */

const email = z.string().trim().min(1, "required").pipe(z.email("email"));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// Laravel's default password rule is a minimum of 8 characters. Confirm the backend rule (B6);
// any stricter server rule still comes back as a field error and is shown under the field.
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "resetLinkInvalid"),
    email,
    password: z.string().min(8, "passwordMin"),
    confirmPassword: z.string().min(1, "required"),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "passwordMatch" });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** First error message per field, from a failed safeParse. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
