import { useEffect } from 'react';
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
    <div className="app">
      <Scene />
      <Sidebar />
      <NarratorPanel />
      <HadithReader />
      <Legend />
      {laying ? <div className="laying">arranging {'…'}</div> : null}
    </div>
  );
}
