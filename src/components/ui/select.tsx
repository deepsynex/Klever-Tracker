"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { FIELD_BASE } from "./field-styles";

/**
 * The app's dropdown. Use it like a native <select> (value, onChange(e.target.value), <option> and
 * <optgroup> children): a hidden native select keeps the value and fires the real change event,
 * while the visible part is a button and a styled menu: rounded panel with a teal border and a
 * pointer, an optional icon per option, and the chosen row in soft teal with a filled check.
 *
 * - `icons`: an icon per option value, shown in the menu and on the button for the chosen value.
 * - `startIcon`: a fixed icon on the button (when the options have no icons of their own).
 * - `variant="bare"`: no border or background, for a dropdown inside its own labelled box.
 *
 * Keyboard: arrows, Home/End and typing a name move through the list, Enter or Space picks,
 * Escape and Tab close. The menu renders in a portal (inside an open dialog when there is one, so
 * the dialog's focus trap still lets it work) and flips above the button when there's no room below.
 */
export type SelectProps = ComponentProps<"select"> & {
  icons?: Partial<Record<string, ReactNode>>;
  startIcon?: ReactNode;
  variant?: "field" | "bare";
  menuClassName?: string;
};

type Option = { value: string; label: string; disabled: boolean; group?: string };

const MENU_MAX_HEIGHT = 320;
const GAP = 8;

