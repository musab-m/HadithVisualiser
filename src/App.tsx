import { useEffect, useState } from 'react';
import { Scene } from './scene/Scene';
import { useStore } from './state/store';
import { HadithReader } from './ui/HadithReader';
import { Legend } from './ui/Legend';
import { NarratorPanel } from './ui/NarratorPanel';
import { Sidebar } from './ui/Sidebar';

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const laying = useStore((s) => s.laying);
  const init = useStore((s) => s.init);
  const [controls, setControls] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === 'error') {
    return (
      <div className="boot boot--error">
        <h1>The corpus is not built yet</h1>
        <p>{error}</p>
        <pre>
          npm run rijal:fetch{'\n'}
          npm run ingest -- bukhari muslim
        </pre>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="boot">
        <div className="boot__pulse" />
        <p>Reading the corpus…</p>
      </div>
    );
  }

  return (
    <div className={`app${controls ? ' app--controls' : ''}`}>
      <Scene />

      {/*
        On a phone the panel cannot sit over the graph — both need the whole
        width — so it becomes a sheet that is closed until asked for, and this
        bar carries the title and the way back to it. Hidden on wide screens,
        where the sidebar is simply always there.
      */}
      <header className="topbar">
        <h1 className="topbar__title">Isnād</h1>
        <button
          className="topbar__toggle"
          onClick={() => setControls(!controls)}
          aria-expanded={controls}
        >
          {controls ? 'view the graph' : 'search & collections'}
        </button>
      </header>

      <Sidebar onNavigate={() => setControls(false)} />
      <NarratorPanel />
      <HadithReader />
      <Legend />
      {laying ? <div className="laying">arranging {'…'}</div> : null}
    </div>
  );
}
