import { useMemo } from 'react';
import './RecoveryCodeGrid.css';

export interface RecoveryCodeGridProps {
  /** 12-word BIP39 mnemonic */
  readonly mnemonic: string;
  /** Optional actions: print, save-as-PDF, confirm */
  readonly onPrint?: () => void;
  readonly onSavePdf?: () => void;
  readonly onConfirm?: () => void;
  /** Optional caption beneath grid */
  readonly caption?: string;
  /** Button label for confirm action */
  readonly confirmLabel?: string;
}

/**
 * Displays a 12-word BIP39 recovery code in a 3×4 numbered grid.
 * Used in fresh setup flow (Screen 2) to show the generated mnemonic.
 */
export function RecoveryCodeGrid({
  mnemonic,
  onPrint,
  onSavePdf,
  onConfirm,
  caption,
  confirmLabel = "I've written it down",
}: RecoveryCodeGridProps) {
  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);

  if (words.length !== 12) {
    console.error('RecoveryCodeGrid: mnemonic must be exactly 12 words');
    return null;
  }

  return (
    <div className="ot-recovery-code-grid">
      <div className="ot-recovery-code-grid__words">
        {words.map((word, idx) => (
          <div key={idx} className="ot-recovery-code-grid__word-cell">
            <span className="ot-recovery-code-grid__word-number">{idx + 1}</span>
            <span className="ot-recovery-code-grid__word-text">{word}</span>
          </div>
        ))}
      </div>

      {caption && <p className="ot-recovery-code-grid__caption">{caption}</p>}

      <div className="ot-recovery-code-grid__actions">
        {onPrint && (
          <button type="button" className="ot-recovery-code-grid__action-btn" onClick={onPrint}>
            Print
          </button>
        )}
        {onSavePdf && (
          <button type="button" className="ot-recovery-code-grid__action-btn" onClick={onSavePdf}>
            Save as PDF
          </button>
        )}
        {onConfirm && (
          <button
            type="button"
            className="ot-recovery-code-grid__action-btn ot-recovery-code-grid__action-btn--primary"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </div>
  );
}
