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
        {/*
          The one rule the key never stated, which left every coloured line
          unexplained: a red line is not a category of its own, it is a link
          between two narrators the critics abandoned.
        */}
        <li className="legend__rule">…and a line takes the colour of the two it joins</li>
      </ul>
      {links && (links.peer || links.backward) ? (
        <ul className="legend__keys legend__keys--links">
          {/* These two override the rule above: what is worth seeing about
              them is the direction, not who the transmitters were. */}
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
            The lines carry the same colouring. A link is drawn from the grade of the
            narrator at one end to the grade of the narrator at the other, so it fades
            between the two: a red line is not a category of its own but a link joining
            two men the critics abandoned, and a chain running from gold through green
            has passed from a Companion to a reliable transmitter. Only the two link
            colours below override this, where the direction is the point rather than
            who was transmitting. Brightness follows how well travelled a link is, so
            the routes carrying many chains stand out from the one-off transmissions.
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
