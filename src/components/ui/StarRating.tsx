interface StarRatingProps {
  value: number | null;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md';
}

const sizeMap = {
  sm: 16,
  md: 22,
};

function StarIcon({
  filled,
  size,
}: {
  filled: boolean;
  size: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  );
}

export default function StarRating({
  value,
  onChange,
  size = 'md',
}: StarRatingProps) {
  const interactive = typeof onChange === 'function';
  const iconSize = sizeMap[size];
  const currentValue = value ?? 0;

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={`Rating: ${currentValue} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= currentValue;

        if (interactive) {
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              role="radio"
              aria-checked={star === currentValue}
              className={[
                'min-w-[44px] min-h-[44px] flex items-center justify-center',
                'rounded-full transition-colors duration-100',
                'hover:bg-[var(--bg-page)]',
                filled
                  ? 'text-amber-400'
                  : 'text-[var(--border-card)]',
              ].join(' ')}
            >
              <StarIcon filled={filled} size={iconSize} />
            </button>
          );
        }

        return (
          <span
            key={star}
            className={[
              'flex items-center justify-center',
              filled
                ? 'text-amber-400'
                : 'text-[var(--border-card)]',
            ].join(' ')}
          >
            <StarIcon filled={filled} size={iconSize} />
          </span>
        );
      })}
    </div>
  );
}
