import { type HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'bg-[var(--bg-card)] border border-[var(--border-card)]',
          'rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
          interactive
            ? 'transition-shadow duration-150 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] active:shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-pointer'
            : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

export default Card;
