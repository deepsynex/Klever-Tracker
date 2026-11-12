/**
 * One look for every form control (text box, dropdown, text area): same border, background,
 * radius and text, and the same teal border + ring while focused or open, so a dropdown and a
 * text box next to each other look identical in every state.
 */
export const FIELD_BASE =
  "w-full min-w-0 rounded-ctl border border-border-strong bg-surface px-2.5 text-sm text-foreground placeholder:text-subtle " +
  "transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary focus-visible:outline-none " +
  "aria-invalid:border-destructive aria-invalid:focus:ring-destructive disabled:cursor-not-allowed disabled:opacity-60";

