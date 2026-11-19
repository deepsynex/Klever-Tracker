"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDiscardGuard } from "@/components/masters/discard-guard";
import { FormSection } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { gqlRequest } from "@/lib/graphql/client";
import {
  SAVE_VEHICLE_TYRE_PLAN,
  SET_VEHICLE_AXLE_TYRE_SIZES,
  TYRE_DISPOSITIONS,
  VEHICLE_TYRE_POSITIONS,
  type AxleConfiguration,
  type AxlePosition,
  type TyreDisposition,
  type VehicleTyrePositionsResult,
} from "@/lib/graphql/tyres";
import { axleRows, isTrailer, SPARE_AXLE, type AxleRow } from "@/lib/tyres/axle-layout";
import {
  initialPlan,
  putBack,
  removedTyres,
  removeTyre,
  swapTyres,
  type RotationPlan,
  addTyre,
  isNewTyre,
  planRemovals,
} from "@/lib/tyres/rotation-plan";
import { useTyreRemovals } from "@/lib/tyres/use-tyre-api";
import { useTyreMasters } from "@/lib/tyres/use-tyres";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { useVmLookups, useVmMutations, VM_KEY } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";
import { useTyreLabels } from "./tyre-labels";

// Drawing geometry (SVG units): the vehicle seen from above, front at the top.
const W = 480;
const CX = 178; // vehicle centre line; axle names sit on the right
const TYRE_W = 26;
const TYRE_H = 58;
const DUAL_GAP = 5;
const SINGLE_OFFSET = 112; // centre line → single tyre centre
const OUTER_OFFSET = 128; // centre line → outer dual tyre centre
const RAIL = 30; // centre line → chassis rail centre
const LABEL_X = CX + 158;
const SPARE_R = 30; // spare wheel radius (lying flat)

// Fixed paint (the drawing reads as a real vehicle in light and dark themes).
const CAB = { light: "#14918a", dark: "#0b6e69", edge: "#08524e" };
const STEEL = { light: "#9aa4ae", dark: "#5f6b76", edge: "#3f4851" };

/** Where each axle sits: steer axle beside the cab, a longer gap to the drive axles, tandems close together. */
function axleYs(rows: AxleRow[], trailer: boolean): number[] {
  const ys: number[] = [];
  rows.forEach((row, i) => {
    if (i === 0) ys.push(trailer ? 300 : 112);
    // Room between tandem axles for the position labels under each wheel.
    else ys.push(ys[i - 1]! + (row.kind !== rows[i - 1]!.kind ? 190 : 104));
  });
  return ys;
}

/** Centre x of each tyre, left to right. */
function tyreXs(row: AxleRow): Array<{ p: AxlePosition; x: number }> {
  const side = (list: AxlePosition[], sign: -1 | 1) =>
    list.map((p) => {
      if (p.placement === "single") return { p, x: CX + sign * SINGLE_OFFSET };
      const outer = CX + sign * OUTER_OFFSET;
      return { p, x: p.placement === "outer" ? outer : outer - sign * (TYRE_W + DUAL_GAP) };
    });
  return [...side(row.left, -1), ...side(row.right, 1)];
}

/** One tyre from above: shaded rubber with a chevron tread, highlighted when picked. */
function Tyre({ x, y, on, ids }: { x: number; y: number; on: boolean; ids: Ids }) {
  const left = x - TYRE_W / 2;
  const top = y - TYRE_H / 2;
  return (
    <>
      <rect
        x={left}
        y={top}
        width={TYRE_W}
        height={TYRE_H}
        rx="8"
        fill={`url(#${ids.rubber})`}
        stroke={on ? "var(--color-primary)" : "#05070a"}
        strokeWidth={on ? 3 : 1}
        filter={on ? `url(#${ids.glow})` : `url(#${ids.shadow})`}
      />
      {/* Tread blocks */}
      {Array.from({ length: 7 }, (_, i) => top + 7 + i * 7.4).map((ty) => (
        <path
          key={ty}
          d={`M${left + 4} ${ty + 2.6} L${x} ${ty - 1.4} L${left + TYRE_W - 4} ${ty + 2.6}`}
          fill="none"
          stroke={on ? "#7dd3c8" : "#4b5563"}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ))}
      {/* Shoulder shine */}
      <rect x={left + 2.5} y={top + 5} width={2.4} height={TYRE_H - 10} rx="1.2" fill="#ffffff" opacity="0.12" />
    </>
  );
}

