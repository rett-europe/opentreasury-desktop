import { useState, useCallback, useMemo, useEffect } from 'react';
import './WordConfirmChallenge.css';

export interface WordConfirmChallengeProps {
  /** The full 12-word mnemonic to validate against */
  readonly mnemonic: string;
  /** Number of positions to challenge (default: 3) */
  readonly challengeCount?: number;
  /** Callback when all challenge words are correct */
  readonly onComplete?: () => void;
  /** Callback when validity changes */
  readonly onValidityChange?: (isValid: boolean) => void;
  /** Label for the challenge */
  readonly label?: string;
  /** Helper text */
  readonly helperText?: string;
}

interface ChallengePosition {
  position: number; // 1-based
  word: string;
}

/**
 * Word confirmation challenge: picks N random positions from the mnemonic
 * and validates user input. Used in fresh setup Screen 2b.
 */
export function WordConfirmChallenge({
  mnemonic,
  challengeCount = 3,
  onComplete,
  onValidityChange,
  label,
  helperText,
}: WordConfirmChallengeProps) {
  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);

  // Pick random positions (re-roll on mnemonic change)
  const challengePositions = useMemo((): ChallengePosition[] => {
    if (words.length !== 12) {
      console.error('WordConfirmChallenge: mnemonic must be exactly 12 words');
      return [];
    }

    const positions = new Set<number>();
    while (positions.size < challengeCount) {
      positions.add(Math.floor(Math.random() * 12) + 1); // 1-based
    }

    return Array.from(positions)
      .sort((a, b) => a - b)
      .map((pos) => {
        const word = words[pos - 1];
        return {
          position: pos,
          word: word ?? '',
        };
      });
  }, [words, challengeCount]);

  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [touched, setTouched] = useState<Set<number>>(new Set());

  const validateInput = useCallback(
    (position: number, value: string): boolean => {
      const challenge = challengePositions.find((c) => c.position === position);
      return challenge ? challenge.word === value.toLowerCase().trim() : false;
    },
    [challengePositions],
  );

  const allCorrect = useMemo(() => {
    return challengePositions.every((c) => validateInput(c.position, inputs[c.position] || ''));
  }, [challengePositions, inputs, validateInput]);

  useEffect(() => {
    onValidityChange?.(allCorrect);
    if (allCorrect) {
      onComplete?.();
    }
  }, [allCorrect, onComplete, onValidityChange]);

  const handleInputChange = useCallback((position: number, value: string) => {
    setInputs((prev) => ({ ...prev, [position]: value }));
  }, []);

  const handleBlur = useCallback((position: number) => {
    setTouched((prev) => new Set(prev).add(position));
  }, []);

  if (challengePositions.length === 0) {
    return null;
  }

  return (
    <div className="ot-word-confirm-challenge">
      {label && <div className="ot-word-confirm-challenge__label">{label}</div>}
      {helperText && <div className="ot-word-confirm-challenge__helper">{helperText}</div>}

      <div className="ot-word-confirm-challenge__inputs">
        {challengePositions.map((challenge) => {
          const value = inputs[challenge.position] || '';
          const isTouched = touched.has(challenge.position);
          const isValid = validateInput(challenge.position, value);
          const showError = isTouched && value.length > 0 && !isValid;
          const showSuccess = value.length > 0 && isValid;

          return (
            <div key={challenge.position} className="ot-word-confirm-challenge__field">
              <label
                htmlFor={`challenge-${challenge.position}`}
                className="ot-word-confirm-challenge__field-label"
              >
                Word #{challenge.position}
              </label>
              <input
                id={`challenge-${challenge.position}`}
                type="text"
                value={value}
                onChange={(e) => handleInputChange(challenge.position, e.target.value)}
                onBlur={() => handleBlur(challenge.position)}
                className={`ot-word-confirm-challenge__input ${
                  showError ? 'ot-word-confirm-challenge__input--error' : ''
                } ${showSuccess ? 'ot-word-confirm-challenge__input--success' : ''}`}
                autoComplete="off"
                spellCheck="false"
                aria-label={`Word at position ${challenge.position}`}
                aria-invalid={showError}
              />
              {showError && (
                <span className="ot-word-confirm-challenge__error-text" role="alert">
                  Incorrect
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
