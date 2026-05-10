import { useState, useCallback } from 'react';
import { mockWorkspaceIpc } from '../../mocks/workspaceIpc';
import { FolderPickerScreen } from './FolderPickerScreen';
import { RecoveryCodeDisplayScreen } from './RecoveryCodeDisplayScreen';
import { RecoveryCodeConfirmScreen } from './RecoveryCodeConfirmScreen';
import { SetupCompleteScreen } from './SetupCompleteScreen';

type Step = 'folder' | 'display' | 'confirm' | 'complete';

interface FreshSetupFlowProps {
  onComplete: () => void;
}

/**
 * Fresh setup flow orchestrator (4 steps):
 * 1. Folder picker
 * 2. Display recovery code
 * 3. Confirm 3 random words
 * 4. Setup complete
 *
 * State semantics (AC3): MK is generated lazily but NOT persisted until confirm passes.
 * If user closes app before Screen 3, MK is discarded on next launch.
 */
export function FreshSetupFlow({ onComplete }: FreshSetupFlowProps) {
  const [step, setStep] = useState<Step>('folder');
  const [, setFolderPath] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFolderNext = useCallback(async (path: string) => {
    setFolderPath(path);
    setError(null);

    try {
      const response = await mockWorkspaceIpc.create({ folderPath: path });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }

      setMnemonic(response.mnemonic);
      setSetupToken(response.setupToken);
      setStep('display');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, []);

  const handleDisplayNext = useCallback(() => {
    setStep('confirm');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!setupToken || !mnemonic) {
      setError('Setup token or mnemonic missing');
      return;
    }

    setError(null);

    // Extract 3 random positions for confirmation
    const words = mnemonic.split(' ');
    const positions = new Set<number>();
    while (positions.size < 3) {
      positions.add(Math.floor(Math.random() * 12));
    }

    const confirmWords: Record<string, string> = {};
    for (const pos of positions) {
      const word = words[pos];
      if (word) {
        confirmWords[String(pos + 1)] = word;
      }
    }

    try {
      const response = await mockWorkspaceIpc.confirmSetup({
        setupToken,
        confirmWords,
      });

      if (!response.ok) {
        setError(response.error.message);
        return;
      }

      setStep('complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, [setupToken, mnemonic]);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  if (error) {
    return (
      <div className="ot-onboarding-screen">
        <div className="ot-onboarding-screen__content">
          <h1 className="ot-onboarding-screen__title">Error</h1>
          <p className="ot-onboarding-screen__error">{error}</p>
        </div>
      </div>
    );
  }

  switch (step) {
    case 'folder':
      return <FolderPickerScreen onNext={handleFolderNext} />;
    case 'display':
      return mnemonic ? (
        <RecoveryCodeDisplayScreen mnemonic={mnemonic} onNext={handleDisplayNext} />
      ) : null;
    case 'confirm':
      return mnemonic ? (
        <RecoveryCodeConfirmScreen mnemonic={mnemonic} onConfirm={handleConfirm} />
      ) : null;
    case 'complete':
      return <SetupCompleteScreen onContinue={handleComplete} />;
    default:
      return null;
  }
}
