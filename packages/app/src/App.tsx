import { useState } from 'react';
import type { Plot } from '@agrotwin/domain';
import { CaptureScreen } from './features/capture/CaptureScreen';
import { PlotsScreen } from './features/plots/PlotsScreen';
import { TwinScreen } from './features/twin/TwinScreen';

type View = { name: 'plots' } | { name: 'twin'; plot: Plot } | { name: 'capture'; plot: Plot };

/**
 * Navigation, and nothing else.
 *
 * Which screen is showing is screen state, so it lives here. The twin's state
 * lives in the StateStore behind the repositories, never in React: that
 * separation is checked at every phase close (CLAUDE.md section 7).
 */
export function App() {
  const [view, setView] = useState<View>({ name: 'plots' });
  // Forces the twin board to re-read after a new observation.
  const [revision, setRevision] = useState(0);

  if (view.name === 'plots') {
    return <PlotsScreen onOpenPlot={(plot) => setView({ name: 'twin', plot })} />;
  }

  if (view.name === 'capture') {
    return (
      <CaptureScreen
        plot={view.plot}
        onRecorded={() => {
          setRevision((value) => value + 1);
          setView({ name: 'twin', plot: view.plot });
        }}
        onBack={() => setView({ name: 'twin', plot: view.plot })}
      />
    );
  }

  return (
    <TwinScreen
      key={revision}
      plot={view.plot}
      onCapture={() => setView({ name: 'capture', plot: view.plot })}
      onBack={() => setView({ name: 'plots' })}
    />
  );
}
