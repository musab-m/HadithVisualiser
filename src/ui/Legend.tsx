import { useState } from 'react';
import { GRADE_COLOR, GRADE_LABEL, NARRATOR_GRADES } from '../corpus/types';
import { LINK_COLOR } from '../scene/Graph';
import { useStore } from '../state/store';

export function Legend() {
  const manifest = useStore((s) => s.manifest);
  const links = useStore((s) => s.graph?.linkCounts);
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
      {links && (links.peer || links.backward) ? (
        <ul className="legend__keys legend__keys--links">
          {links.peer ? (
            <li>
              <span className="legend__dash" style={{ background: LINK_COLOR.peer }} />
              {links.peer.toLocaleString()} within a generation
              <em>may be riwāyat al-aqrān</em>
            </li>
          ) : null}
          {links.backward ? (
            <li>
              <span className="legend__dash" style={{ background: LINK_COLOR.backward }} />
              {links.backward.toLocaleString()} back up a generation
              <em>may be riwāyat al-akābir ʿan al-aṣāghir</em>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="legend__axis">
        <span>
          the Prophet ﷺ at the apex · a narrator sits at the shortest distance any chain puts
          between them and the Prophet · within a generation, the older are above the younger
        </span>
      </div>
      <button className="legend__about" onClick={() => setOpen(!open)}>
        {open ? 'hide sources' : 'about the data'}
      </button>
      {open ? (
        <div className="legend__panel">
          <p>
            Colour is the reliability grade the biographical database files a transmitter
            under, which is not the same axis as the generation they sit on. A narrator in
            the first generation shown in another colour is either one the chains name too
            briefly to identify at all — about a quarter of that layer — or one the
            literature grades by reliability rather than filing among the
            Companions. Companionship claimed for someone whose own ṭabaqa or death year
            rules it out is not shown: al-Iṣāba catalogues everyone <em>claimed</em> as a
            Companion, including those it rejects.
          </p>
          <p>
            Generations are derived from the chains themselves, not from the classical
            ṭabaqāt. A link drawn as staying within a generation or running back up one may
            genuinely be transmission between contemporaries or from a junior to a senior —
            or it may only mean the two narrators were placed a layer apart from where the
            sources would place them.
          </p>
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
