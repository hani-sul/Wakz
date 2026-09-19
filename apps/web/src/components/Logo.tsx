/**
 * Wakz mark — a bold "W" monogram cut out of a gradient tile.
 *
 * Clean geometry (two joined V strokes with rounded joins) so it stays readable at 16 px in the
 * status bar, in the app header and as the Android launcher icon. The same paths are used by the
 * Android vector drawable, so the identity matches everywhere.
 */
export function Logo({ size = 34, withWordmark = false }: { size?: number; withWordmark?: boolean }): React.JSX.Element {
  return (
    <span className="logo" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 48 48" role="img">
        <defs>
          <linearGradient id="wakzTile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7C8CFF" />
            <stop offset="48%" stopColor="#4AA8FF" />
            <stop offset="100%" stopColor="#2FD79B" />
          </linearGradient>
          <radialGradient id="wakzGlow" cx="0.28" cy="0.2" r="0.85">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="2.5" y="2.5" width="43" height="43" rx="13.5" fill="url(#wakzTile)" />
        <rect x="2.5" y="2.5" width="43" height="43" rx="13.5" fill="url(#wakzGlow)" />
        <path
          d="M13 16.5 L19.5 33 L24 21.5 L28.5 33 L35 16.5"
          fill="none"
          stroke="#080A12"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="21.5" r="1.7" fill="#2FD79B" />
      </svg>
      {withWordmark && <span className="logo-wordmark">وكز - Wakz</span>}
    </span>
  );
}

export function XLogo({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.53 3h3.02l-6.6 7.54L21.9 21h-5.9l-4.16-5.44L7.06 21H4.04l6.86-7.84L2.4 3h6.05l3.9 5.15L17.53 3Zm-1.06 16.2h1.67L7.62 4.72H5.83L16.47 19.2Z"
      />
    </svg>
  );
}
