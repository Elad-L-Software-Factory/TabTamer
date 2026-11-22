import { useEffect, useRef, useState } from 'react';
import { Home } from './Home';
import { Saved } from './Saved';
import { Sweep } from './Sweep';
import { Toast, type ToastData } from './Toast';
import { Triage } from './Triage';

const UNDO_SECONDS = 30;
type View = 'home' | 'sweep' | 'triage' | 'saved';

export function App() {
  // "#sweep" / "#triage" / "#saved" open straight on that screen (handy for previews and tests).
  const [view, setView] = useState<View>(
    (['sweep', 'triage', 'saved'] as View[]).find((v) => window.location.hash === `#${v}`) ??
      'home',
  );
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function showToast(data: ToastData, seconds: number) {
    clearTimeout(timer.current);
    setToast(data);
    timer.current = setTimeout(() => setToast(null), seconds * 1000);
  }

  // Step 1 (Sweep) leads straight into Step 2 (Triage).
  function onSwept(closed: number) {
    setView('triage');
    if (closed === 0) return;
    showToast(
      {
        message: `Swept ${closed} ${closed === 1 ? 'tab' : 'tabs'}.`,
        action: {
          label: 'Undo',
          run: async () => {
            const reopened = await window.tabtamer.sweepUndo();
            showToast(
              {
                message: reopened
                  ? `Reopened ${reopened} ${reopened === 1 ? 'tab' : 'tabs'}.`
                  : 'Too late to undo.',
              },
              4,
            );
          },
        },
      },
      UNDO_SECONDS,
    );
  }

  return (
    <>
      {view === 'home' && <Home onTame={() => setView('sweep')} onSaved={() => setView('saved')} />}
      {view === 'sweep' && <Sweep onDone={onSwept} onCancel={() => setView('home')} />}
      {view === 'triage' && (
        <Triage onHome={() => setView('home')} onSaved={() => setView('saved')} />
      )}
      {view === 'saved' && <Saved onBack={() => setView('home')} />}
      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
    </>
  );
}
