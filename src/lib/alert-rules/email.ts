/**
 * Alert email (pure part). Every alert email uses the one fixed template
 * (backend-requests/email-templates/alert.blade.php); rules don't set their own subject or text.
 * The subject is "{alert}: {vehicle}", filled in by the backend when it sends the email.
 */

export const DEFAULT_SUBJECT = "{alert}: {vehicle}";

/** Replaces {name} with its value; unknown {words} stay as typed. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, name: string) => values[name] ?? match);
}
