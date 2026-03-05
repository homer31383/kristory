import {
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Mount -> animate in, animate out -> unmount
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Wait a frame so the browser paints the initial state before transitioning
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      });
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  const handleTransitionEnd = useCallback(() => {
    if (!visible) {
      setMounted(false);
    }
  }, [visible]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      onTransitionEnd={handleTransitionEnd}
      className={[
        'fixed inset-0 z-50 flex items-end md:items-center justify-center',
        'bg-black/40 backdrop-blur-[4px]',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'bg-[var(--bg-card)] border border-[var(--border-card)]',
          'w-full md:max-w-lg md:mx-4',
          'rounded-t-[16px] md:rounded-[16px]',
          'shadow-[0_-4px_24px_rgba(0,0,0,0.12)] md:shadow-[0_8px_32px_rgba(0,0,0,0.12)]',
          'max-h-[85vh] overflow-y-auto overscroll-contain',
          'transition-transform duration-200 ease-out',
          // Mobile: slide up from bottom; Desktop: scale
          visible
            ? 'translate-y-0 md:translate-y-0 md:scale-100'
            : 'translate-y-full md:translate-y-4 md:scale-95',
        ].join(' ')}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-card)] px-5 pt-4 pb-3 flex items-center justify-between">
          {/* Drag indicator on mobile */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-9 h-1 rounded-full bg-[var(--border-card)] md:hidden" />

          {title && (
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-2 md:mt-0">
              {title}
            </h2>
          )}

          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-page)] transition-colors mt-1 md:mt-0"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M15 5L5 15M5 5l10 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
