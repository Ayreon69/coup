// Briques d'interface communes : boutons, fenêtres, sélecteurs, logo et bulles de réaction.
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cls } from '../lib/util';
import type { Emote } from '../store';
import { Seal } from './Art';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Coup">
      <Seal className="logo-seal" />
      <span className="logo-word">Coup</span>
    </div>
  );
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} disabled={disabled} className={cls('seg', o.value === value && 'is-on')} onClick={() => onChange(o.value)}>
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/** Une fenêtre : Échap ou un clic à côté la ferment, le focus y entre et revient d'où il venait. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => box.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open, onClose]);

  // Pas d'animation de sortie : une fenêtre fermée disparaît tout de suite, rien n'attend après elle.
  // Et rien ne commence invisible : même si le navigateur suspend les animations, la fenêtre se voit.
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <motion.div
        ref={box}
        tabIndex={-1}
        className={cls('modal', wide && 'is-wide')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 28 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </motion.div>
    </div>
  );
}

/** La dernière réaction d'un joueur, dans une bulle au-dessus de son siège. */
export function Bubble({ emotes, className }: { emotes: Emote[]; className?: string }) {
  const last = emotes[emotes.length - 1];
  return (
    <AnimatePresence>
      {last && (
        <motion.span key={last.id} className={cls('bubble', last.emoji.length > 3 && 'is-text', className)} initial={{ opacity: 0, y: 8, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} role="status">
          {last.emoji}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
