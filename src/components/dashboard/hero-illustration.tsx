import { SCENE_HEIGHT, SCENE_WIDTH, ground, objects, pin, route, truck, type Tone } from "./hero-scene";

/** Theme-aware fills. The truck stays white in both themes, like a real vehicle under streetlights. */
const FILL: Record<Tone, string> = {
  street: "var(--surface)",
  roofA: "var(--surface)",
  roofB: "var(--primary-soft)",
  wallLight: "color-mix(in oklab, var(--surface-3) 88%, var(--fg))",
  wallDark: "color-mix(in oklab, var(--surface-3) 74%, var(--fg))",
  asphalt: "#3a4148",
  verge: "var(--border-strong)",
  truckTop: "#ffffff",
  truckSide: "#e7ecef",
  truckBack: "#cdd5da",
  cabTop: "#f7f9fa",
  cabSide: "#eef2f4",
  cabFront: "#d9e1e6",
  glass: "#22303a",
  tyre: "#1b2026",
  chassis: "#4b5560",
  light: "#a5f3fc",
};

/* Fades every edge into the page so the scene floats instead of sitting in a box. */
const EDGE_FADE = {
  maskImage:
    "linear-gradient(to right, transparent 0%, black 24%, black 88%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 14%, black 78%, transparent 100%)",
  WebkitMaskImage:
    "linear-gradient(to right, transparent 0%, black 24%, black 88%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 14%, black 78%, transparent 100%)",
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
} as const;

/** Isometric city scene for the dashboard hero: highway, truck, route and pin. Decorative only. */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
      focusable="false"
      style={EDGE_FADE}
    >
      <defs>
        <radialGradient id="hero-ground" cx="40%" cy="55%" r="75%">
          <stop offset="0" stopColor="var(--surface-2)" />
          <stop offset="1" stopColor="var(--surface-3)" />
        </radialGradient>
        <linearGradient id="hero-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#67e8f9" stopOpacity="0.55" />
          <stop offset="1" stopColor="#67e8f9" stopOpacity="0" />
        </linearGradient>
        <filter id="hero-blur-sm" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="hero-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="url(#hero-ground)" />

      {/* Streets and highway */}
      {ground.streets.map((d) => (
        <path key={d} d={d} fill={FILL.street} />
      ))}
      <path d={ground.verge} fill={FILL.verge} />
      <path d={ground.road} fill={FILL.asphalt} />
      {ground.edgeLines.map((d) => (
        <path key={d} d={d} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.4" fill="none" />
      ))}
      <path d={ground.centerLine} stroke="#f5c84b" strokeWidth="2" strokeDasharray="14 12" fill="none" />

      {/* Light and shadow on the asphalt */}
      <path d={truck.shadow} fill="#000" opacity="0.32" filter="url(#hero-blur-sm)" />
      <path d={truck.headlightBeam} fill="url(#hero-beam)" filter="url(#hero-blur-sm)" />

      {/* Route trail */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={route} stroke="#2dd4bf" strokeWidth="12" opacity="0.4" filter="url(#hero-blur)" />
        <path d={route} stroke="#14b8a6" strokeWidth="3.5" />
        <path d={route} stroke="#ccfbf1" strokeWidth="2" strokeDasharray="5 18" className="animate-route" />
      </g>

      {/* Buildings and truck, back to front */}
      {objects.map((s, i) => (
        <path key={i} d={s.d} fill={FILL[s.tone]} />
      ))}

      {/* Destination pin */}
      <g transform={`translate(${pin.x.toFixed(1)} ${pin.y.toFixed(1)})`}>
        <ellipse rx="11" ry="5.5" fill="#0f766e" opacity="0.25" />
        <ellipse
          rx="8"
          ry="4"
          fill="none"
          stroke="#14b8a6"
          strokeWidth="2"
          className="animate-ping-soft"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <g className="animate-float" style={{ animationDuration: "3s" }}>
          <path d="M0 -4 C-3 -10 -12 -15 -12 -26 A12 12 0 0 1 12 -26 C12 -15 3 -10 0 -4Z" fill="#0d9488" />
          <circle cy="-26" r="4.8" fill="#ffffff" />
        </g>
      </g>
    </svg>
  );
}
