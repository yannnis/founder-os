import { BANDS, type Band } from "@/lib/slop/worth";

export const COLORS: Record<Band["id"], string> = {
  back: "#1f6b45",
  decent: "#3e8f62",
  mid: "#c4922a",
  slop: "#d86a3a",
  over: "#c23b2e",
};

function point(pct: number, radius: number): [number, number] {
  const angle = Math.PI * (1 - pct / 100);
  const x = Math.round((100 + radius * Math.cos(angle)) * 10) / 10;
  const y = Math.round((108 - radius * Math.sin(angle)) * 10) / 10;
  return [x, y];
}

function wedge(start: number, end: number): string {
  const outer = 84;
  const inner = 62;
  const [x0, y0] = point(start, outer);
  const [x1, y1] = point(end, outer);
  const [ix1, iy1] = point(end, inner);
  const [ix0, iy0] = point(start, inner);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 0 1 ${x1} ${y1} L ${ix1} ${iy1} A ${inner} ${inner} 0 0 0 ${ix0} ${iy0} Z`;
}

export function SlopDial({
  score,
  band,
  judged,
  total,
  pending,
  read,
  skim,
  pass,
  compact,
  mini,
}: {
  score: number | null;
  band: Band | null;
  judged: number;
  total: number;
  pending: number;
  read: number;
  skim: number;
  pass: number;
  compact?: boolean;
  mini?: boolean;
}) {
  const shown = score === null ? null : Math.round(score);
  const armed = judged > 0 || shown !== null;
  const turn = armed ? -90 + ((shown ?? 0) / 100) * 180 : 0;
  const hub = band ? COLORS[band.id] : "#8a8175";

  return (
    <figure className="m-0">
      <svg viewBox="0 0 200 118" className={mini ? "w-16" : compact ? "mx-auto w-36" : "w-full"} role="img" aria-label={band ? `${shown} percent. ${band.label}` : "No score yet"}>
        {BANDS.map((item) => (
          <path
            key={item.id}
            d={wedge(item.min + 0.7, item.max - 0.5)}
            fill={COLORS[item.id]}
            opacity={!band || band.id === item.id ? 1 : 0.28}
          />
        ))}
        <g
          className="worth-needle"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center bottom",
            transform: `rotate(${turn}deg)`,
            transition: "transform 1.15s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <line x1="100" y1="108" x2="100" y2="28" stroke="#1c1915" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="108" r="5.5" fill={hub} />
        <circle cx="100" cy="108" r="2.2" fill="#f6f1e6" />
      </svg>
      {!mini && (
      <figcaption className="-mt-3 text-center">
        <p className={`font-heading leading-none tracking-tight tabular-nums ${compact ? "text-5xl" : "text-7xl"}`} style={{ color: hub }}>
          {shown === null ? "—" : shown}
        </p>
        <p className={`font-heading italic ${compact ? "mt-1 text-base" : "mt-1 text-xl"}`}>{band ? band.label : "Waiting on the first post"}</p>
        {!compact && (
          <p className="mt-1 text-xs tracking-wide text-[#6f685e]">
            {judged} of {total} scored
            {pending > 0 ? ` · ${pending} still in flight` : ""}
          </p>
        )}
        {!compact && (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-left">
          <Count label="Read" value={read} tone="#145236" />
          <Count label="Skim" value={skim} tone="#6d4708" />
          <Count label="Skip" value={pass} tone="#8d2a16" />
        </dl>
        )}
      </figcaption>
      )}
    </figure>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-[#f6f1e6] px-2 py-2 text-center">
      <dt className="text-[10px] tracking-[0.14em] text-[#6f685e] uppercase">{label}</dt>
      <dd className="font-heading text-2xl leading-none" style={{ color: tone }}>
        {value}
      </dd>
    </div>
  );
}
