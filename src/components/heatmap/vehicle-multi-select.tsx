"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { TrackTarget } from "@/lib/history/selection";
import { MAX_TARGETS } from "@/lib/heatmap/request";
import { cn } from "@/lib/utils";

type Props = {
  targets: TrackTarget[];
  selected: string[];
  onChange: (keys: string[]) => void;
  invalid?: boolean;
};

/** Checkbox list of vehicles (and unassigned devices) with a filter box. Values are target keys. */
export function VehicleMultiSelect({ targets, selected, onChange, invalid }: Props) {
  const t = useTranslations("heatmap.filters");
  const [filter, setFilter] = useState("");
  const chosen = useMemo(() => new Set(selected), [selected]);
  const visible = targets.filter((x) => x.label.toLowerCase().includes(filter.trim().toLowerCase()));
  const atLimit = chosen.size >= MAX_TARGETS;

  const toggle = (key: string, on: boolean) => onChange(on ? [...selected, key] : selected.filter((k) => k !== key));
  const selectVisible = () => onChange([...new Set([...selected, ...visible.map((x) => x.key)])].slice(0, MAX_TARGETS));

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
        />
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("searchVehicles")}
          aria-label={t("searchVehicles")}
          className="ps-8"
        />
      </div>
      <div className="flex items-center justify-between text-xs text-subtle">
        <span>{t("selectedCount", { count: chosen.size, max: MAX_TARGETS })}</span>
        <span className="flex gap-3">
          <button type="button" className="text-primary hover:underline" onClick={selectVisible}>
            {t("selectAll")}
          </button>
          <button type="button" className="text-primary hover:underline" onClick={() => onChange([])}>
            {t("selectNone")}
          </button>
        </span>
      </div>
      <ul
        className={cn(
          "max-h-56 overflow-y-auto rounded-ctl border border-border-strong bg-surface p-1.5",
          invalid && "border-destructive",
        )}
      >
        {visible.length === 0 ? (
          <li className="px-1.5 py-1 text-xs text-subtle">{t("noMatches")}</li>
        ) : (
          visible.map((x) => (
            <li key={x.key} className="rounded px-1.5 py-1 hover:bg-surface-2">
              <Checkbox
                checked={chosen.has(x.key)}
                disabled={!chosen.has(x.key) && atLimit}
                onChange={(e) => toggle(x.key, e.target.checked)}
                label={
                  <span dir="ltr" className="truncate">
                    {x.label}
                    {x.kind === "device" && <span className="ms-1 text-subtle">({t("device")})</span>}
                  </span>
                }
                className="w-full"
              />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
