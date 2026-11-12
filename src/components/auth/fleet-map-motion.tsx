"use client";

import { useTranslations } from "next-intl";

interface VehicleData {
  id: string;
  plate: string;
  status: "moving" | "stopped";
  speed?: string;
  location: string;
  time: string;
  haloColor: "cyan" | "green" | "red";
  top: string;
  left: string;
  rotation: number;
}

const VEHICLES: VehicleData[] = [
  {
    id: "v1",
    plate: "DXB A 12345",
    status: "moving",
    speed: "68 km/h",
    location: "Sheikh Zayed Rd",
    time: "10:24 AM",
    haloColor: "cyan",
    top: "45%",
    left: "40%",
    rotation: -30,
  },
  {
    id: "v2",
    plate: "DXB K 56789",
    status: "moving",
    speed: "42 km/h",
    location: "Deira",
    time: "10:24 AM",
    haloColor: "green",
    top: "17%",
    left: "82%",
    rotation: -55,
  },
  {
    id: "v3",
    plate: "DXB M 90120",
    status: "stopped",
    location: "Al Quoz",
    time: "09:48 AM",
    haloColor: "red",
    top: "62%",
    left: "47%",
    rotation: -30,
  },
  {
    id: "v4",
    plate: "DXB T 34567",
    status: "moving",
    speed: "74 km/h",
    location: "Al Khail Rd",
    time: "10:24 AM",
    haloColor: "green",
    top: "64%",
    left: "73%",
    rotation: -28,
  },
];

