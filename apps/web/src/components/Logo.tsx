/**
 * Wakz mark: a rounded tile with a pulse line that reads as a "W" — the same shape is used by
 * the Android launcher icon so the identity matches everywhere.
 */
export function Logo({ size = 34, withWordmark = false }: { size?: number; withWordmark?: boolean }): React.JSX.Element {
  return (
    <span className="logo" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 48 48" role="img">
        <defs>
          <linearGradient id="wakzGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6d7cff" />
            <stop offset="55%" stopColor="#4aa8ff" />
            <stop offset="100%" stopColor="#3ddc97" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#wakzGradient)" />
        <path
          d="M11 30.5 L17 18 L23.5 28.5 L30 18 L36.5 30.5"
          fill="none"
          stroke="#07080d"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23.5" cy="28.5" r="2.1" fill="#07080d" />
      </svg>
      {withWordmark && <span className="logo-wordmark">Wakz</span>}
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
