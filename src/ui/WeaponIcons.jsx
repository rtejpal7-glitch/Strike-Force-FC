// Weapon silhouettes for the HUD (simple inline SVG, no assets needed).

const paths = {
  pistol: 'M6 14h34l2-3h6v6h-4l-2 2H24l-3 13h-9l3-13H6z',
  shotgun: 'M2 15h56v3H40l-2 3H30l-2-2H22l-6 8H6l6-9H2z M30 19h8',
  rifle: 'M2 14h10v-2h30v2h16v3H44v2h-6l-2 10h-6l1-10h-6l-4 6h-5l2-6H12l-4 6H2z',
  sniper: 'M0 15h62v2H44l-2 2H30l-3 6h-6l2-6H14l-6 6H2l3-6H0z M20 9h18v4H20z',
};

export function WeaponIcon({ id, size = 64 }) {
  return (
    <svg viewBox="0 0 64 32" width={size} height={size / 2} aria-hidden="true">
      <path d={paths[id]} fill="currentColor" fillRule="evenodd" stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />
    </svg>
  );
}
