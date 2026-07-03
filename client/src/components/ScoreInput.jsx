import { useState } from 'react';

// Numeric cell that commits on blur or Enter. While focused it holds a local
// draft; otherwise it always mirrors the server value, so a rejected edit
// snaps back on the next broadcast.
export default function ScoreInput({ value, disabled, onCommit, ariaLabel }) {
  const [draft, setDraft] = useState(null);

  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    setDraft(null);
    const current = value === undefined ? '' : String(value);
    if (trimmed === current) return;
    onCommit(trimmed === '' ? null : Number(trimmed));
  };

  return (
    <input
      className={`score-input${value === undefined ? ' score-input-empty' : ''}`}
      type="number"
      inputMode="numeric"
      min="0"
      step="1"
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={disabled ? '' : '–'}
      value={draft ?? (value === undefined ? '' : value)}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setDraft(value === undefined ? '' : String(value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
