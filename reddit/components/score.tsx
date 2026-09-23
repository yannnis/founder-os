import { BAND_COLOR, LEAD_BANDS, bandFor, leadScore, type LeadBand } from "../lib/score";

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

export function LeadScore({
  leads,
  relevant,
  noise,
  judged,
  total,
  pending,
}: {
  leads: number;
  relevant: number;
  noise: number;
  judged: number;
  total: number;
  pending: number;
}) {
  const score = leadScore(leads, judged);
  const band: LeadBand | null = score === null ? null : bandFor(score);
  const tone = band ? BAND_COLOR[band.id] : "#8a8175";
  const turn = score === null ? 0 : -90 + (score / 100) * 180;

  return (
    <section className="panel score">
      <p className="eyebrow">The score</p>
      <figure className="dial">
        <svg viewBox="0 0 200 118" role="img" aria-label={band ? `${leads} leads. ${band.label}` : "No score yet"}>
          {LEAD_BANDS.map((item) => (
            <path key={item.id} d={wedge(item.min + 0.6, item.max - 0.4)} fill={BAND_COLOR[item.id]} opacity={!band || band.id === item.id ? 1 : 0.28} />
          ))}
          <g className="needle" style={{ transform: `rotate(${turn}deg)` }}>
            <line x1="100" y1="108" x2="100" y2="28" stroke="#1c1915" strokeWidth="2.4" strokeLinecap="round" />
          </g>
          <circle cx="100" cy="108" r="5.5" fill={tone} />
          <circle cx="100" cy="108" r="2.2" fill="#f6f1e6" />
        </svg>
        <figcaption>
          <p className="score-num" style={{ color: tone }}>
            {leads}
          </p>
          <p className="score-label">{band ? band.label : "Waiting on the first post"}</p>
          <p className="score-meta">
            {leads} {leads === 1 ? "lead" : "leads"} in {total} {total === 1 ? "post" : "posts"}
            {pending > 0 ? ` · ${pending} still reading` : judged > 0 ? ` · ${judged} scored` : ""}
          </p>
          <dl className="score-counts">
            <Count label="Lead" value={leads} tone="#145236" />
            <Count label="Relevant" value={relevant} tone="#6d4708" />
            <Count label="Noise" value={noise} tone="#8d2a16" />
          </dl>
          <p className="score-note">One lead in every ten posts is worth staying.</p>
        </figcaption>
      </figure>
    </section>
  );
}

export function JevSummary({
  lines,
  pills,
  reading,
}: {
  lines: string[];
  pills: Array<{ label: string; tone: "good" | "mid" | "bad" }>;
  reading?: string;
}) {
  return (
    <section className="panel jev">
      <p className="eyebrow">Jev</p>
      <div className="jev-log">
        {reading ? (
          <p className="jev-reading">
            <span className="dot pulse" />
            {reading}
          </p>
        ) : null}
        {lines.map((line) => (
          <p key={line} className="jev-line">
            <span>Jev:</span> {line}
          </p>
        ))}
        {pills.length > 0 ? (
          <ul className="jev-pills">
            {pills.map((pill) => (
              <li key={pill.label} data-tone={pill.tone}>
                {pill.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd style={{ color: tone }}>{value}</dd>
    </div>
  );
}
