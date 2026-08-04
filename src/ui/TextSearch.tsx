import { useMemo, useState } from 'react';
import { useStore } from '../state/store';

/**
 * Search the wording of the reports rather than their numbering, and put every
 * hadith carrying it into the graph at once. The count is the point: it is how
 * many times the corpus records the statement being transmitted, and the shape
 * behind it is how far apart those routes run.
 */
export function TextSearch() {
  const manifest = useStore((s) => s.manifest);
  const books = useStore((s) => s.books);
  const matches = useStore((s) => s.matches);
  const searching = useStore((s) => s.searching);
  const textQuery = useStore((s) => s.textQuery);
  const runSearch = useStore((s) => s.runSearch);
  const clearSearch = useStore((s) => s.clearSearch);
  const read = useStore((s) => s.read);
  const pin = useStore((s) => s.pin);
  // Matches without a parsable isnad have nothing to draw, so the graph can
  // legitimately hold fewer hadiths than the search found.
  const drawn = useStore((s) => (s.matches ? (s.graph?.hadithCount ?? null) : null));
  const [draft, setDraft] = useState('');

  /** Which collections report this wording, and how often. */
  const spread = useMemo(() => {
    if (!matches?.ids.length) return [];
    const counts = new Map<string, number>();
    for (const id of matches.ids) {
      const slug = id.split(':')[0];
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [matches]);

  if (!manifest?.search) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void runSearch(draft);
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Trace a wording</h2>
        {matches ? (
          <button
            className="link"
            onClick={() => {
              setDraft('');
              clearSearch();
            }}
          >
            clear
          </button>
        ) : null}
      </div>

      <form onSubmit={submit} className="search">
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="A phrase, in Arabic or English"
          aria-label="Search the text of the hadiths"
        />
        <button className="search__go" type="submit" disabled={searching || !draft.trim()}>
          {searching ? '…' : 'trace'}
        </button>
      </form>

      {matches && !searching ? (
        matches.ids.length ? (
          <div className="found">
            <p className="found__count">
              <strong>{matches.total.toLocaleString()}</strong>{' '}
              {matches.total === 1 ? 'hadith reports' : 'hadiths report'} this
              {matches.phrase ? (
                <>
                  {' '}
                  · <strong>{matches.phrase.toLocaleString()}</strong> carry the phrase itself
                </>
              ) : null}
            </p>

            <ul className="found__spread">
              {spread.map(([slug, count]) => (
                <li key={slug}>
                  <span>{books.get(slug)?.titleEn ?? slug}</span>
                  <span className="found__n">{count.toLocaleString()}</span>
                </li>
              ))}
            </ul>

            <p className="hint">
              {drawn !== null && drawn < matches.total ? (
                <>
                  {drawn.toLocaleString()} of those have a chain that could be read from the
                  text; the rest are in the corpus but their isnad could not be parsed.{' '}
                </>
              ) : null}
              A wording carried by many separate routes shows as a wide fan; one route means a
              single line.
            </p>

            <ul className="found__list">
              {matches.ids.slice(0, 40).map((id) => (
                <li key={id}>
                  <button className="found__hit" onClick={() => void read(id)}>
                    {id}
                  </button>
                  <button className="found__only" onClick={() => pin(id)} title="Show only this chain">
                    only
                  </button>
                </li>
              ))}
            </ul>
            {matches.ids.length > 40 ? (
              <p className="hint">and {(matches.ids.length - 40).toLocaleString()} more</p>
            ) : null}

            {matches.unindexed.length ? (
              <p className="hint">
                Ignored, being either absent from the corpus or too common to narrow anything:{' '}
                {matches.unindexed.join(', ')}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="hint">
            Nothing matches {textQuery ? `“${textQuery}”` : 'that'}. Try fewer or more
            distinctive words — the search reads Arabic and English alike.
          </p>
        )
      ) : null}
    </section>
  );
}
