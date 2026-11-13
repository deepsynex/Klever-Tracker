import type { LiveStatus } from "@/lib/live/status";
import { cn } from "@/lib/utils";

/**
 * The live map's vehicle pieces, shared by the Google and OpenStreetMap maps: a top-down car in
 * its status colour (turned to its heading), its plate label, and the numbered bubble for a group
 * of nearby vehicles with a ring showing their status mix.
 */

export type { LiveStatus };

/** Body colour per status (green moving, yellow idle, red stopped, grey offline), with a darker outline. */
export const STATUS_COLOURS: Record<LiveStatus, { body: string; edge: string }> = {
  moving: { body: "#22c55e", edge: "#15803d" },
  idle: { body: "#facc15", edge: "#a16207" },
  stopped: { body: "#ef4444", edge: "#b91c1c" },
  offline: { body: "#9ca3af", edge: "#4b5563" },
};

/** A car seen from above, pointing up (north) before rotation. */
export function CarTopDown({ status, heading, className }: { status: LiveStatus; heading: number | null; className?: string }) {
  const { body, edge } = STATUS_COLOURS[status];
  return (
    <svg
      viewBox="0 0 24 44"
      className={cn("h-10 w-[22px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] transition-transform duration-500", className)}
      style={{ transform: `rotate(${heading ?? 0}deg)` }}
      aria-hidden
    >
      {/* wheels */}
      <rect x="0.5" y="8" width="3" height="7" rx="1.2" fill="#1f2937" />
      <rect x="20.5" y="8" width="3" height="7" rx="1.2" fill="#1f2937" />
      <rect x="0.5" y="29" width="3" height="7" rx="1.2" fill="#1f2937" />
      <rect x="20.5" y="29" width="3" height="7" rx="1.2" fill="#1f2937" />
      {/* body */}
      <path d="M12 1.5c5.6 0 8.6 2.6 9 7.4l.6 25.4c.1 5.2-3.2 8.2-9.6 8.2s-9.7-3-9.6-8.2L3 8.9c.4-4.8 3.4-7.4 9-7.4Z" fill={body} stroke={edge} strokeWidth="1.2" />
      {/* headlights */}
      <rect x="5" y="2.8" width="3.4" height="1.6" rx=".8" fill="#fef9c3" />
      <rect x="15.6" y="2.8" width="3.4" height="1.6" rx=".8" fill="#fef9c3" />
      {/* windscreen, roof, rear window */}
      <path d="M5.4 12.5c1.6-1.6 3.8-2.4 6.6-2.4s5 .8 6.6 2.4l-1.1 4.2c-1.6-.6-3.4-.9-5.5-.9s-3.9.3-5.5.9Z" fill="#1e293b" opacity=".85" />
      <rect x="6.6" y="17.6" width="10.8" height="11.5" rx="2.2" fill={body} stroke={edge} strokeOpacity=".45" strokeWidth=".8" />
      <path d="M6.3 30.8c1.6.7 3.5 1 5.7 1s4.1-.3 5.7-1l.9 3.6c-1.8 1-4 1.5-6.6 1.5s-4.8-.5-6.6-1.5Z" fill="#1e293b" opacity=".75" />
      {/* mirrors */}
      <path d="M3.2 13.4 1.4 14.6M20.8 13.4l1.8 1.2" stroke={edge} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** The plate shown above every vehicle, like the reference fleet map. */
export function PlateTag({ plate, selected }: { plate: string; selected?: boolean }) {
  return (
    <span
      dir="ltr"
      className={cn(
        "pointer-events-none block w-max max-w-40 truncate rounded-[4px] border px-1.5 py-px text-[11px] leading-4 font-bold shadow-sm",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-black/15 bg-white text-[#111827]",
      )}
    >
      {plate}
    </span>
  );
}

/**
 * A group of nearby vehicles: white disc with the count, ringed by one arc per status, sized by
 * how many vehicles it holds.
 */
export function ClusterBubble({ counts, label }: { counts: Record<LiveStatus, number>; label: string }) {
  const total = counts.moving + counts.idle + counts.stopped + counts.offline;
  const size = total >= 50 ? 52 : total >= 10 ? 46 : 40;
  const r = 15;
  const circumference = 2 * Math.PI * r;
  const arcs = (["moving", "idle", "stopped", "offline"] as const)
    .filter((s) => counts[s] > 0)
    .reduce<Array<{ status: LiveStatus; length: number; offset: number }>>((list, status) => {
      const offset = list.reduce((sum, a) => sum + a.length, 0);
      return [...list, { status, length: (counts[status] / total) * circumference, offset }];
    }, []);
  return (
    <span className="grid cursor-pointer place-items-center transition-transform hover:scale-110" style={{ width: size, height: size }} title={label} aria-label={label}>
      <svg viewBox="0 0 36 36" className="size-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" aria-hidden>
        <circle cx="18" cy="18" r="17" fill="#fff" />
        {arcs.map((a) => (
          <circle
            key={a.status}
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke={STATUS_COLOURS[a.status].body}
            strokeWidth="3.6"
            strokeDasharray={`${a.length} ${circumference - a.length}`}
            strokeDashoffset={-a.offset}
            transform="rotate(-90 18 18)"
          />
        ))}
        <text x="18" y="18" textAnchor="middle" dominantBaseline="central" fontSize={total >= 100 ? 10 : 12} fontWeight="700" fill="#111827" fontFamily="inherit">
          {total}
        </text>
      </svg>
    </span>
  );
}