/** A spare wheel lying flat, seen from above: tread ring, steel rim, hub and wheel nuts. */
function SpareWheel({ x, y, on, ids }: { x: number; y: number; on: boolean; ids: Ids }) {
  return (
    <>
      <circle
        cx={x}
        cy={y}
        r={SPARE_R}
        fill={`url(#${ids.rubber})`}
        stroke={on ? "var(--color-primary)" : "#05070a"}
        strokeWidth={on ? 3 : 1}
        filter={on ? `url(#${ids.glow})` : `url(#${ids.shadow})`}
      />
      {Array.from({ length: 24 }, (_, i) => (i * Math.PI * 2) / 24).map((a) => (
        <line
          key={a}
          x1={x + Math.cos(a) * (SPARE_R - 7)}
          y1={y + Math.sin(a) * (SPARE_R - 7)}
          x2={x + Math.cos(a) * (SPARE_R - 1.5)}
          y2={y + Math.sin(a) * (SPARE_R - 1.5)}
          stroke={on ? "#7dd3c8" : "#4b5563"}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
      <circle cx={x} cy={y} r={SPARE_R - 10} fill={`url(#${ids.steel})`} stroke={STEEL.edge} strokeWidth="1" />
      <circle cx={x} cy={y} r="6" fill="#1f2937" />
      {Array.from({ length: 6 }, (_, i) => (i * Math.PI * 2) / 6).map((a) => (
        <circle key={a} cx={x + Math.cos(a) * 11} cy={y + Math.sin(a) * 11} r="1.6" fill="#1f2937" />
      ))}
    </>
  );
}

type Ids = { rubber: string; cab: string; steel: string; glass: string; shadow: string; glow: string; deck: string };

/**
 * Top-down drawing of an axle configuration: the cab, frame, drive shaft and tanks (or a trailer
 * deck with its kingpin), each axle with its tyres (single or dual) and their position codes.
 * `highlight` marks one position; hovering a tyre reports it through `onHighlight`.
 */
/** The "+" on an empty position: tap to add a tyre there. */
function AddMark({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r="8" className="fill-surface stroke-primary" strokeWidth="1.5" />
      <path d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} className="stroke-primary" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
}

export function AxleDiagram({
  config,
  highlight,
  onHighlight,
  occupancy,
  canSwap,
  onSwap,
  onRejected,
  onRemove,
  onSelect,
  onEmptyTap,
  rings,
  spares = [],
}: {
  config: AxleConfiguration;
  highlight?: string | null;
  onHighlight?: (code: string | null) => void;
  /**
   * The tyre on each position (its label, e.g. the serial number), or null when the position is
   * empty. With `onSwap`, a tyre can be dragged onto another position (or tapped, then the target
   * tapped) to swap or move it; `canSwap` says whether the sizes allow it, and `onRejected` hears
   * about a drop that isn't allowed.
   */
  occupancy?: Record<string, string | null>;
  canSwap?: (from: string, to: string) => boolean;
  onSwap?: (from: string, to: string) => void;
  onRejected?: (from: string, to: string) => void;
  /** A tyre was dragged out of the drawing: take it off the vehicle. */
  onRemove?: (position: string) => void;
  /** Spare tyre positions (e.g. "SP1"), drawn on a carrier behind the rear bumper. */
  spares?: string[];
  /** Without `onSwap` (read-only): a fitted tyre was tapped, e.g. to inspect it. */
  onSelect?: (position: string) => void;
  /** An empty position was tapped (nothing picked first): add a tyre there. Draws a "+" on empty positions. */
  onEmptyTap?: (position: string) => void;
  /** A coloured ring per position (e.g. an inspected tyre's condition: good / critical / replace). */
  rings?: Record<string, string>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{
    code: string;
    x: number;
    y: number;
    sx: number;
    sy: number;
    moved: boolean;
    /** The pointer has left the drawing: releasing removes the tyre. */
    outside: boolean;
  } | null>(null);
  // Tap-to-move (touch, keyboard-less): the tyre picked first.
  const [picked, setPicked] = useState<string | null>(null);
  const t = useTranslations("masters.tyres.axleView");
  const labels = useTyreLabels();
  const uid = useId().replace(/:/g, "");
  const ids: Ids = {
    rubber: `${uid}-rubber`,
    cab: `${uid}-cab`,
    steel: `${uid}-steel`,
    glass: `${uid}-glass`,
    shadow: `${uid}-shadow`,
    glow: `${uid}-glow`,
    deck: `${uid}-deck`,
  };
  const rows = useMemo(() => axleRows(config.positions), [config.positions]);
  const trailer = isTrailer(rows);
  const ys = axleYs(rows, trailer);
  const firstY = ys[0] ?? 112;
  const lastY = ys.at(-1) ?? 112;
  const rearY = lastY + 62;
  // The spare carrier hangs behind the rear bumper.
  const spareY = rearY + 58;
  const height = (spares.length ? spareY + 48 : rearY) + 46;
  const spareSpots = spares.map((code, i) => ({ code, x: CX + (i - (spares.length - 1) / 2) * 72, y: spareY }));
  const driveYs = rows.flatMap((r, i) => (r.kind === "drive" ? [ys[i]!] : []));
  // Every tyre's centre, for finding the position under the pointer.
  const spots = [
    ...rows.flatMap((row, i) => tyreXs(row).map(({ p, x }) => ({ code: p.code, x, y: ys[i]!, spare: false }))),
    ...spareSpots.map((s) => ({ ...s, spare: true })),
  ];
  const planning = Boolean(onSwap);
  const source = drag?.moved ? drag.code : picked;

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const spotAt = (x: number, y: number, except: string) =>
    spots.find(
      (s) =>
        s.code !== except &&
        (s.spare
          ? Math.hypot(s.x - x, s.y - y) <= SPARE_R + 6
          : Math.abs(s.x - x) <= TYRE_W / 2 + 4 && Math.abs(s.y - y) <= TYRE_H / 2 + 6),
    ) ?? null;
  const overCode = drag?.moved ? (spotAt(drag.x, drag.y, drag.code)?.code ?? null) : null;

  /** Whether a position has no tyre. */
  const isEmpty = (code: string) => Boolean(occupancy) && !occupancy![code];
  const tryMove = (from: string, to: string) => {
    if (canSwap && !canSwap(from, to)) onRejected?.(from, to);
    else onSwap?.(from, to);
  };
  const onTyreDown = (code: string, e: ReactPointerEvent<SVGGElement>) => {
    if (!planning) {
      if (!isEmpty(code)) onSelect?.(code);
      return;
    }
    // An empty position can't be dragged: tapping it adds a tyre, or it receives the tyre picked first.
    if (isEmpty(code) && picked === null) {
      onEmptyTap?.(code);
      return;
    }
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = toSvg(e);
    setDrag({ code, x, y, sx: x, sy: y, moved: false, outside: false });
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const { x, y } = toSvg(e);
    const box = svgRef.current?.getBoundingClientRect();
    const outside = box
      ? e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom
      : false;
    setDrag({ ...drag, x, y, outside, moved: drag.moved || Math.hypot(x - drag.sx, y - drag.sy) > 6 });
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.moved && drag.outside && !isEmpty(drag.code)) onRemove?.(drag.code);
    else if (drag.moved) {
      const target = spotAt(drag.x, drag.y, drag.code);
      if (target) tryMove(drag.code, target.code);
    } else if (picked === null) setPicked(drag.code);
    else if (picked === drag.code) setPicked(null);
    else {
      tryMove(picked, drag.code);
      setPicked(null);
    }
    setDrag(null);
  };

  const axleName = (row: AxleRow) =>
    row.kind === "steer"
      ? t("kinds.steer")
      : row.kind === "drive"
        ? t("kinds.drive", { n: row.kindNo })
        : row.kind === "trailer"
          ? t("kinds.trailer", { n: row.kindNo })
          : t("kinds.axle", { n: row.axleNo });

  return (
    <svg
      ref={svgRef}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      viewBox={`0 0 ${W} ${height}`}
      className="mx-auto block w-full max-w-[480px]"
      role="img"
      aria-label={t("diagramLabel", { layout: labels.axle(config) })}
      // Left and right are the vehicle's own sides, so the drawing never flips for Arabic.
      style={{ direction: "ltr" }}
    >
      <defs>
        <linearGradient id={ids.rubber} x1="0" x2="1">
          <stop offset="0" stopColor="#0b0f15" />
          <stop offset="0.45" stopColor="#2a323d" />
          <stop offset="1" stopColor="#0b0f15" />
        </linearGradient>
        <linearGradient id={ids.cab} x1="0" x2="1">
          <stop offset="0" stopColor={CAB.dark} />
          <stop offset="0.5" stopColor={CAB.light} />
          <stop offset="1" stopColor={CAB.dark} />
        </linearGradient>
        <linearGradient id={ids.steel} x1="0" x2="1">
          <stop offset="0" stopColor={STEEL.dark} />
          <stop offset="0.5" stopColor={STEEL.light} />
          <stop offset="1" stopColor={STEEL.dark} />
        </linearGradient>
        <linearGradient id={ids.glass} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f172a" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <linearGradient id={ids.deck} x1="0" x2="1">
          <stop offset="0" stopColor="#8b6b4a" />
          <stop offset="0.5" stopColor="#a5835f" />
          <stop offset="1" stopColor="#8b6b4a" />
        </linearGradient>
        <filter id={ids.shadow} x="-30%" y="-20%" width="160%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#000" floodOpacity="0.35" />
        </filter>
        <filter id={ids.glow} x="-60%" y="-40%" width="220%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="var(--color-primary)" floodOpacity="0.8" />
        </filter>
      </defs>

      {/* Direction of travel */}
      <g className="fill-muted-foreground">
        <path d={`M${CX} 4 l8 11 h-16 Z`} />
        <text x={CX + 14} y={14} fontSize="11" fontWeight="600">
          {t("front")}
        </text>
      </g>

      {trailer ? (
        <>
          {/* Deck with planks, kingpin plate and landing legs */}
          <rect
            x={CX - 96}
            y={26}
            width={192}
            height={rearY - 26}
            rx="8"
            fill={`url(#${ids.deck})`}
            stroke="#5c4630"
            strokeWidth="1.5"
            filter={`url(#${ids.shadow})`}
          />
          {Array.from({ length: Math.floor((rearY - 40) / 22) }, (_, i) => 40 + i * 22).map((py) => (
            <line
              key={py}
              x1={CX - 92}
              y1={py}
              x2={CX + 92}
              y2={py}
              stroke="#5c4630"
              strokeOpacity="0.35"
              strokeWidth="1"
            />
          ))}
          <rect x={CX - 26} y={44} width={52} height={40} rx="6" fill={`url(#${ids.steel})`} stroke={STEEL.edge} />
          <circle cx={CX} cy={64} r="8" fill="#1f2937" stroke="#e5e7eb" strokeWidth="2" />
          {[-1, 1].map((s) => (
            <rect
              key={s}
              x={CX + s * 70 - 8}
              y={150}
              width={16}
              height={16}
              rx="3"
              fill={`url(#${ids.steel})`}
              stroke={STEEL.edge}
            />
          ))}
          <rect x={CX - 96} y={rearY - 10} width={192} height={10} rx="3" fill="#374151" />
        </>
      ) : (
        <>
          {/* Frame rails and cross-members */}
          {[-1, 1].map((s) => (
            <rect
              key={s}
              x={CX + s * RAIL - 5}
              y={110}
              width={10}
              height={rearY - 110}
              rx="3"
              fill={`url(#${ids.steel})`}
              stroke={STEEL.edge}
              strokeWidth="0.8"
            />
          ))}
          {Array.from({ length: Math.floor((rearY - 150) / 58) + 1 }, (_, i) => 150 + i * 58).map((cy) => (
            <rect
              key={cy}
              x={CX - RAIL}
              y={cy - 3}
              width={RAIL * 2}
              height={6}
              rx="2"
              fill={STEEL.dark}
              opacity="0.85"
            />
          ))}
          {/* Drive shaft: gearbox → each drive axle */}
          {driveYs.length ? (
            <>
              <rect x={CX - 12} y={146} width={24} height={30} rx="6" fill={`url(#${ids.steel})`} stroke={STEEL.edge} />
              <line
                x1={CX}
                y1={176}
                x2={CX}
                y2={driveYs.at(-1)!}
                stroke="#374151"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </>
          ) : null}
          {/* Fuel tank (left) and battery box (right), hung outside the rails */}
          <rect
            x={CX - RAIL - 52}
            y={firstY + 62}
            width={44}
            height={driveYs[0] ? Math.min(96, driveYs[0] - firstY - 112) : 80}
            rx="12"
            fill={`url(#${ids.steel})`}
            stroke={STEEL.edge}
            filter={`url(#${ids.shadow})`}
          />
          <circle cx={CX - RAIL - 30} cy={firstY + 76} r="5" fill="#1f2937" stroke={STEEL.light} strokeWidth="1.5" />
          <rect
            x={CX + RAIL + 8}
            y={firstY + 70}
            width={38}
            height={44}
            rx="5"
            fill="#1f2937"
            stroke="#0b0f15"
            filter={`url(#${ids.shadow})`}
          />
          <rect x={CX + RAIL + 14} y={firstY + 76} width={26} height={6} rx="2" fill="#4b5563" />
          {/* Rear bumper */}
          <rect x={CX - 72} y={rearY - 10} width={144} height={10} rx="4" fill="#374151" />
          {[-1, 1].map((s) => (
            <rect key={s} x={CX + s * 64 - 6} y={rearY - 9} width={12} height={8} rx="2" fill="#ef4444" />
          ))}
          {/* Cab: nose, windscreen, roof with hatch and deflector, mirrors, steps */}
          {[-1, 1].map((s) => (
            <g key={s}>
              <line
                x1={CX + s * 82}
                y1={58}
                x2={CX + s * 100}
                y2={52}
                stroke="#1f2937"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <rect x={CX + s * 100 - 5} y={42} width={10} height={20} rx="3" fill="#1f2937" />
            </g>
          ))}
          <path
            d={`M${CX - 84} 132 L${CX - 84} 48 Q${CX - 84} 22 ${CX - 56} 22 L${CX + 56} 22 Q${CX + 84} 22 ${CX + 84} 48 L${CX + 84} 132 Z`}
            fill={`url(#${ids.cab})`}
            stroke={CAB.edge}
            strokeWidth="1.5"
            filter={`url(#${ids.shadow})`}
          />
          <path
            d={`M${CX - 70} 40 Q${CX} 28 ${CX + 70} 40 L${CX + 64} 58 Q${CX} 50 ${CX - 64} 58 Z`}
            fill={`url(#${ids.glass})`}
          />
          <rect x={CX - 58} y={66} width={116} height={56} rx="12" fill="#ffffff" opacity="0.14" />
          <rect x={CX - 18} y={80} width={36} height={26} rx="5" fill={CAB.edge} opacity="0.6" />
          <rect x={CX - 66} y={124} width={132} height={6} rx="3" fill={CAB.edge} opacity="0.7" />
        </>
      )}

      {rows.map((row, i) => {
        const y = ys[i]!;
        const tyres = tyreXs(row);
        const leftTyres = tyres.filter(({ p }) => p.side === "left").map(({ x }) => x);
        const rightTyres = tyres.filter(({ p }) => p.side === "right").map(({ x }) => x);
        const minX = Math.min(...tyres.map((t) => t.x));
        const maxX = Math.max(...tyres.map((t) => t.x));
        const guard = (xs: number[]) =>
          xs.length ? (
            <rect
              x={Math.min(...xs) - TYRE_W / 2 - 5}
              y={y - TYRE_H / 2 - 7}
              width={Math.max(...xs) - Math.min(...xs) + TYRE_W + 10}
              height={TYRE_H + 14}
              rx="9"
              className="fill-surface-2 stroke-border"
              strokeWidth="1.2"
              opacity="0.9"
            />
          ) : null;
        return (
          <g key={row.axleNo}>
            {/* Mudguards behind the wheels (not on the steer axle, which sits beside the cab) */}
            {row.kind !== "steer" ? (
              <>
                {guard(leftTyres)}
                {guard(rightTyres)}
              </>
            ) : null}
            {/* Axle housing, with the differential on drive axles. Under the cab only the stub
                axles beside it show (the beam itself is hidden by the cab). */}
            {(row.kind === "steer" && !trailer
              ? [
                  [minX, CX - 84],
                  [CX + 84, maxX],
                ]
              : [[minX, maxX]]
            ).map(([from, to]) => (
              <rect
                key={from}
                x={from}
                y={y - (row.kind === "drive" ? 5 : 3.5)}
                width={to! - from!}
                height={row.kind === "drive" ? 10 : 7}
                rx="3"
                fill={`url(#${ids.steel})`}
                stroke={STEEL.edge}
                strokeWidth="0.8"
              />
            ))}
            {row.kind === "drive" ? (
              <ellipse
                cx={CX}
                cy={y}
                rx="17"
                ry="14"
                fill={`url(#${ids.steel})`}
                stroke={STEEL.edge}
                strokeWidth="1.2"
              />
            ) : null}
            {tyres.map(({ p, x }) => {
              const on = highlight === p.code || picked === p.code;
              const tyreHere = occupancy ? (occupancy[p.code] ?? null) : null;
              const empty = Boolean(occupancy) && tyreHere === null;
              // While a tyre is being moved: where it may go (green) and where it may not (dimmed).
              const target = source && source !== p.code ? (canSwap ? canSwap(source, p.code) : true) : null;
              const lifted = drag?.moved && drag.code === p.code;
              return (
                <g
                  key={p.code}
                  onMouseEnter={() => onHighlight?.(p.code)}
                  onMouseLeave={() => onHighlight?.(null)}
                  onPointerDown={(e) => onTyreDown(p.code, e)}
                  style={
                    planning
                      ? { cursor: empty ? "pointer" : drag ? "grabbing" : "grab", touchAction: "none" }
                      : undefined
                  }
                  opacity={lifted ? 0.3 : target === false ? 0.35 : 1}
                >
                  <title>
                    {`${p.code}: ${axleName(row)}, ${t(`sides.${p.side}`)}, ${t(`placements.${p.placement}`)} · ${tyreHere ?? t("plan.empty")}`}
                  </title>
                  {target ? (
                    <rect
                      x={x - TYRE_W / 2 - 5}
                      y={y - TYRE_H / 2 - 5}
                      width={TYRE_W + 10}
                      height={TYRE_H + 10}
                      rx="11"
                      fill={overCode === p.code ? "#22c55e33" : "none"}
                      stroke="#22c55e"
                      strokeWidth="2"
                      strokeDasharray="5 3"
                    />
                  ) : null}
                  {empty ? (
                    <>
                      <g opacity="0.22">
                        <Tyre x={x} y={y} on={false} ids={ids} />
                      </g>
                      <rect
                        x={x - TYRE_W / 2}
                        y={y - TYRE_H / 2}
                        width={TYRE_W}
                        height={TYRE_H}
                        rx="8"
                        fill="none"
                        className={on ? "stroke-primary" : "stroke-muted-foreground"}
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                      />
                      {onEmptyTap ? <AddMark x={x} y={y} /> : null}
                    </>
                  ) : (
                    <Tyre x={x} y={y} on={on} ids={ids} />
                  )}
                  {rings?.[p.code] ? (
                    <rect
                      x={x - TYRE_W / 2 - 4}
                      y={y - TYRE_H / 2 - 4}
                      width={TYRE_W + 8}
                      height={TYRE_H + 8}
                      rx="11"
                      fill="none"
                      stroke={rings[p.code]}
                      strokeWidth="3"
                    />
                  ) : null}
                  {/* Position code chip */}
                  <rect
                    x={x - 16}
                    y={y + TYRE_H / 2 + 9}
                    width={32}
                    height={15}
                    rx="7.5"
                    className={on ? "fill-primary" : "fill-surface stroke-border"}
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={y + TYRE_H / 2 + 20}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="ui-monospace, monospace"
                    className={on ? "fill-primary-foreground" : "fill-foreground"}
                  >
                    {p.code}
                  </text>
                </g>
              );
            })}
            {/* Axle name on the right */}
            <text x={LABEL_X} y={y - 3} fontSize="12" fontWeight="700" className="fill-foreground">
              {axleName(row)}
            </text>
            <text x={LABEL_X} y={y + 13} fontSize="10.5" className="fill-muted-foreground">
              {t("tyreCount", { n: tyres.length })}
            </text>
          </g>
        );
      })}

      {/* Spare carrier and its tyre(s), lying flat */}
      {spareSpots.length ? (
        <g pointerEvents="none">
          {[-1, 1].map((s) => (
            <line
              key={s}
              x1={CX + s * 26}
              y1={rearY}
              x2={CX + s * 26}
              y2={spareY - SPARE_R + 4}
              stroke={STEEL.dark}
              strokeWidth="5"
            />
          ))}
          <rect
            x={spareSpots[0]!.x - SPARE_R - 8}
            y={spareY - SPARE_R - 8}
            width={spareSpots.at(-1)!.x - spareSpots[0]!.x + (SPARE_R + 8) * 2}
            height={(SPARE_R + 8) * 2}
            rx="12"
            fill="none"
            stroke={STEEL.dark}
            strokeWidth="3"
          />
          <text x={LABEL_X} y={spareY - 3} fontSize="12" fontWeight="700" className="fill-foreground">
            {t("kinds.spare")}
          </text>
          <text x={LABEL_X} y={spareY + 13} fontSize="10.5" className="fill-muted-foreground">
            {t("tyreCount", { n: spareSpots.length })}
          </text>
        </g>
      ) : null}
      {spareSpots.map(({ code, x, y }) => {
        const on = highlight === code || picked === code;
        const tyreHere = occupancy ? (occupancy[code] ?? null) : null;
        const empty = Boolean(occupancy) && tyreHere === null;
        const target = source && source !== code ? (canSwap ? canSwap(source, code) : true) : null;
        const lifted = drag?.moved && drag.code === code;
        return (
          <g
            key={code}
            onMouseEnter={() => onHighlight?.(code)}
            onMouseLeave={() => onHighlight?.(null)}
            onPointerDown={(e) => onTyreDown(code, e)}
            style={
              planning ? { cursor: empty ? "pointer" : drag ? "grabbing" : "grab", touchAction: "none" } : undefined
            }
            opacity={lifted ? 0.3 : target === false ? 0.35 : 1}
          >
            <title>{`${code}: ${t("kinds.spare")} · ${tyreHere ?? t("plan.empty")}`}</title>
            {target ? (
              <circle
                cx={x}
                cy={y}
                r={SPARE_R + 6}
                fill={overCode === code ? "#22c55e33" : "none"}
                stroke="#22c55e"
                strokeWidth="2"
                strokeDasharray="5 3"
              />
            ) : null}
            {empty ? (
              <>
                <g opacity="0.22">
                  <SpareWheel x={x} y={y} on={false} ids={ids} />
                </g>
                <circle
                  cx={x}
                  cy={y}
                  r={SPARE_R}
                  fill="none"
                  className={on ? "stroke-primary" : "stroke-muted-foreground"}
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                {onEmptyTap ? <AddMark x={x} y={y} /> : null}
              </>
            ) : (
              <SpareWheel x={x} y={y} on={on} ids={ids} />
            )}
            {rings?.[code] ? (
              <circle cx={x} cy={y} r={SPARE_R + 4} fill="none" stroke={rings[code]} strokeWidth="3" />
            ) : null}
            <rect
              x={x - 16}
              y={y + SPARE_R + 10}
              width={32}
              height={15}
              rx="7.5"
              className={on ? "fill-primary" : "fill-surface stroke-border"}
              strokeWidth="1"
            />
            <text
              x={x}
              y={y + SPARE_R + 21}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fontFamily="ui-monospace, monospace"
              className={on ? "fill-primary-foreground" : "fill-foreground"}
            >
              {code}
            </text>
          </g>
        );
      })}

      {/* The tyre being dragged follows the pointer. */}
      {drag?.moved && !isEmpty(drag.code) ? (
        <g opacity={drag.outside ? 0.55 : 0.9} pointerEvents="none">
          <Tyre
            x={Math.min(W - TYRE_W, Math.max(TYRE_W, drag.x))}
            y={Math.min(height - TYRE_H / 2, Math.max(TYRE_H / 2, drag.y))}
            on={!drag.outside}
            ids={ids}
          />
        </g>
      ) : null}
      {drag?.moved && drag.outside && onRemove && !isEmpty(drag.code) ? (
        <g pointerEvents="none">
          <rect x={CX - 110} y={22} width={220} height={26} rx="13" fill="#ef4444" />
          <text x={CX} y={39} textAnchor="middle" fontSize="12" fontWeight="700" fill="#ffffff">
            {t("plan.releaseToRemove", { code: occupancy?.[drag.code] ?? drag.code })}
          </text>
        </g>
      ) : null}

      {/* Sides */}
      <text
        x={CX - OUTER_OFFSET}
        y={height - 6}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        className="fill-muted-foreground"
      >
        {t("sides.left")}
      </text>
      <text
        x={CX + OUTER_OFFSET}
        y={height - 6}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        className="fill-muted-foreground"
      >
        {t("sides.right")}
      </text>
    </svg>
  );
}

/** What to call an axle (by number; 0 is the spares). */
function useAxleNamer(rows: AxleRow[]) {
  const t = useTranslations("masters.tyres.axleView");
  return (axleNo: number) => {
    if (axleNo === SPARE_AXLE) return t("kinds.spare");
    const row = rows.find((r) => r.axleNo === axleNo);
    if (!row) return String(axleNo);
    return row.kind === "steer"
      ? t("kinds.steer")
      : row.kind === "drive"
        ? t("kinds.drive", { n: row.kindNo })
        : row.kind === "trailer"
          ? t("kinds.trailer", { n: row.kindNo })
          : t("kinds.axle", { n: row.axleNo });
  };
}

/**
 * Customer vehicle → its tyres: the axle drawing, a summary, the tyre size per axle (saved straight
 * away) and every position. Every position whose axle has a size has a tyre. Tyres are planned on the
 * drawing: drag one onto another position to swap or move it, drag it out to take it off (saying what
 * happened to it), and put a taken-off tyre back. The plan isn't saved.
 */
export function AxleConfigSheet({
  vehicleId,
  plate,
  vehicleName,
  customerName,
  application,
  dailyKm,
  config,
  onClose,
}: {
  vehicleId: string;
  plate: string;
  vehicleName: string | null;
  customerName: string;
  application: string | null;
  dailyKm: number | null;
  config: AxleConfiguration;
  onClose: () => void;
}) {
  const t = useTranslations("masters.tyres.axleView");
  const labels = useTyreLabels();
  const lookups = useVmLookups();
  const { run, refresh, fail } = useVmMutations();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => axleRows(config.positions), [config.positions]);
  const axleName = useAxleNamer(rows);

  const query = useQuery({
    queryKey: [VM_KEY, "vehicleTyres", vehicleId],
    queryFn: () => gqlRequest<VehicleTyrePositionsResult>(VEHICLE_TYRE_POSITIONS, { id: vehicleId }),
  });
  const positions = useMemo(
    () => [...(query.data?.vehicle?.tyrePositions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [query.data],
  );
  const byCode = useMemo(() => new Map(positions.map((p) => [p.code, p])), [positions]);
  const spares = positions.filter((p) => p.isSpare).map((p) => p.code);

  // Tyre sizes (Tyre masters) and the size per axle, read from the positions (spares are axle 0).
  const masters = useTyreMasters();
  const sizes = useMemo(
    () =>
      (masters.data?.tyreSizes?.data ?? [])
        .filter((s) => lookups.inScope(s.companyId))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [masters.data, lookups],
  );
  const axleSizes: Record<number, string> = {};
  for (const p of positions) if (p.tyreSizeId) axleSizes[p.axleNo] = p.tyreSizeId;
  const sizeOf = (code: string) => byCode.get(code)?.tyreSizeId ?? null;
  const sizeName = (id: string | null | undefined) => sizes.find((s) => s.id === id)?.name ?? t("plan.noSize");
  const slots = [...rows.map((r) => r.axleNo), ...(spares.length ? [SPARE_AXLE] : [])];

  const setAxleSize = async (axleNo: number, tyreSizeId: string) => {
    setBusy(true);
    try {
      await run(SET_VEHICLE_AXLE_TYRE_SIZES, {
        vehicleId,
        sizes: slots.map((a) => ({ axleNo: a, tyreSizeId: (a === axleNo ? tyreSizeId : axleSizes[a]) || null })),
      });
      await refresh();
      toast.success(t("saved.size"));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  // The plan: the tyre on each position now, known by the position it started on.
  const order = useMemo(() => positions.map((p) => p.code), [positions]);
  // The saved layout: which positions have a tyre.
  const start = useMemo(() => initialPlan(positions.map((p) => ({ code: p.code, hasTyre: p.fitted }))), [positions]);
  const [edited, setEdited] = useState<RotationPlan | null>(null);
  // Positions the plan doesn't know yet (an axle size set since) start as they are, and a position
  // whose axle has no size can't hold a tyre (the API refuses it, and clears it with the size).
  const merged: RotationPlan = edited ? { ...start, ...edited } : start;
  const plan: RotationPlan = Object.fromEntries(order.map((code) => [code, sizeOf(code) ? merged[code] : null]));
  const [fates, setFates] = useState<Record<string, { fate: TyreDisposition; note: string }>>({});
  const removed = removedTyres(plan, start, order);
  /** A tyre's name: its serial number when it has one, else the position it started on. */
  const tyreName = (tyre: string) => (isNewTyre(tyre) ? t("plan.newTyre") : (byCode.get(tyre)?.tyre?.serialNo ?? tyre));
  /** Puts a new tyre on an empty position; the axle needs a tyre size first. */
  const addHere = (position: string) => {
    if (!sizeOf(position)) return void toast.error(t("plan.addNeedsSize"));
    setEdited(addTyre(plan, position));
  };
  const occupancy = Object.fromEntries(order.map((code) => [code, plan[code] ? tyreName(plan[code]) : null]));
  const onVehicle = order.filter((code) => plan[code]).length;

  // Taking a tyre off: what happened to it.
  const [removing, setRemoving] = useState<string | null>(null);
  const [fate, setFate] = useState<TyreDisposition | null>(null);
  const [fateNote, setFateNote] = useState("");
  const removingPos = removing ? byCode.get(removing) : undefined;
  const removingTyre = removing ? plan[removing] : null;

  const sideText = (code: string) => {
    const side = byCode.get(code)?.side;
    return side ? t(`sides.${side}`) : "—";
  };
  const canEdit = lookups.allow("tyres", "edit");
  const guard = useDiscardGuard(Boolean(edited), onClose);
  const resetPlan = () => {
    setEdited(null);
    setFates({});
  };
  /** Saves the plan: the positions with a tyre now, and what happened to the tyres taken off. */
  const savePlan = async () => {
    setBusy(true);
    try {
      await run(SAVE_VEHICLE_TYRE_PLAN, {
        vehicleId,
        positions: order.map((code) => ({ code, fitted: Boolean(plan[code]) })),
        removals: planRemovals(plan, start, order, fates, (to) => t("plan.movedNote", { code: to })),
      });
      await refresh();
      resetPlan();
      toast.success(t("plan.saved"));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const facts: Array<[string, string]> = [
    [t("facts.layout"), labels.axle(config)],
    [t("facts.axles"), String(rows.length)],
    [t("facts.tyres"), t("facts.tyresWithSpare", { n: config.positions.length, spares: spares.length })],
    [t("facts.fitted"), t("facts.fittedOf", { n: onVehicle, total: positions.length })],
    [t("facts.customer"), customerName],
    [t("facts.application"), labels.application(application)],
    [t("facts.dailyKm"), dailyKm === null ? "—" : t("km", { n: dailyKm })],
  ];

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && guard.requestClose()}
      size="xl"
      title={t("title", { plate })}
      description={vehicleName ? `${vehicleName} · ${labels.axle(config)}` : labels.axle(config)}
      footer={
        canEdit ? (
          <>
            <Button variant="secondary" onClick={resetPlan} disabled={!edited || busy}>
              <RotateCcw />
              {t("plan.reset")}
            </Button>
            <Button onClick={() => void savePlan()} disabled={!edited || busy}>
              {busy ? t("plan.saving") : t("plan.save")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Only as tall as the drawing, and stays in view while the table scrolls. */}
        <div
          className={cn(
            "rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_50%_30%,var(--color-surface)_0%,var(--color-surface-2)_100%)] p-4 lg:sticky lg:top-0",
            busy && "pointer-events-none opacity-70",
          )}
          aria-busy={busy || query.isPending}
        >
          {query.isPending ? (
            <div className="h-96 animate-pulse rounded-xl bg-surface-2" />
          ) : (
            <AxleDiagram
              config={config}
              highlight={highlight}
              onHighlight={setHighlight}
              occupancy={occupancy}
              spares={spares}
              canSwap={canEdit ? (a, b) => Boolean(sizeOf(a)) && sizeOf(a) === sizeOf(b) : undefined}
              onSwap={canEdit ? (a, b) => setEdited(swapTyres(plan, a, b)) : undefined}
              onRejected={(a, b) =>
                toast.error(
                  !sizeOf(a) || !sizeOf(b)
                    ? t("plan.sizeMissing")
                    : t("plan.sizeMismatch", { from: sizeName(sizeOf(a)), to: sizeName(sizeOf(b)) }),
                )
              }
              onEmptyTap={canEdit ? addHere : undefined}
              onRemove={
                canEdit
                  ? (position) => {
                      setFate(null);
                      setFateNote("");
                      setRemoving(position);
                    }
                  : undefined
              }
            />
          )}
        </div>
        <div className="grid content-start gap-5">
          <dl className="grid grid-cols-2 gap-3">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/70 px-3 py-2">
                <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
                <dd className="text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {canEdit ? <Alert tone="info">{t("plan.hint")}</Alert> : null}
          {removed.length ? (
            <FormSection title={t("plan.removedTitle")} description={t("plan.removedHint")} columns={1}>
              <ul className="grid gap-2">
                {removed.map((tyre) => (
                  <li
                    key={tyre}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2"
                  >
                    <div className="grid">
                      <span className="text-sm font-semibold">
                        <span className="font-mono" dir="ltr">
                          {tyreName(tyre)}
                        </span>
                        {" · "}
                        {axleName(byCode.get(tyre)?.axleNo ?? 0)}, {sideText(tyre)}
                        {" · "}
                        <span dir="ltr">{sizeName(sizeOf(tyre))}</span>
                      </span>
                      {fates[tyre] ? (
                        <span className="text-xs text-muted-foreground">
                          {t(`fate.options.${fates[tyre].fate}`)}
                          {fates[tyre].note ? ` · ${fates[tyre].note}` : ""}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!canEdit}
                      onClick={() => {
                        setEdited(putBack(plan, tyre, order));
                        setFates((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== tyre)));
                      }}
                    >
                      {t("plan.putBack")}
                    </Button>
                  </li>
                ))}
              </ul>
            </FormSection>
          ) : null}
          <FormSection title={t("plan.sizes")} description={t("plan.sizesHint")} columns={1}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {slots.map((axleNo) => (
                <li key={axleNo} className="grid gap-1">
                  <label htmlFor={`axle-size-${axleNo}`} className="text-xs font-semibold">
                    {axleName(axleNo)}
                  </label>
                  <Select
                    id={`axle-size-${axleNo}`}
                    value={axleSizes[axleNo] ?? ""}
                    disabled={!canEdit || busy}
                    onChange={(e) => void setAxleSize(axleNo, e.target.value)}
                  >
                    <option value="">{t("plan.noSize")}</option>
                    {sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </FormSection>
          <FormSection title={t("positions")} description={t("positionsHint")} columns={1}>
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold">{t("cols.position")}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t("cols.axle")}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t("cols.side")}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t("cols.size")}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t("cols.tyre")}</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const here = plan[p.code];
                    return (
                      <tr
                        key={p.code}
                        onMouseEnter={() => setHighlight(p.code)}
                        onMouseLeave={() => setHighlight(null)}
                        className={cn("border-t border-border/50", highlight === p.code && "bg-primary-soft")}
                      >
                        <td className="px-3 py-1.5 font-mono text-xs font-semibold" dir="ltr">
                          {p.code}
                        </td>
                        <td className="px-3 py-1.5">{axleName(p.axleNo)}</td>
                        <td className="px-3 py-1.5">{p.side ? t(`sides.${p.side}`) : "—"}</td>
                        <td className="px-3 py-1.5" dir="ltr">
                          {p.tyreSize?.name ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {!here ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-red-600 dark:text-red-400">{t("plan.empty")}</span>
                              {canEdit && p.tyreSizeId ? (
                                <Button variant="secondary" size="sm" onClick={() => addHere(p.code)}>
                                  <Plus />
                                  {t("plan.addTyre")}
                                </Button>
                              ) : null}
                            </div>
                          ) : isNewTyre(here) ? (
                            <span className="font-semibold text-primary">{t("plan.newTyre")}</span>
                          ) : here !== p.code ? (
                            <span className="font-semibold text-primary">
                              {t("plan.from", { code: tyreName(here) })}
                            </span>
                          ) : p.tyre ? (
                            <div className="grid">
                              <span className="font-mono text-xs font-semibold" dir="ltr">
                                {p.tyre.serialNo}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {p.tyre.product?.displayName ?? ""}
                                {p.tyre.treadDepthMm !== null ? ` · ${t("tread", { mm: p.tyre.treadDepthMm })}` : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </FormSection>
          <RemovalHistory vehicleId={vehicleId} />
        </div>
      </div>

      {/* Taking a tyre off: what happened to it. */}
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("fate.title")}
        description={
          removing
            ? t("fate.description", {
                axle: axleName(removingPos?.axleNo ?? 0),
                side: sideText(removing),
                size: sizeName(removingPos?.tyreSizeId),
              })
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t("fate.cancel")}
            </Button>
            <Button
              disabled={!fate || (fate === "other" && !fateNote.trim())}
              onClick={() => {
                if (!removing || !removingTyre || !fate) return;
                setFates((f) => ({ ...f, [removingTyre]: { fate, note: fateNote.trim() } }));
                setEdited(removeTyre(plan, removing));
                setRemoving(null);
              }}
            >
              {t("fate.confirm")}
            </Button>
          </>
        }
      >
        {removing ? (
          <div className="grid gap-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  [t("fate.tyre"), removingTyre ? tyreName(removingTyre) : "—"],
                  [t("cols.axle"), axleName(removingPos?.axleNo ?? 0)],
                  [t("cols.side"), sideText(removing)],
                  [t("fate.size"), sizeName(removingPos?.tyreSizeId)],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/70 px-3 py-2">
                  <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <div role="radiogroup" aria-label={t("fate.title")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TYRE_DISPOSITIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={fate === option}
                  onClick={() => setFate(option)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-start text-sm font-medium transition-colors",
                    fate === option
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border/70 hover:bg-surface-2",
                  )}
                >
                  {t(`fate.options.${option}`)}
                </button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="tyre-fate-note" className="text-xs font-medium text-muted-foreground">
                {fate === "other" ? t("fate.noteRequired") : t("fate.note")}
              </label>
              <Textarea id="tyre-fate-note" rows={2} value={fateNote} onChange={(e) => setFateNote(e.target.value)} />
            </div>
          </div>
        ) : null}
      </Dialog>
      {guard.dialog}
    </Sheet>
  );
}

/** Tyres taken off this vehicle (saved with the plan): when, where, what happened and by whom. */
function RemovalHistory({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("masters.tyres.axleView");
  const zone = useCompanyTimeZone();
  const removals = useTyreRemovals(vehicleId);
  const rows = removals.data ?? [];
  if (removals.isPending || removals.error || !rows.length) return null;
  return (
    <FormSection title={t("history.title")} description={t("history.hint")} columns={1}>
      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">{t("history.when")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("cols.position")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("history.what")}</th>
              <th className="px-3 py-2 text-start font-semibold">{t("history.by")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 align-top">
                <td className="whitespace-nowrap px-3 py-1.5" dir="ltr">
                  {formatInCompanyTz(r.removedAt, zone, "dd-MM-yyyy HH:mm")}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs font-semibold" dir="ltr">
                  {r.position}
                  {r.tyre ? <span className="block font-normal text-muted-foreground">{r.tyre.serialNo}</span> : null}
                </td>
                <td className="px-3 py-1.5">
                  {t.has(`fate.options.${r.disposition}`) ? t(`fate.options.${r.disposition}`) : r.disposition}
                  {r.note ? <span className="block text-xs text-muted-foreground">{r.note}</span> : null}
                </td>
                <td className="px-3 py-1.5">{r.user?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FormSection>
  );
}