function TruckIcon({ rotation }: { rotation: number }) {
  return (
    <svg viewBox="0 0 48 48" className="size-11">
      <g transform={`translate(24,24) rotate(${rotation}) translate(-24,-24)`}>
        <ellipse cx="24" cy="32" rx="16" ry="8" fill="rgba(0,0,0,0.6)" />
        <rect x="13" y="16" width="22" height="22" rx="3" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M 15,16 L 18,7 C 19,5 29,5 30,7 L 33,16 Z" fill="#cbd5e1" />
        <path d="M 17,14 L 19,8 C 20,7 28,7 29,8 L 31,14 Z" fill="#0f172a" />
        <rect x="18" y="5" width="12" height="4" rx="1.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

function VanIcon({ rotation }: { rotation: number }) {
  return (
    <svg viewBox="0 0 48 48" className="size-11">
      <g transform={`translate(24,24) rotate(${rotation}) translate(-24,-24)`}>
        <ellipse cx="24" cy="30" rx="15" ry="7" fill="rgba(0,0,0,0.6)" />
        <rect x="15" y="11" width="18" height="26" rx="4.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M 17,16 C 17,13 31,13 31,16 L 31,19 L 17,19 Z" fill="#1e293b" />
        <line x1="18" y1="23" x2="30" y2="23" stroke="#cbd5e1" strokeWidth="1" />
        <line x1="18" y1="27" x2="30" y2="27" stroke="#cbd5e1" strokeWidth="1" />
      </g>
    </svg>
  );
}

function SedanIcon({ rotation }: { rotation: number }) {
  return (
    <svg viewBox="0 0 48 48" className="size-11">
      <g transform={`translate(24,24) rotate(${rotation}) translate(-24,-24)`}>
        <ellipse cx="24" cy="28" rx="14" ry="7" fill="rgba(0,0,0,0.6)" />
        <rect x="17" y="11" width="14" height="26" rx="4.5" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
        <path d="M 19,17 C 19,14 29,14 29,17 L 28,26 L 20,26 Z" fill="#0f172a" />
        <rect x="20" y="18" width="8" height="6.5" rx="1.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

const haloStyles: Record<"cyan" | "green" | "red", { ring: string; bg: string }> = {
  cyan: { ring: "border-cyan-400/80", bg: "bg-cyan-400/20" },
  green: { ring: "border-emerald-400/80", bg: "bg-emerald-400/20" },
  red: { ring: "border-red-500/90", bg: "bg-red-500/25" },
};

const cardBorderStyles: Record<"cyan" | "green" | "red", string> = {
  cyan: "border-sky-400/30",
  green: "border-sky-400/30",
  red: "border-red-500/40",
};

function VehicleMarker({ vehicle }: { vehicle: VehicleData }) {
  const t = useTranslations("auth.showcase");
  const halo = haloStyles[vehicle.haloColor];
  const cardBorder = cardBorderStyles[vehicle.haloColor];
  const isStopped = vehicle.status === "stopped";

  const icon =
    vehicle.id === "v1" || vehicle.id === "v4" ? (
      <TruckIcon rotation={vehicle.rotation} />
    ) : vehicle.id === "v3" ? (
      <SedanIcon rotation={vehicle.rotation} />
    ) : (
      <VanIcon rotation={vehicle.rotation} />
    );

  return (
    <div className="absolute z-20" style={{ top: vehicle.top, left: vehicle.left }}>
      {/* Static Radar Halo Ring */}
      <div className={`absolute -inset-6 rounded-full border ${halo.ring} ${halo.bg} pointer-events-none`} />

      {/* Vehicle Icon */}
      <div className="relative z-10 drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]">{icon}</div>

      {/* Telemetry Card */}
      <div
        className={`absolute left-10 -top-8 min-w-[145px] rounded-xl border ${cardBorder} bg-[#0a1925]/90 p-3 text-white backdrop-blur-md shadow-2xl`}
      >
        <div className="text-[13.5px] font-bold tracking-wider">{vehicle.plate}</div>
        {isStopped ? (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-red-400 font-semibold">
            <span className="size-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
            <span>{t("stopped")}</span>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span>
              {t("moving")}{" "}
              <strong className="text-white font-bold" dir="ltr">
                {vehicle.speed}
              </strong>
            </span>
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
          {/* Location pin */}
          <svg viewBox="0 0 24 24" className="size-3 stroke-current fill-none" strokeWidth="2">
            <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{vehicle.location}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
          {/* Clock */}
          <svg viewBox="0 0 24 24" className="size-3 stroke-current fill-none" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{vehicle.time}</span>
        </div>
      </div>
    </div>
  );
}

export function FleetMapMotion() {
  const t = useTranslations("auth.showcase");
  return (
    <div className="relative size-full overflow-hidden bg-[#06121c] select-none">
      {/* 1. Vector map layer: Dubai at night (coastline, Palm Jumeirah, Creek, SZR and landmarks) */}
      <svg
        className="absolute inset-0 size-full block object-cover"
        viewBox="0 0 1000 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <radialGradient id="mapVignetteNext" cx="55%" cy="45%" r="72%">
            <stop offset="0%" stopColor="#0c2333" stopOpacity="0.15" />
            <stop offset="78%" stopColor="#06121c" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#03090e" stopOpacity="1" />
          </radialGradient>
          <linearGradient id="gulfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#04182a" />
            <stop offset="100%" stopColor="#0a2c42" />
          </linearGradient>
          <linearGradient id="creekGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0e3a54" />
            <stop offset="100%" stopColor="#144b6e" />
          </linearGradient>
          <radialGradient id="khalifaGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </radialGradient>
          <filter id="neonGlowNext" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur1" />
            <feGaussianBlur stdDeviation="14" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Land */}
        <rect width="1000" height="900" fill="#081724" />

        {/* Arabian Gulf: the coast runs from the south-west (Marina) to the north-east (Deira) */}
        <path
          d="M -10,-10 L 1010,-10 L 1010,40 C 860,90 760,150 640,215 C 520,280 430,330 330,390 C 230,450 120,520 -10,600 Z"
          fill="url(#gulfGrad)"
        />
        <path
          d="M 1010,40 C 860,90 760,150 640,215 C 520,280 430,330 330,390 C 230,450 120,520 -10,600"
          fill="none"
          stroke="#22d3ee"
          strokeOpacity="0.35"
          strokeWidth="1.6"
        />
        <text x="250" y="110" fill="#3f6a88" fontSize="18" fontWeight="700" letterSpacing="6" opacity="0.7">
          ARABIAN GULF
        </text>

        {/* Palm Jumeirah: trunk to the shore, 16 fronds, and the crescent breakwater on the sea side */}
        <g transform="translate(215,330) rotate(-35)" strokeLinecap="round" fill="none">
          {/* Land masses (filled look: thick strokes in the island colour) */}
          <g stroke="#173d57">
            <path d="M 0,-30 L 0,150" strokeWidth="13" />
            {[-20, -2, 16, 34, 52, 70, 88, 106].map((y, k) => {
              const len = 72 - Math.abs(k - 3.5) * 6;
              return (
                <g key={y}>
                  <path d={`M 0,${y} L ${-len},${y - 26}`} strokeWidth="7" />
                  <path d={`M 0,${y} L ${len},${y - 26}`} strokeWidth="7" />
                </g>
              );
            })}
            <path d="M -112,-6 C -104,-92 104,-92 112,-6" strokeWidth="9" />
          </g>
          {/* Shoreline highlight */}
          <g stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="1">
            <path d="M 0,-30 L 0,150" />
            {[-20, -2, 16, 34, 52, 70, 88, 106].map((y, k) => {
              const len = 72 - Math.abs(k - 3.5) * 6;
              return (
                <g key={y}>
                  <path d={`M 0,${y} L ${-len},${y - 26}`} />
                  <path d={`M 0,${y} L ${len},${y - 26}`} />
                </g>
              );
            })}
            <path d="M -112,-6 C -104,-92 104,-92 112,-6" />
          </g>
          {/* Atlantis at the crescent's centre */}
          <circle cx="0" cy="-73" r="3" fill="#fde68a" stroke="none" />
        </g>
        <text x="80" y="262" fill="#7aa3c0" fontSize="13" fontWeight="700" opacity="0.85">
          Palm Jumeirah
        </text>

        {/* Dubai Creek, winding inland from the coast between Bur Dubai and Deira */}
        <path
          d="M 800,108 C 815,160 790,205 830,250 C 870,295 860,340 900,380 C 930,410 950,440 990,455"
          fill="none"
          stroke="url(#creekGrad)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M 800,108 C 815,160 790,205 830,250 C 870,295 860,340 900,380 C 930,410 950,440 990,455"
          fill="none"
          stroke="#38bdf8"
          strokeOpacity="0.3"
          strokeWidth="1.5"
          strokeDasharray="10 8"
        />

        {/* City blocks */}
        <g opacity="0.16" fill="#1e3a50">
          <rect x="80" y="610" width="150" height="110" rx="8" />
          <rect x="300" y="470" width="170" height="120" rx="8" />
          <rect x="520" y="380" width="160" height="150" rx="10" />
          <rect x="700" y="280" width="120" height="120" rx="8" />
          <rect x="860" y="150" width="130" height="120" rx="8" />
          <rect x="420" y="640" width="220" height="140" rx="10" />
          <rect x="700" y="520" width="240" height="170" rx="10" />
        </g>

        {/* Street grid, parallel and across the coast */}
        <g stroke="#142c3d" strokeWidth="1.1" opacity="0.7">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
            <line key={`p${k}`} x1={-60 + k * 30} y1={760 + k * 40} x2={1060 + k * 30} y2={200 + k * 40} />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => (
            <line key={`a${k}`} x1={80 + k * 95} y1={420 - k * 30} x2={330 + k * 95} y2={940 - k * 30} />
          ))}
        </g>

        {/* Highways */}
        <g strokeLinecap="round" fill="none">
          {/* Sheikh Zayed Road (E11), along the coast */}
          <path d="M -10,700 C 200,590 420,470 620,370 C 760,300 860,250 1010,190" stroke="#225475" strokeWidth="6" />
          <path
            d="M -10,700 C 200,590 420,470 620,370 C 760,300 860,250 1010,190"
            stroke="#facc15"
            strokeWidth="1.2"
            strokeDasharray="8 6"
            opacity="0.6"
          />
          {/* Al Khail Road (E44) */}
          <path d="M 120,900 C 330,760 560,640 760,540 C 870,485 940,450 1010,420" stroke="#225475" strokeWidth="4.5" />
          {/* Emirates Road (E611) */}
          <path d="M 520,910 C 680,820 820,760 1010,690" stroke="#225475" strokeWidth="4.5" />
          <path
            d="M 520,910 C 680,820 820,760 1010,690"
            stroke="#facc15"
            strokeWidth="1.1"
            strokeDasharray="8 6"
            opacity="0.5"
          />
        </g>

        {/* Road badges */}
        <g transform="translate(300, 528)">
          <rect width="28" height="15" rx="3" fill="#facc15" />
          <text x="14" y="11" fill="#0f172a" fontSize="8.5" fontWeight="800" textAnchor="middle">
            E 11
          </text>
        </g>
        <g transform="translate(335, 552) rotate(-27)">
          <text fill="#f1f5f9" fontSize="11" fontWeight="700" letterSpacing="1.2">
            Sheikh Zayed Rd
          </text>
        </g>
        <g transform="translate(560, 655)">
          <rect width="28" height="15" rx="3" fill="#facc15" />
          <text x="14" y="11" fill="#0f172a" fontSize="8.5" fontWeight="800" textAnchor="middle">
            E 44
          </text>
        </g>
        <g transform="translate(800, 742)">
          <rect width="32" height="15" rx="3" fill="#facc15" />
          <text x="16" y="11" fill="#0f172a" fontSize="8.5" fontWeight="800" textAnchor="middle">
            E 611
          </text>
        </g>

        {/* DXB airport runways */}
        <g transform="translate(905,300) rotate(-28)" opacity="0.75">
          <rect x="-70" y="-6" width="140" height="7" rx="2" fill="#1f4a66" />
          <rect x="-70" y="12" width="140" height="7" rx="2" fill="#1f4a66" />
          <line x1="-64" y1="-2.5" x2="64" y2="-2.5" stroke="#e2e8f0" strokeWidth="0.8" strokeDasharray="5 5" />
          <line x1="-64" y1="15.5" x2="64" y2="15.5" stroke="#e2e8f0" strokeWidth="0.8" strokeDasharray="5 5" />
        </g>

        {/* Area labels */}
        <g fill="#6488a4" fontSize="13" fontWeight="600" opacity="0.85">
          <text x="70" y="600">
            Dubai Marina
          </text>
          <text x="455" y="590">
            Al Quoz
          </text>
          <text x="865" y="140">
            Deira
          </text>
          <text x="760" y="235">
            Bur Dubai
          </text>
          <text x="878" y="352">
            DXB Airport
          </text>
          <text x="640" y="560">
            Al Khail
          </text>
          <text x="440" y="300">
            Jumeirah
          </text>
        </g>

        {/* Landmarks */}
        {/* Burj Al Arab: the sail on its island */}
        <g transform="translate(372,372)">
          <circle r="11" fill="#0f2f45" stroke="#38bdf8" strokeOpacity="0.6" />
          <path d="M -3,7 L -3,-22 C 9,-16 12,-2 6,7 Z" fill="#e0f2fe" opacity="0.9" />
          <text x="16" y="-14" fill="#cfe7f7" fontSize="11.5" fontWeight="700">
            Burj Al Arab
          </text>
        </g>
        {/* Burj Khalifa: the glowing spire in Downtown */}
        <g transform="translate(612,408)">
          <circle r="46" fill="url(#khalifaGlow)" />
          <path d="M -7,16 L -4,-6 L -2,-30 L 0,-58 L 2,-30 L 4,-6 L 7,16 Z" fill="#e0f2fe" />
          <circle r="2.5" cy="-58" fill="#67e8f9" />
          <text x="14" y="-34" fill="#e0f2fe" fontSize="14" fontWeight="800">
            Burj Khalifa
          </text>
          <text x="14" y="-19" fill="#7aa3c0" fontSize="11" fontWeight="600">
            Downtown · Dubai Mall
          </text>
        </g>
        {/* Museum of the Future: the torus beside SZR */}
        <g transform="translate(700,336)">
          <ellipse rx="10" ry="7" fill="none" stroke="#a5f3fc" strokeWidth="3" />
          <text x="-128" y="-12" fill="#cfe7f7" fontSize="11" fontWeight="700">
            Museum of the Future
          </text>
        </g>
        {/* Dubai Frame */}
        <g transform="translate(760,286)">
          <rect x="-7" y="-14" width="14" height="22" fill="none" stroke="#fbbf24" strokeWidth="2.5" />
          <text x="12" y="-6" fill="#fde68a" fontSize="11" fontWeight="700">
            Dubai Frame
          </text>
        </g>

        {/* City label */}
        <text x="560" y="610" fill="#547997" fontSize="22" fontWeight="800" letterSpacing="2" opacity="0.9">
          DUBAI
        </text>

        {/* Glowing GPS routes along Sheikh Zayed Road, Marina → Downtown → Creek */}
        <g fill="none" strokeLinecap="round">
          <path
            d="M 150,618 C 300,535 450,455 600,380 C 700,330 760,300 830,262"
            stroke="#22d3ee"
            strokeWidth="7"
            opacity="0.4"
            filter="url(#neonGlowNext)"
          />
          <path d="M 150,618 C 300,535 450,455 600,380 C 700,330 760,300 830,262" stroke="#06b6d4" strokeWidth="3" />
          <path
            d="M 600,380 C 620,450 640,520 700,560 C 760,600 830,590 900,560"
            stroke="#22d3ee"
            strokeWidth="6"
            opacity="0.4"
            filter="url(#neonGlowNext)"
          />
          <path d="M 600,380 C 620,450 640,520 700,560 C 760,600 830,590 900,560" stroke="#00f2fe" strokeWidth="2.6" />
          <g fill="#22d3ee" stroke="none" opacity="0.9">
            <polygon points="330,520 318,522 326,512" />
            <polygon points="520,421 508,423 516,413" />
            <polygon points="760,300 748,302 756,292" />
            <polygon points="660,540 650,532 662,530" />
          </g>
        </g>

        {/* Cinematic vignette */}
        <rect width="1000" height="900" fill="url(#mapVignetteNext)" pointerEvents="none" />
      </svg>

      {/* 2. STATIC VEHICLE MARKERS */}
      {VEHICLES.map((vehicle) => (
        <VehicleMarker key={vehicle.id} vehicle={vehicle} />
      ))}

      {/* 3. BOTTOM-LEFT GLASSMORPHIC FEATURE SHOWCASE CARD — STATIC */}
      <aside className="absolute bottom-7 left-7 z-30 max-w-[420px] rounded-[24px] border border-white/10 bg-[#091924]/80 p-7 text-white backdrop-blur-xl shadow-[0_25px_60px_rgba(0,0,0,0.65)]">
        <div className="text-[10.5px] font-extrabold tracking-[2.5px] text-sky-400 uppercase">{t("eyebrow")}</div>
        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold leading-[1.12] tracking-tight">
          <span className="block text-white">{t("headline1")}</span>
          <span className="block text-white">{t("headline2")}</span>
          <span className="block bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            {t("headline3")}
          </span>
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-slate-300">{t("intro")}</p>

        {/* 4 Feature Badges Grid */}
        <div className="mt-6 grid grid-cols-4 gap-2.5">
          {/* Live Tracking */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <svg
                viewBox="0 0 24 24"
                className="size-5 fill-none stroke-current"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
            </div>
            <span className="whitespace-pre-line text-[11px] font-semibold leading-tight text-slate-200">
              {t("liveTracking")}
            </span>
          </div>

          {/* Instant Alerts */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-purple-500/40 bg-purple-500/15 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
              <svg
                viewBox="0 0 24 24"
                className="size-5 fill-none stroke-current"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <span className="whitespace-pre-line text-[11px] font-semibold leading-tight text-slate-200">
              {t("alerts")}
            </span>
          </div>

          {/* Detailed Reports */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-sky-500/40 bg-sky-500/15 text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
              <svg
                viewBox="0 0 24 24"
                className="size-5 fill-none stroke-current"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <span className="whitespace-pre-line text-[11px] font-semibold leading-tight text-slate-200">
              {t("reports")}
            </span>
          </div>

          {/* Safe & Secure */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/15 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <svg
                viewBox="0 0 24 24"
                className="size-5 fill-none stroke-current"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <span className="whitespace-pre-line text-[11px] font-semibold leading-tight text-slate-200">
              {t("secure")}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
