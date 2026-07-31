import { useMemo, useState } from 'react';
import type { BookFile, HadithRecord } from '../corpus/types';
import { useStore } from '../state/store';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function ChapterList({ book }: { book: BookFile }) {
  const activeChapters = useStore((s) => s.activeChapters.get(book.slug));
  const toggleChapter = useStore((s) => s.toggleChapter);
  const clearChapters = useStore((s) => s.clearChapters);
  const [query, setQuery] = useState('');

  const chapters = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return book.chapters;
    return book.chapters.filter(
      (c) => c.en.toLowerCase().includes(needle) || c.ar.includes(query.trim()),
    );
  }, [book.chapters, query]);

  if (!book.chapters.length) return null;

  return (
    <div className="chapters">
      <div className="chapters__head">
        <input
          className="input input--small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${book.chapters.length} chapters`}
        />
        {activeChapters?.size ? (
          <button className="link" onClick={() => clearChapters(book.slug)}>
            whole book
          </button>
        ) : null}
      </div>
      <ul className="chapters__list">
        {chapters.slice(0, 200).map((chapter) => (
          <li key={chapter.id}>
            <label className="check check--tight">
              <input
                type="checkbox"
                checked={activeChapters?.has(chapter.id) ?? false}
                onChange={() => toggleChapter(book.slug, chapter.id)}
              />
              <span className="check__box" />
              <span className="check__label">
                <span className="chapters__num">{chapter.id}</span> {chapter.en}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HadithSearch() {
  const books = useStore((s) => s.books);
  const pinned = useStore((s) => s.pinned);
  const pin = useStore((s) => s.pin);
  const [query, setQuery] = useState('');

  /**
   * Accepts `1`, `bukhari 1`, or `bukhari:1`. A bare number offers that hadith
   * from every collection that has one; naming a collection narrows it.
   */
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const match = needle.match(/^(?:([a-z_0-9]+)\s*[:\s]\s*)?(\d+)$/);
    if (!match) return [];
    const [, where, number] = match;
    const ref = Number(number);

    const out: { book: BookFile; hadith: HadithRecord }[] = [];
    for (const book of books.values()) {
      if (
        where &&
        !book.slug.startsWith(where) &&
        !book.titleEn.toLowerCase().includes(where)
      ) {
        continue;
      }
      const hit = book.hadiths.find((h) => h.ref === ref);
      if (hit) out.push({ book, hadith: hit });
    }
    return out;
  }, [books, query]);

  return (
    <div className="picker">
      <input
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Hadith number, e.g. 1 or bukhari 945"
      />
      {results.length ? (
        <ul className="picker__results">
          {results.map(({ book, hadith }) => (
            <li key={hadith.id}>
              <button
                className="picker__result"
                onClick={() => pin(hadith.id)}
                disabled={pinned.includes(hadith.id)}
              >
                <span className="picker__book">{book.titleEn}</span>
                <span className="picker__ref">#{hadith.ref}</span>
                <span className="picker__len">{hadith.chain.length} narrators</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  const manifest = useStore((s) => s.manifest);
  const books = useStore((s) => s.books);
  const activeBooks = useStore((s) => s.activeBooks);
  const toggleBook = useStore((s) => s.toggleBook);
  const setAllBooks = useStore((s) => s.setAllBooks);
  const pinned = useStore((s) => s.pinned);
  const unpin = useStore((s) => s.unpin);
  const clearPins = useStore((s) => s.clearPins);
  const graph = useStore((s) => s.graph);
  const [expanded, setExpanded] = useState<string>();

  const allOn = books.size > 0 && activeBooks.size === books.size;

  return (
    <aside className="sidebar">
      <header className="sidebar__head">
        <h1 className="sidebar__title">
          Isnād
          <span className="sidebar__subtitle">the chains of the hadith corpus, in three dimensions</span>
        </h1>
      </header>

      <div className="stats">
        <Stat value={(graph?.hadithCount ?? 0).toLocaleString()} label="hadiths shown" />
        <Stat value={(graph?.ids.length ?? 0).toLocaleString()} label="narrators" />
        <Stat value={((graph?.edges.length ?? 0) / 2).toLocaleString()} label="transmissions" />
      </div>

      {pinned.length ? (
        <section className="panel">
          <div className="panel__head">
            <h2>Selected hadiths</h2>
            <button className="link" onClick={clearPins}>
              clear
            </button>
          </div>
          <ul className="pins">
            {pinned.map((id) => (
              <li key={id}>
                <button className="pin" onClick={() => unpin(id)}>
                  {id}
                  <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">Showing only these. Clear to go back to whole books.</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__head">
          <h2>Collections</h2>
          <button className="link" onClick={() => setAllBooks(!allOn)}>
            {allOn ? 'none' : 'all'}
          </button>
        </div>

        <ul className="books">
          {manifest?.books.map((summary) => {
            const book = books.get(summary.slug);
            const on = activeBooks.has(summary.slug);
            const chapters = book?.chapters.length ?? 0;
            return (
              <li key={summary.slug} className={`book${on ? ' book--on' : ''}`}>
                <label className="check">
                  <input type="checkbox" checked={on} onChange={() => toggleBook(summary.slug)} />
                  <span className="check__box" />
                  <span className="check__label">
                    <span className="book__title">{summary.titleEn}</span>
                    <span className="book__ar">{summary.titleAr}</span>
                    <span className="book__meta">
                      {summary.chainCount.toLocaleString()} chains · {summary.narratorCount.toLocaleString()} narrators
                      {summary.authorDiedAH ? ` · d. ${summary.authorDiedAH} AH` : ''}
                    </span>
                  </span>
                </label>
                {chapters > 1 ? (
                  <button
                    className="book__expand"
                    onClick={() => setExpanded(expanded === summary.slug ? undefined : summary.slug)}
                  >
                    {expanded === summary.slug ? 'hide chapters' : `${chapters} chapters`}
                  </button>
                ) : null}
                {expanded === summary.slug && book ? <ChapterList book={book} /> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>A single chain</h2>
        </div>
        <HadithSearch />
        <p className="hint">
          Pick one hadith, or several, to see just those chains. You can also open any
          narrator and show only the chains running through them.
        </p>
      </section>
    </aside>
  );
}
