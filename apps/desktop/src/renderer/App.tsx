import { useEffect, useRef, useState } from 'react';
import { Home } from './Home';
import { Sweep } from './Sweep';
import { Toast, type ToastData } from './Toast';

const UNDO_SECONDS = 30;

export function App() {
  // "#sweep" opens straight on the Sweep screen (handy for previews and testing).
  const [view, setView] = useState<'home' | 'sweep'>(
    window.location.hash === '#sweep' ? 'sweep' : 'home',
  );
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function showToast(data: ToastData, seconds: number) {
    clearTimeout(timer.current);
    setToast(data);
    timer.current = setTimeout(() => setToast(null), seconds * 1000);
  }

  function onSwept(closed: number) {
    setView('home');
    if (closed === 0) return;
    showToast(
      {
        message: `Closed ${closed} ${closed === 1 ? 'tab' : 'tabs'}.`,
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
      {view === 'home' ? (
        <Home onTame={() => setView('sweep')} />
      ) : (
        <Sweep onDone={onSwept} onCancel={() => setView('home')} />
      )}
      {toast && <Toast data={toast} onClose={() => setToast(null)} />}
    </>
  );
}
