import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';
import { wordlists } from 'bip39';
import './RecoveryCodeInput.css';

const BIP39_WORDS = wordlists.english;

export interface RecoveryCodeInputProps {
  /** Number of words to input (default: 12) */
  readonly wordCount?: number;
  /** Callback when all words are filled and valid */
  readonly onChange?: (mnemonic: string) => void;
  /** Callback when validity changes */
  readonly onValidityChange?: (isValid: boolean) => void;
  /** External error message to display */
  readonly errorText?: string | undefined;
  /** Label for the input group */
  readonly label?: string;
  /** Helper text */
  readonly helperText?: string;
}

/**
 * 12-field input for BIP39 recovery code entry with autocomplete.
 * Used in join and recovery flows.
 */
export function RecoveryCodeInput({
  wordCount = 12,
  onChange,
  onValidityChange,
  errorText,
  label,
  helperText,
}: RecoveryCodeInputProps) {
  const [words, setWords] = useState<string[]>(Array(wordCount).fill(''));
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const hasError = !!errorText;

  // Validate all words are in BIP39 wordlist
  const validateWords = useCallback(() => {
    const allFilled = words.every((w) => w.trim().length > 0);
    const allValid = words.every((w) => BIP39_WORDS?.includes(w.toLowerCase().trim()) ?? false);
    return allFilled && allValid;
  }, [words]);

  useEffect(() => {
    const isValid = validateWords();
    onValidityChange?.(isValid);
    if (isValid) {
      onChange?.(words.join(' '));
    }
  }, [words, validateWords, onChange, onValidityChange]);

  const handleWordChange = useCallback(
    (index: number, value: string) => {
      const normalized = value.toLowerCase().trim();
      const newWords = [...words];
      newWords[index] = normalized;
      setWords(newWords);

      // Generate suggestions
      if (normalized.length > 0 && BIP39_WORDS) {
        const matches = BIP39_WORDS.filter((w) => w.startsWith(normalized)).slice(0, 5);
        setSuggestions(matches);
        setActiveSuggestionIndex(-1);
      } else {
        setSuggestions([]);
      }
    },
    [words],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
        e.preventDefault();
        const selectedWord = suggestions[activeSuggestionIndex];
        if (selectedWord) {
          const newWords = [...words];
          newWords[index] = selectedWord;
          setWords(newWords);
          setSuggestions([]);
          setActiveSuggestionIndex(-1);
          // Focus next field
          if (index < wordCount - 1) {
            inputRefs.current[index + 1]?.focus();
          }
        }
      } else if (
        e.key === 'Tab' &&
        !e.shiftKey &&
        suggestions.length > 0 &&
        activeSuggestionIndex === -1
      ) {
        // Auto-complete with first suggestion on Tab
        e.preventDefault();
        const firstSuggestion = suggestions[0];
        if (firstSuggestion) {
          const newWords = [...words];
          newWords[index] = firstSuggestion;
          setWords(newWords);
          setSuggestions([]);
          if (index < wordCount - 1) {
            inputRefs.current[index + 1]?.focus();
          }
        }
      }
    },
    [suggestions, activeSuggestionIndex, words, wordCount],
  );

  const selectSuggestion = useCallback(
    (index: number, suggestion: string) => {
      const newWords = [...words];
      newWords[index] = suggestion;
      setWords(newWords);
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      if (index < wordCount - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [words, wordCount],
  );

  return (
    <div className="ot-recovery-code-input">
      {label && <div className="ot-recovery-code-input__label">{label}</div>}
      {helperText && <div className="ot-recovery-code-input__helper">{helperText}</div>}

      <div className="ot-recovery-code-input__grid">
        {words.map((word, idx) => (
          <div key={idx} className="ot-recovery-code-input__cell">
            <label htmlFor={`word-${idx}`} className="ot-recovery-code-input__word-label">
              {idx + 1}
            </label>
            <div className="ot-recovery-code-input__input-wrapper">
              <input
                ref={(el) => (inputRefs.current[idx] = el)}
                id={`word-${idx}`}
                type="text"
                value={word}
                onChange={(e) => handleWordChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onFocus={() => setFocusedIndex(idx)}
                onBlur={() => {
                  setTimeout(() => {
                    setFocusedIndex(null);
                    setSuggestions([]);
                  }, 200);
                }}
                className={`ot-recovery-code-input__field ${hasError ? 'ot-recovery-code-input__field--error' : ''}`}
                autoComplete="off"
                spellCheck="false"
                aria-label={`Word ${idx + 1}`}
              />
              {focusedIndex === idx && suggestions.length > 0 && (
                <ul className="ot-recovery-code-input__suggestions">
                  {suggestions.map((suggestion, sIdx) => (
                    <li
                      key={suggestion}
                      className={`ot-recovery-code-input__suggestion ${
                        sIdx === activeSuggestionIndex
                          ? 'ot-recovery-code-input__suggestion--active'
                          : ''
                      }`}
                      onClick={() => selectSuggestion(idx, suggestion)}
                    >
                      {suggestion}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasError && (
        <div className="ot-recovery-code-input__error" role="alert">
          {errorText}
        </div>
      )}
    </div>
  );
}
