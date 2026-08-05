import { useMemo, useState } from 'react';
import { GRADE_COLOR, GRADE_LABEL, type NarratorIndexEntry } from '../corpus/types';
import { useStore } from '../state/store';
import { fold, rankName, scoreName, skeleton } from './names';

const LIMIT = 8;

interface Indexed {
  entry: NarratorIndexEntry;
  ar: string;
  en: string;
  bones: string;
}

/**
 * Find one transmitter by name and light them up in the graph.
 *
 * The graph already dims everything but the narrator in focus and the links
 * running through them; this is the way into that view for someone who knows
 * who they are looking for rather than where they sit. Searching the whole
 * register rather than what is drawn is deliberate: being told a man is in the
 * corpus but not in the collections you have open is an answer, and an empty
 * list is not.
 */
export function NarratorSearch() {
  const narrators = useStore((s) => s.narrators);
  const graph = useStore((s) => s.graph);
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const [query, setQuery] = useState('');

  // Folded once for the whole register, not once per keystroke.
  const index = useMemo(() => {
    const out: Indexed[] = [];
    for (const entry of narrators.values()) {
      const ar = fold(entry.ar);
      const en = entry.en ? fold(entry.en) : '';
      out.push({ entry, ar, en, bones: skeleton(ar) });
    }
    return out;
  }, [narrators]);

  const results = useMemo(() => {
    const needle = fold(query);
    if (needle.length < 2) return [];
    const bones = skeleton(needle);

    const scored: { entry: NarratorIndexEntry; rank: number }[] = [];
    for (const candidate of index) {
      const rank = rankName(needle, bones, candidate);
      if (rank >= 0) scored.push({ entry: candidate.entry, rank });
    }

    // Weight leads, tier discounts it — a search for `عائشة` means her rather
    // than one of the four namesakes, and `abu hurayra` means Abū Hurayra
    // rather than the Abū Baḥr whose consonants happen to match exactly.
    scored.sort((a, b) => scoreName(b.rank, b.entry.n) - scoreName(a.rank, a.entry.n));
    return scored.slice(0, LIMIT).map((s) => s.entry);
  }, [index, query]);

  const asked = query.trim().length >= 2;

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Find a narrator</h2>
        {focus ? (
          <button className="link" onClick={() => setFocus(undefined)}>
            clear
          </button>
        ) : null}
      </div>

      <input
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="A name, in Arabic or English"
        aria-label="Find a narrator by name"
      />

      {asked && !results.length ? (
        <p className="hint">Nobody of that name is in the corpus.</p>
      ) : null}

      {results.length ? (
        <ul className="rawis">
          {results.map((entry) => {
            const drawn = graph?.index.has(entry.id) ?? false;
            return (
              <li key={entry.id}>
                <button
                  className={`rawi${entry.id === focus ? ' rawi--on' : ''}`}
                  onClick={() => setFocus(entry.id)}
                  title={entry.en ? `${entry.ar} — ${entry.en}` : entry.ar}
                >
                  <span className="rawi__names">
                    <span className="rawi__ar">{entry.ar}</span>
                    {entry.en ? <span className="rawi__en">{entry.en}</span> : null}
                  </span>
                  <span className="rawi__meta">
                    <span
                      className="rawi__grade"
                      style={{ ['--grade' as string]: GRADE_COLOR[entry.grade] }}
                    >
                      {GRADE_LABEL[entry.grade]}
                    </span>
                    <span className="rawi__n">
                      {entry.n.toLocaleString()} {entry.n === 1 ? 'chain' : 'chains'}
                      {/*
                        A narrator can be in the corpus without being on screen:
                        the collections chosen, a search, or an isolation may all
                        leave them out. Saying so is the difference between a
                        highlight that failed and one with nothing to light.
                      */}
                      {drawn ? null : <em className="rawi__away"> · not in view</em>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="hint">
        Opens their biography and lights them up in the graph, with everything they did not
        carry dimmed behind them.
      </p>
    </section>
  );
}
