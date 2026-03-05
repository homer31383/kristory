interface SkeletonProps {
  variant?: 'text' | 'card' | 'photo';
  /** Number of lines for the text variant */
  lines?: number;
  className?: string;
}

function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={[
        'bg-[var(--border-card)] rounded-[6px] animate-pulse',
        className,
      ].join(' ')}
    />
  );
}

export default function Skeleton({
  variant = 'text',
  lines = 3,
  className = '',
}: SkeletonProps) {
  if (variant === 'photo') {
    return (
      <div className={`aspect-square ${className}`}>
        <ShimmerBlock className="w-full h-full rounded-[12px]" />
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={[
          'bg-[var(--bg-card)] border border-[var(--border-card)]',
          'rounded-[12px] p-4 space-y-3',
          className,
        ].join(' ')}
      >
        <ShimmerBlock className="h-4 w-2/5" />
        <ShimmerBlock className="h-3 w-full" />
        <ShimmerBlock className="h-3 w-4/5" />
        <ShimmerBlock className="h-3 w-3/5" />
      </div>
    );
  }

  // Text variant
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => {
        // Vary widths to look natural
        const widths = ['w-full', 'w-4/5', 'w-3/5', 'w-11/12', 'w-2/3'];
        const w = widths[i % widths.length];
        return <ShimmerBlock key={i} className={`h-3.5 ${w}`} />;
      })}
    </div>
  );
}
