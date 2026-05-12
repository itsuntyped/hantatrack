import { useEffect, useRef, type ReactNode } from "react";

// Reusable modal built on the native `<dialog>` element.
// Native dialog gives us free a11y (focus trapping, ESC handling, ::backdrop)
// without pulling in a modal library.

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function InfoModal({ open, onClose, title, children }: InfoModalProps) {
  // Ref to call the imperative `showModal()` / `close()` methods on the dialog.
  const ref = useRef<HTMLDialogElement | null>(null);

  // Sync the `open` prop to the dialog's imperative state.
  // We check `dialog.open` first so we don't double-call when already in sync.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // A click whose target is the dialog itself (and not any child element)
        // came from the ::backdrop pseudo-element, which is how we close it.
        if (e.target === ref.current) onClose();
      }}
      className="hanta-modal"
      aria-label={title}
    >
      {/* Sticky header with the title and a close button. */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-bg-muted px-5 py-3">
        <h2 className="text-base font-semibold text-fg-default">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg-default focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {/* Inline X icon — kept small to avoid pulling an icon library for one glyph. */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 3L13 13M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
      {/* Scrollable body so long legal text doesn't blow out the viewport. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-fg-default">
        {children}
      </div>
    </dialog>
  );
}
