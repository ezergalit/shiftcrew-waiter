// Aurora progress ring (design concept 2026-08): a ring reads as "how much of this is
// mine" at a glance, where a bar reads as a loading state. Shared by the learn tab's
// main page and the menu's front door.
export default function Ring({ pct, size = 46 }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#20302a" strokeWidth="5.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#22C08C"
        strokeWidth="5.5" strokeLinecap="round" strokeDasharray={`${Math.max(0.001, (pct / 100) * c)} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="central" fill="#eef0f6" fontSize="11.5" fontWeight="800">{pct}%</text>
    </svg>
  );
}
