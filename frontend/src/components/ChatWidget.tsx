import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendChatMessage } from '../services/api';
import type { ChatMessage } from '../types';

type ChatWidgetProps = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export function ChatWidget({ isOpen, onOpen, onClose }: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight });
  }, [messages, isSending, isOpen]);

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;

    const userMessage: ChatMessage = { role: 'user', content };
    const conversation = [...messages, userMessage].slice(-20);
    setMessages(conversation);
    setDraft('');
    setError(null);
    setIsSending(true);
    const requestId = ++requestIdRef.current;
    try {
      const response = await sendChatMessage(conversation);
      if (requestId !== requestIdRef.current) return;
      const assistantMessage: ChatMessage = { role: 'assistant', content: response.message };
      setMessages((current): ChatMessage[] => [
        ...current,
        assistantMessage,
      ].slice(-20));
    } catch (sendError) {
      if (requestId !== requestIdRef.current) return;
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      if (requestId === requestIdRef.current) setIsSending(false);
    }
  };

  const clearChat = () => {
    requestIdRef.current += 1;
    setMessages([]);
    setDraft('');
    setError(null);
    setIsSending(false);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[55] flex flex-col items-end gap-3">
      {isOpen && (
        <section
          className="flex h-[min(34rem,calc(100vh-6rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          aria-label="PBN Auto chat assistant"
        >
          <header className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">PBN Auto Assistant</h2>
              <p className="mt-0.5 text-[10px] text-slate-400">AI responses powered by Groq</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                disabled={messages.length === 0 && !draft && !error && !isSending}
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Clear chat conversation"
                title="Clear chat"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
          </header>

          <div
            ref={conversationRef}
            className="flex-1 space-y-3 overflow-y-auto p-3"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.length === 0 && (
              <p className="rounded-xl bg-slate-800/80 p-3 text-xs leading-relaxed text-slate-300">
                Ask me about using PBN Auto. Messages and conversation context are sent to Groq to generate replies.
                Do not share passwords or sensitive personal data.
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`max-w-[95%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'ml-auto bg-sky-600 text-white'
                    : 'mr-auto bg-slate-800 text-slate-100'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="chat-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="my-2 max-w-full overflow-x-auto">
                            <table>{children}</table>
                          </div>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                )}
              </div>
            ))}
            {isSending && <p className="text-xs text-slate-400">Thinking…</p>}
            {error && (
              <p role="alert" className="rounded-lg border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
                {error}
              </p>
            )}
          </div>

          <form onSubmit={(event) => void submitMessage(event)} className="border-t border-slate-700 p-3">
            <label htmlFor="assistant-chat-input" className="sr-only">Message the assistant</label>
            <div className="flex items-end gap-2">
              <textarea
                id="assistant-chat-input"
                rows={2}
                maxLength={4000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask a question…"
                className="min-h-10 flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isSending}
                className="h-10 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Enter to send · Shift+Enter for new line</p>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={isOpen ? onClose : onOpen}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/30 bg-sky-600 text-white shadow-lg transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-950"
        aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
        aria-expanded={isOpen}
        title="PBN Auto AI chat"
      >
        {isOpen ? (
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 8h10M7 12h6m-8 8l2.5-3H18a3 3 0 003-3V6a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3h1" />
          </svg>
        )}
      </button>
    </div>
  );
}
