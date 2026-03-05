import {
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const currentTranslateY = useRef(0);

  // Mount -> animate in, animate out -> unmount
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
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

  // Drag-to-dismiss handlers
  const handleDragStart = (clientY: number) => {
    dragStartY.current = clientY;
    currentTranslateY.current = 0;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  };

  const handleDragMove = (clientY: number) => {
    if (dragStartY.current === null) return;
    const deltaY = clientY - dragStartY.current;
    // Only allow dragging downward
    const translate = Math.max(0, deltaY);
    currentTranslateY.current = translate;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${translate}px)`;
    }
  };

  const handleDragEnd = () => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;

    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
    }

    // If dragged more than 100px or 30% of sheet height, close
    const threshold = sheetRef.current
      ? Math.min(100, sheetRef.current.offsetHeight * 0.3)
      : 100;

    if (currentTranslateY.current > threshold) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }

    currentTranslateY.current = 0;
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Mouse events for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    handleDragStart(e.clientY);
    const onMouseMove = (ev: MouseEvent) => handleDragMove(ev.clientY);
    const onMouseUp = () => {
      handleDragEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  if (!mounted) return null;

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      onTransitionEnd={handleTransitionEnd}
      className={[
        'fixed inset-0 z-50 flex items-end justify-center',
        'bg-black/40 backdrop-blur-[4px]',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'bg-[var(--bg-card)] border border-[var(--border-card)] border-b-0',
          'w-full max-w-lg',
          'rounded-t-[16px]',
          'shadow-[0_-4px_24px_rgba(0,0,0,0.12)]',
          'max-h-[85vh] overflow-y-auto overscroll-contain',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="w-9 h-1 rounded-full bg-[var(--text-muted)]" />
        </div>

        {/* Header */}
        {title && (
          <div className="px-5 pt-1 pb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-page)] transition-colors"
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
        )}

        {/* Body */}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
