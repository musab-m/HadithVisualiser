import { useState } from 'react';
import { GRADE_COLOR, GRADE_LABEL, NARRATOR_GRADES } from '../corpus/types';
import { useStore } from '../state/store';

export function Legend() {
  const manifest = useStore((s) => s.manifest);
  const [open, setOpen] = useState(false);

  return (
    <div className="legend">
      <ul className="legend__keys">
        {NARRATOR_GRADES.map((grade) => (
          <li key={grade}>
            <span className="legend__dot" style={{ background: GRADE_COLOR[grade] }} />
            {GRADE_LABEL[grade]}
          </li>
        ))}
      </ul>
      <div className="legend__axis">
        <span>the Prophet ﷺ at the apex · each layer below heard from the one above · compilers at the floor</span>
      </div>
      <button className="legend__about" onClick={() => setOpen(!open)}>
        {open ? 'hide sources' : 'about the data'}
      </button>
      {open ? (
        <div className="legend__panel">
          <p>
            Chains are parsed from the Arabic of each collection and matched against the
            biographical literature. Parsing prose is inexact: a name the sources spell several
            ways can resolve to more than one figure, and those readings are marked
            <em> uncertain</em> rather than presented as settled.
          </p>
          <ul>
            {manifest?.sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                <span>{source.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
