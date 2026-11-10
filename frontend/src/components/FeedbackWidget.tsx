import { useEffect, useState, type FormEvent } from 'react';
import { submitUserFeedback } from '../services/api';
import { FEEDBACK_MENU_OPTIONS, type FeedbackMenu } from '../types';

type FeedbackWidgetProps = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export function FeedbackWidget({ isOpen, onOpen, onClose }: FeedbackWidgetProps) {
  const [menu, setMenu] = useState<FeedbackMenu | ''>('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = feedback.trim();
    if (!menu || !message || isSubmitting) return;

    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      await submitUserFeedback({ menu, feedback: message });
      setFeedback('');
      setNotice('Terima kasih, feedback berhasil dikirim ke Admin.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-16 z-[55] flex flex-col items-end gap-3">
      {isOpen && (
        <section
          className="w-[min(21rem,calc(100vw-5rem))] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          role="dialog"
          aria-labelledby="feedback-widget-title"
        >
          <header className="flex items-start justify-between border-b border-slate-700 px-4 py-3">
            <div>
              <h2 id="feedback-widget-title" className="text-sm font-semibold text-slate-100">
                Kirim Feedback
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">Masukan akan dibaca oleh Admin.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
              aria-label="Tutup feedback"
            >
              ×
            </button>
          </header>

          <form onSubmit={(event) => void submitFeedback(event)} className="space-y-3 p-4">
            <label htmlFor="feedback-menu" className="block text-xs font-medium text-slate-300">
              Menu
              <select
                id="feedback-menu"
                required
                value={menu}
                onChange={(event) => {
                  setMenu(event.target.value as FeedbackMenu | '');
                  setError(null);
                  setNotice(null);
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">Pilih menu</option>
                {FEEDBACK_MENU_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label htmlFor="feedback-message" className="block text-xs font-medium text-slate-300">
              Feedback
              <textarea
                id="feedback-message"
                required
                minLength={1}
                maxLength={5000}
                rows={4}
                value={feedback}
                onChange={(event) => {
                  setFeedback(event.target.value);
                  setError(null);
                  setNotice(null);
                }}
                placeholder="Tuliskan masukan atau masalah yang ditemui…"
                className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={!menu || !feedback.trim() || isSubmitting}
              className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Mengirim…' : 'Kirim Feedback'}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={isOpen ? onClose : onOpen}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-700 text-white shadow-lg transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-950"
        aria-label={isOpen ? 'Tutup feedback' : 'Kirim feedback'}
        aria-expanded={isOpen}
        title="Kirim feedback"
      >
        {isOpen ? (
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
