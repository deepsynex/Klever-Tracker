"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GRADIENTS, type GradientName } from "@/lib/heatmap/client";

export type ToolbarState = { visible: boolean; gradient: GradientName; opacity: number; radius: number };

function swatch(name: GradientName) {
  return `linear-gradient(to right, ${GRADIENTS[name].map(([r, g, b]) => `rgb(${r} ${g} ${b})`).join(", ")})`;
}

/** Map overlay controls: show/hide, gradient, opacity and radius. */
export function HeatmapToolbar({ value, onChange }: { value: ToolbarState; onChange: (v: ToolbarState) => void }) {
  const t = useTranslations("heatmap.toolbar");
  const set = <K extends keyof ToolbarState>(key: K, v: ToolbarState[K]) => onChange({ ...value, [key]: v });

  return (
    <div
      role="toolbar"
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-border bg-surface/95 px-3 py-2 text-xs shadow-sm backdrop-blur"
    >
      <Button
        size="sm"
        variant={value.visible ? "secondary" : "ghost"}
        aria-pressed={value.visible}
        onClick={() => set("visible", !value.visible)}
      >
        {value.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
        {t("toggle")}
      </Button>

      <fieldset className="flex items-center gap-1.5">
        <legend className="sr-only">{t("gradient")}</legend>
        {(Object.keys(GRADIENTS) as GradientName[]).map((name) => (
          <label
            key={name}
            title={t(`gradients.${name}`)}
            className="flex cursor-pointer items-center rounded-full border border-border p-0.5 has-checked:border-primary has-checked:ring-1 has-checked:ring-primary"
          >
            <input
              type="radio"
              name="heatmap-gradient"
              className="sr-only"
              checked={value.gradient === name}
              onChange={() => set("gradient", name)}
            />
            <span aria-hidden className="block h-3 w-12 rounded-full" style={{ background: swatch(name) }} />
            <span className="sr-only">{t(`gradients.${name}`)}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("opacity")}</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={value.opacity}
          onChange={(e) => set("opacity", Number(e.target.value))}
          className="w-24 accent-primary"
        />
        <span className="w-8 font-mono tabular-nums">{Math.round(value.opacity * 100)}%</span>
      </label>

      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("radius")}</span>
        <input
          type="range"
          min={5}
          max={80}
          step={1}
          value={value.radius}
          onChange={(e) => set("radius", Number(e.target.value))}
          className="w-24 accent-primary"
        />
        <span className="w-10 font-mono tabular-nums">{value.radius}px</span>
      </label>
    </div>
  );
}
