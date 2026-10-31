"use client";

import { Eye, EyeOff, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GradientName } from "@/lib/heatmap/client";
import { cn } from "@/lib/utils";

export type ToolbarState = { visible: boolean; gradient: GradientName; opacity: number; radius: number };

/** Map overlay controls: show/hide, gradient, opacity, radius and fullscreen. */
export function HeatmapToolbar({
  value,
  onChange,
  onToggleFullscreen,
}: {
  value: ToolbarState;
  onChange: (v: ToolbarState) => void;
  onToggleFullscreen?: () => void;
}) {
  const t = useTranslations("heatmap.toolbar");
  const set = <K extends keyof ToolbarState>(key: K, v: ToolbarState[K]) => onChange({ ...value, [key]: v });

  return (
    <div
      role="toolbar"
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-3.5 rounded-full border border-border/70 bg-surface/95 px-4 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-md"
    >
      {/* Heatmap Visibility Toggle */}
      <button
        type="button"
        aria-pressed={value.visible}
        onClick={() => set("visible", !value.visible)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
          value.visible
            ? "border-border-strong bg-surface text-foreground shadow-xs"
            : "border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        )}
      >
        {value.visible ? <Eye className="size-3.5 text-muted-foreground" /> : <EyeOff className="size-3.5 text-muted-foreground" />}
        <span>Heatmap</span>
      </button>

      {/* Low -> High Rainbow Gradient Bar */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Low</span>
        <div
          className="h-2.5 w-24 rounded-full shadow-inner"
          style={{
            background: "linear-gradient(to right, #0000ff, #00e5ff, #00e676, #ffeb3b, #ff9100, #ff1744)",
          }}
          title="Heat density spectrum"
        />
        <span className="text-xs font-medium text-muted-foreground">High</span>
      </div>

      {/* Opacity Slider */}
      <label className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("opacity")}</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={value.opacity}
          onChange={(e) => set("opacity", Number(e.target.value))}
          className="h-1.5 w-20 cursor-pointer accent-primary"
        />
        <span className="w-8 font-mono text-xs tabular-nums text-foreground">
          {Math.round(value.opacity * 100)}%
        </span>
      </label>

      {/* Radius Slider */}
      <label className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("radius")}</span>
        <input
          type="range"
          min={5}
          max={80}
          step={1}
          value={value.radius}
          onChange={(e) => set("radius", Number(e.target.value))}
          className="h-1.5 w-20 cursor-pointer accent-primary"
        />
        <span className="w-10 font-mono text-xs tabular-nums text-foreground">
          {value.radius} px
        </span>
      </label>

      {/* Fullscreen Button */}
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-border/60 hover:bg-surface-2"
        >
          <Maximize2 className="size-3.5 text-muted-foreground" />
          <span>Fullscreen</span>
        </button>
      )}
    </div>
  );
}
