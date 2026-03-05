import { type ReactNode } from 'react';
import Button from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      {icon && (
        <div className="mb-4 text-[var(--text-muted)] text-4xl leading-none">
          {icon}
        </div>
      )}

      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-[var(--text-secondary)] max-w-[280px] leading-relaxed mb-5">
          {description}
        </p>
      )}

      {action && (
        <Button variant="primary" size="md" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
