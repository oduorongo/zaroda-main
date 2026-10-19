'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Slide-in navigation panel for phones. It is rendered straight into <body>, outside the app
// shell, because the shell (.zs-screen, h-screen + overflow-hidden) contains scrolling containers
// of its own: inside it, a touch drag could chain into the page behind the dim layer instead of
// scrolling the menu. The page behind is locked while the panel is open and the panel declares
// its own vertical touch scrolling.
export default function MobileDrawer({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="lg:hidden fixed inset-0 z-[110] no-print">
      <div className="absolute inset-0 bg-black/50" style={{ touchAction: 'none' }} onClick={onClose}/>
      <aside
        className="absolute top-0 bottom-0 left-0 w-72 max-w-[85vw] overflow-y-auto shadow-2xl"
        style={{
          background: 'var(--sidebar)',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="relative flex flex-col min-h-full">
          <button onClick={onClose} aria-label="Close menu"
            className="absolute top-4 right-4 z-10 text-white/50 hover:text-white">
            <X size={20}/>
          </button>
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
