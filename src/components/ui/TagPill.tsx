interface TagPillProps {
  emoji: string;
  label: string;
  className?: string;
  onClick?: () => void;
}

export default function TagPill({
  emoji,
  label,
  className = '',
  onClick,
}: TagPillProps) {
  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={[
        'inline-flex items-center gap-1 px-2.5 py-1',
        'bg-[var(--bg-page)] border border-[var(--border-card)]',
        'rounded-full text-xs font-medium text-[var(--text-secondary)]',
        'whitespace-nowrap select-none',
        onClick
          ? 'cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors min-h-[32px]'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="text-sm leading-none" aria-hidden="true">
        {emoji}
      </span>
      <span>{label}</span>
    </Component>
  );
}