export function Select({
  className,
  children,
  icons,
  startIcon,
  variant = "field",
  menuClassName,
  value,
  defaultValue,
  disabled,
  id,
  title,
  onChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...nativeProps
}: SelectProps) {
  const options = collectOptions(children);
  const [inner, setInner] = useState(() => String(defaultValue ?? options[0]?.value ?? ""));
  const current = value !== undefined ? String(value) : inner;
  const selectedIndex = options.findIndex((o) => o.value === current);
  const shown = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const openMenu = () => {
    const trigger = triggerRef.current;
    if (!trigger || disabled) return;
    setHost(trigger.closest<HTMLElement>('[role="dialog"]') ?? document.body);
    setActive(selectedIndex >= 0 ? selectedIndex : step(options, -1, 1));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    close(true);
    if (option.value === current) return;
    setInner(option.value);
    // Set the hidden select's value the way a user would, so React (and any form) sees a real change event.
    const native = triggerRef.current?.previousElementSibling;
    if (native instanceof HTMLSelectElement) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(native, option.value);
      native.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(step(options, active, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? step(options, -1, 1) : step(options, options.length, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (active >= 0) choose(active);
    } else if (e.key === "Tab") {
      close(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const match = findByText(options, typed.current.text, active);
      if (match >= 0) setActive(match);
    }
  };

  // Place the menu under (or above) the button, keep it there on scroll/resize, close on an outside click or Escape.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      const list = listRef.current;
      if (!trigger || !menu || !list) return;
      const r = trigger.getBoundingClientRect();
      // Measure where "fixed 0,0" lands: a transformed dialog becomes the menu's positioning box.
      menu.style.left = "0px";
      menu.style.top = "0px";
      const origin = menu.getBoundingClientRect();

      const below = window.innerHeight - r.bottom - GAP;
      const above = r.top - GAP;
      const wanted = Math.min(list.scrollHeight, MENU_MAX_HEIGHT);
      const side = below < wanted && above > below ? "above" : "below";
      list.style.maxHeight = `${Math.max(120, Math.min(MENU_MAX_HEIGHT, (side === "above" ? above : below) - GAP))}px`;

      menu.style.minWidth = `${r.width}px`;
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const rtl = getComputedStyle(trigger).direction === "rtl";
      const left = clamp(rtl ? r.right - width : r.left, GAP, window.innerWidth - width - GAP);
      const top = side === "above" ? r.top - height - GAP : r.bottom + GAP;
      menu.style.left = `${left - origin.left}px`;
      menu.style.top = `${top - origin.top}px`;
      menu.dataset.side = side;
      menu.style.setProperty("--notch-x", `${clamp(r.left + Math.min(r.width / 2, 40) - left, 18, width - 18)}px`);
    };
    place();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    // Window capture runs before a dialog's own Escape handler, so Escape closes only the menu.
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onEscape, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const leading = (shown && icons?.[shown.value]) ?? startIcon;

  return (
    <>
      <select
        {...nativeProps}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={(e) => {
          setInner(e.target.value);
          onChange?.(e);
        }}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      >
        {children}
      </select>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        title={title}
        data-slot="select"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex items-center gap-2 text-start",
          variant === "field"
            ? cn("h-9 cursor-pointer", FIELD_BASE, open && "border-primary ring-1 ring-primary")
            : "w-full min-w-0 cursor-pointer bg-transparent text-sm font-semibold text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {leading ? <span className="grid shrink-0 place-items-center [&_svg]:size-4">{leading}</span> : null}
        <span className="min-w-0 flex-1 truncate">{shown?.label ?? ""}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform duration-150",
            open ? "rotate-180 text-primary" : "text-subtle",
          )}
        />
      </button>
      {open && host
        ? createPortal(
            <div
              ref={menuRef}
              className={cn(
                "group/menu fixed z-[200] max-w-[min(24rem,calc(100vw-1rem))] rounded-2xl border border-primary/45 bg-surface text-foreground shadow-[0_16px_40px_rgb(var(--shadow-color)/0.16)]",
                menuClassName,
              )}
            >
              <span
                aria-hidden
                className="absolute left-[calc(var(--notch-x)-6px)] size-3 rotate-45 border-primary/45 bg-surface group-data-[side=above]/menu:-bottom-[6.5px] group-data-[side=above]/menu:border-r group-data-[side=above]/menu:border-b group-data-[side=below]/menu:-top-[6.5px] group-data-[side=below]/menu:border-t group-data-[side=below]/menu:border-l"
              />
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy ?? id}
                className="relative overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]"
              >
                {options.map((o, i) => {
                  const selected = i === selectedIndex;
                  const groupStart = o.group !== undefined && o.group !== options[i - 1]?.group;
                  return (
                    <Fragment key={`${o.group ?? ""}:${o.value}:${i}`}>
                      {groupStart ? (
                        <div
                          role="presentation"
                          className={cn(
                            "px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase",
                            i > 0 && "mt-1 border-t border-border/70 pt-2.5",
                          )}
                        >
                          {o.group}
                        </div>
                      ) : null}
                      <div
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={selected}
                        aria-disabled={o.disabled || undefined}
                        data-index={i}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseMove={() => {
                          if (!o.disabled && active !== i) setActive(i);
                        }}
                        onClick={() => choose(i)}
                        className={cn(
                          "flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm",
                          selected ? "bg-primary-soft font-semibold" : i === active && "bg-surface-2",
                          selected && i === active && "ring-1 ring-primary/35 ring-inset",
                          o.disabled && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span className="grid size-5 shrink-0 place-items-center [&>svg]:size-[18px]">
                          {selected ? (
                            <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-fg">
                              <Check className="size-3" strokeWidth={3.25} aria-hidden />
                            </span>
                          ) : (
                            icons?.[o.value]
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>,
            host,
          )
        : null}
    </>
  );
}

/** Reads the <option> / <optgroup> children (through fragments and arrays) into a flat list. */
function collectOptions(children: ReactNode, group?: string, out: Option[] = []): Option[] {
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; value?: unknown; disabled?: boolean; label?: string }>(child)) return;
    if (child.type === Fragment) collectOptions(child.props.children, group, out);
    else if (child.type === "optgroup") collectOptions(child.props.children, child.props.label, out);
    else if (child.type === "option") {
      const label = textOf(child.props.children);
      out.push({
        value: child.props.value !== undefined ? String(child.props.value) : label,
        label,
        disabled: Boolean(child.props.disabled),
        group,
      });
    }
  });
  return out;
}

function textOf(node: ReactNode): string {
  let text = "";
  Children.forEach(node, (child) => {
    if (typeof child === "string" || typeof child === "number") text += child;
  });
  return text;
}

/** The next enabled option from `from` in direction `dir`, or `from` when there is none. */
function step(options: Option[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
  return from;
}

/** First enabled option whose label starts with `text`, searching after `from` and wrapping round. */
function findByText(options: Option[], text: string, from: number): number {
  const n = options.length;
  const start = text.length > 1 ? Math.max(from, 0) : from + 1;
  for (let k = 0; k < n; k++) {
    const i = (start + k + n) % n;
    if (!options[i].disabled && options[i].label.toLowerCase().startsWith(text)) return i;
  }
  return -1;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), Math.max(min, max));
}
