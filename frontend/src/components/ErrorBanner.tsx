
interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-rose-900/40 border border-rose-700/50 rounded-xl text-sm text-rose-300">
      <svg className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-rose-400 hover:text-rose-200 shrink-0">✕</button>
    </div>
  );
}
