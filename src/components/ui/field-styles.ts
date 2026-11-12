/**
 * One look for every form control (text box, dropdown, text area): same border, background,
 * radius and text, and the same teal border + ring while focused or open, so a dropdown and a
 * text box next to each other look identical in every state.
 */
export const FIELD_BASE =
  "w-full min-w-0 rounded-ctl border border-border-strong bg-surface px-2.5 text-sm text-foreground placeholder:text-subtle " +
  "transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary focus-visible:outline-none " +
  "aria-invalid:border-destructive aria-invalid:focus:ring-destructive disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The dropdown's own arrow (the browser's differs per browser and OS), drawn on the end side and
 * mirrored for Arabic. Grey (#7d908d, the subtle text colour) reads on light and dark surfaces.
 */
export const SELECT_ARROW =
  "appearance-none cursor-pointer bg-no-repeat pe-8 [background-size:14px_14px] " +
  "[background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237d908d' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] " +
  "[background-position:right_0.6rem_center] rtl:[background-position:left_0.6rem_center]";
