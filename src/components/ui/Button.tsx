import { type ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-hover)]',
  secondary:
    'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-card)] hover:border-[var(--accent)] active:border-[var(--accent)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-card)] active:bg-[var(--bg-card)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[44px] px-3 py-1.5 text-sm gap-1.5',
  md: 'min-h-[44px] px-4 py-2 text-sm gap-2',
  lg: 'min-h-[48px] px-6 py-3 text-base gap-2.5',
};

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      children,
      className = '',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-medium',
          'rounded-[8px] transition-colors duration-150',
          'select-none cursor-pointer',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
          variantClasses[variant],
          sizeClasses[size],
          isDisabled ? 'opacity-50 pointer-events-none' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {loading && <Spinner className="shrink-0" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
