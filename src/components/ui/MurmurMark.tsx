export function LoomMark({ size = 42, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`loom-mark ${className}`.trim()}
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#12101f" />
      <rect x="2.5" y="2.5" width="59" height="59" rx="15.5" stroke="#a78bfa" strokeOpacity=".34" />
      <path
        d="M13 43 22 20l10 23 10-23 9 23"
        fill="none"
        stroke="#a78bfa"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <circle cx="13" cy="43" r="3.1" fill="#67e8f9" />
      <circle cx="22" cy="20" r="3.1" fill="#c4b5fd" />
      <circle cx="32" cy="43" r="3.1" fill="#67e8f9" />
      <circle cx="42" cy="20" r="3.1" fill="#c4b5fd" />
      <circle cx="51" cy="43" r="3.1" fill="#67e8f9" />
    </svg>
  );
}
