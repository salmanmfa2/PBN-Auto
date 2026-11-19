import { useState, useCallback, useRef } from "react";

interface UploadZoneProps {
  onFile: (file: File) => void;
  isUploading: boolean;
  progress: number;
  disabled?: boolean;
}

const ACCEPTED = ['.csv', '.xlsx', '.xls'];

export function UploadZone({ onFile, isUploading, progress, disabled = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (disabled) return;
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED.includes(ext)) {
        alert(`Unsupported file type. Please upload ${ACCEPTED.join(', ')}`);
        return;
      }
      onFile(file);
    },
    [disabled, onFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [disabled, handleFile]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  if (isUploading) {
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <div className="w-full bg-surface-700 rounded-full h-2">
          <div
            className="bg-brand-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-slate-400">Uploading… {progress}%</p>
      </div>
    );
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      aria-disabled={disabled}
      className={`flex flex-col items-center gap-3 p-6 border-2 border-dashed rounded-xl transition-all ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${
        isDragging
          ? 'border-brand-400 bg-brand-900/20'
          : 'border-surface-600 hover:border-surface-500 hover:bg-surface-700/30'
      }`}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
    >
      <div className="w-10 h-10 rounded-full bg-brand-900/40 flex items-center justify-center">
        <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-300">
          {disabled ? 'Upload requires Edit access' : 'Drop your file here'}
        </p>
        {!disabled && <p className="text-xs text-slate-500 mt-0.5">or click to browse</p>}
      </div>
      <div className="flex gap-1.5 flex-wrap justify-center">
        {ACCEPTED.map((ext) => (
          <span key={ext} className="badge bg-surface-700 text-slate-400">{ext}</span>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        disabled={disabled}
        onChange={onInputChange}
        className="hidden"
      />
    </div>
  );
}
