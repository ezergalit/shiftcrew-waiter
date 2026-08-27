// The concept's progress ring, one spec for every use (crewmenu-menu-page.html §8):
// r=18 ⇒ circumference 113, stroke 4, rotated -90° so the fill starts at the top.
// Kept at a single size on purpose — scaling the SVG box stretched the stroke off-spec
// while the label stayed put (caught in the 27.8 design audit).
export default function Ring({ pct }) {
  return (
    <span className="miniring">
      <svg width="46" height="46">
        <circle className="track" cx="23" cy="23" r="18" />
        <circle className="fill" cx="23" cy="23" r="18" strokeDasharray="113" strokeDashoffset={113 * (1 - (pct || 0) / 100)} />
      </svg>
      <b className="num tabular-nums">{pct || 0}%</b>
    </span>
  );
}
