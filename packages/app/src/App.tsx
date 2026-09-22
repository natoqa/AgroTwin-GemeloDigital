import { useState } from 'react';
import type { Campaign, Plot } from '@agrotwin/domain';
import { BackupScreen } from './features/backup/BackupScreen';
import { CaptureScreen } from './features/capture/CaptureScreen';
import { CampaignScreen } from './features/campaigns/CampaignScreen';
import { PlotScreen } from './features/plots/PlotScreen';
import { PlotsScreen } from './features/plots/PlotsScreen';
import { TwinScreen } from './features/twin/TwinScreen';

type View =
  | { name: 'plots' }
  | { name: 'plot'; plot: Plot }
  | { name: 'campaigns'; plot: Plot }
  | { name: 'twin'; plot: Plot; campaign: Campaign }
  | { name: 'capture'; plot: Plot; campaign: Campaign }
  | { name: 'backup' };

/**
 * Navigation, and nothing else.
 *
 * Which screen is showing is screen state, so it lives here. The twin's state
 * lives in the StateStore behind the repositories, never in React: that
 * separation is checked at every phase close (CLAUDE.md §7).
 */
export function App() {
  const [view, setView] = useState<View>({ name: 'plots' });
  // Forces a screen to re-read after something was written.
  const [revision, setRevision] = useState(0);
  const refresh = () => {
    setRevision((value) => value + 1);
  };

  switch (view.name) {
    case 'plots':
      return (
        <PlotsScreen
          key={revision}
          onOpenPlot={(plot) => setView({ name: 'plot', plot })}
          onOpenBackup={() => setView({ name: 'backup' })}
        />
      );

    case 'plot':
      return (
        <PlotScreen
          key={revision}
          plot={view.plot}
          onOpenCampaigns={() => setView({ name: 'campaigns', plot: view.plot })}
          onSaved={(plot) => {
            refresh();
            setView({ name: 'plot', plot });
          }}
          onBack={() => setView({ name: 'plots' })}
        />
      );

    case 'campaigns':
      return (
        <CampaignScreen
          key={revision}
          plot={view.plot}
          onOpenCampaign={(campaign) => setView({ name: 'twin', plot: view.plot, campaign })}
          onChanged={refresh}
          onBack={() => setView({ name: 'plot', plot: view.plot })}
        />
      );

    case 'capture':
      return (
        <CaptureScreen
          plot={view.plot}
          campaign={view.campaign}
          onRecorded={() => {
            refresh();
            setView({ name: 'twin', plot: view.plot, campaign: view.campaign });
          }}
          onBack={() => setView({ name: 'twin', plot: view.plot, campaign: view.campaign })}
        />
      );

    case 'backup':
      return (
        <BackupScreen
          onChanged={refresh}
          onBack={() => setView({ name: 'plots' })}
        />
      );

    default:
      return (
        <TwinScreen
          key={revision}
          campaign={view.campaign}
          onCapture={() => setView({ name: 'capture', plot: view.plot, campaign: view.campaign })}
          onClosed={(campaign) => {
            refresh();
            setView({ name: 'twin', plot: view.plot, campaign });
          }}
          onBack={() => setView({ name: 'campaigns', plot: view.plot })}
        />
      );
  }
}
