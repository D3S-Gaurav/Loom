import { LoomMark } from "./MurmurMark";

export function LoomBrand({
  compact = false,
  tagline,
}: {
  compact?: boolean;
  tagline?: string;
}) {
  return (
    <div className={`loom-brand${compact ? " is-compact" : ""}`}>
      <LoomMark size={compact ? 34 : 42} />
      <div className="loom-brand-copy">
        <span className="loom-wordmark">Loom</span>
        {tagline ? <span className="loom-tagline">{tagline}</span> : null}
      </div>
    </div>
  );
}
