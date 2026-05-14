'use client';

import { useRef, useState, useCallback } from 'react';
import { IconArrowRight, IconLoader2, IconUpload, IconFileText, IconX } from '@tabler/icons-react';
import { EXAMPLE_STRATEGIES } from '@/lib/mockStrategy';
import styles from './EnglishInputCard.module.css';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onParse: () => void;
  isParsing: boolean;
  isLocked?: boolean;
}

const CHAR_SOFT_CAP = 5000;
const ACCEPTED      = '.pdf,.docx,.txt';

export default function EnglishInputCard({ value, onChange, onParse, isParsing, isLocked }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const canParse  = value.trim().length >= 20 && !isParsing && !isLocked && !extracting;
  const charCount = value.length;
  const overCap   = charCount > CHAR_SOFT_CAP;

  const handleExampleClick = (text: string) => {
    if (value.trim().length > 0 && value !== text) {
      if (!confirm('Replace current input with this example?')) return;
    }
    onChange(text);
    setUploadedFile(null);
    textareaRef.current?.focus();
  };

  const extractFromFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx') && !name.endsWith('.txt')) {
      setExtractError('Unsupported file. Upload a PDF, DOCX, or TXT file.');
      return;
    }
    if (value.trim().length > 0) {
      if (!confirm('Replace current text with content from the file?')) return;
    }

    setExtracting(true);
    setExtractError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/extract-text', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onChange(data.text);
      setUploadedFile(file.name);
      textareaRef.current?.focus();
    } catch (err) {
      setExtractError(String(err instanceof Error ? err.message : err));
    } finally {
      setExtracting(false);
    }
  }, [value, onChange]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) extractFromFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) extractFromFile(file);
  };

  const clearFile = () => {
    setUploadedFile(null);
    onChange('');
    setExtractError(null);
  };

  return (
    <div className={'card ' + styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>Describe your investing idea</h3>
        <p className={styles.sub}>In plain English. The AI will turn it into a structured strategy.</p>
      </div>

      {/* Upload file badge — shown when file is loaded */}
      {uploadedFile && (
        <div className={styles.fileBadge}>
          <IconFileText size={13} />
          <span>{uploadedFile}</span>
          <button className={styles.fileRemove} onClick={clearFile} title="Remove file">
            <IconX size={11} />
          </button>
        </div>
      )}

      {/* Extraction error */}
      {extractError && (
        <div className="banner banner--error" style={{ fontSize: 12, marginBottom: 4 }}>
          {extractError}
        </div>
      )}

      {/* Textarea with drag-over highlight */}
      <div
        className={styles.textareaWrap + (dragOver ? ' ' + styles.dragOver : '')}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {extracting ? (
          <div className={styles.extracting}>
            <IconLoader2 size={18} className={styles.spin} />
            <span>Extracting text from file…</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className={'input ' + styles.textarea}
            rows={5}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={isLocked || isParsing}
            placeholder="e.g., Top 20 momentum stocks from Nifty 500 with positive earnings growth, low P/E, ROE above 15%, rebalanced monthly..."
          />
        )}

        {/* Drag overlay hint */}
        {dragOver && (
          <div className={styles.dragHint}>
            <IconUpload size={24} />
            <span>Drop PDF, DOCX, or TXT to extract text</span>
          </div>
        )}
      </div>

      {/* Char counter */}
      {charCount > 0 && !extracting && (
        <div className={styles.charRow}>
          <span className={styles.charCount + ' num' + (overCap ? ' ' + styles.charOver : '')}>
            {charCount.toLocaleString('en-IN')} / {CHAR_SOFT_CAP.toLocaleString('en-IN')} chars
          </span>
          {overCap && <span className={styles.capNote}>Truncated to 5,000 chars.</span>}
        </div>
      )}

      {/* Example chips + upload button */}
      <div className={styles.chips}>
        {EXAMPLE_STRATEGIES.map((ex) => (
          <button
            key={ex.label}
            className="chip"
            onClick={() => handleExampleClick(ex.text)}
            disabled={isParsing || isLocked || extracting}
          >
            {ex.label}
          </button>
        ))}
        <button className={'btn btn--link btn--sm ' + styles.tryLink}>
          Try an example →
        </button>

        {/* Upload button */}
        <button
          className={'btn btn--secondary btn--sm ' + styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing || isLocked || extracting}
          title="Upload PDF, DOCX, or TXT"
        >
          <IconUpload size={13} />
          Upload PDF / DOCX
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        {value.trim().length > 0 && value.trim().length < 20 && (
          <span className={styles.tooShort}>Add more detail so the AI can interpret your idea.</span>
        )}
        <span className={styles.spacer} />
        <button
          className={'btn btn--primary btn--md ' + styles.parseBtn}
          onClick={onParse}
          disabled={!canParse}
        >
          {isParsing ? (
            <><IconLoader2 size={14} className={styles.spin} /> Parsing…</>
          ) : (
            <>Parse <IconArrowRight size={14} /></>
          )}
        </button>
      </div>
    </div>
  );
}
