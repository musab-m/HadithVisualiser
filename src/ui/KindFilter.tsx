import { useMemo, useState } from 'react';
import { ALL_KINDS, KIND_GROUPS, kindsOf, matchesKinds } from '../graph/kinds';
import { useStore } from '../state/store';

/**
 * Narrow the corpus to kinds of report.
 *
 * Each option carries the count it would give against everything else already
 * chosen, so the reader can see what a filter is worth before spending a click
 * on it — and can see when a combination has nothing in it without having to
 * try it.
 *
 * Folded away by default. Ten options with their classical terms and their
 * counts is most of a phone screen, and the sidebar's first job is the
 * collections; open, it says what it is holding, so a filter can never be left
 * on out of sight. Closed it also costs nothing — the counts walk every chain
 * in scope, and that work only happens while they are on screen.
 */
export function KindFilter() {
  const books = useStore((s) => s.books);
  const narrators = useStore((s) => s.narrators);
  const activeBooks = useStore((s) => s.activeBooks);
  const kinds = useStore((s) => s.kinds);
  const toggleKind = useStore((s) => s.toggleKind);
  const clearKinds = useStore((s) => s.clearKinds);
  const [open, setOpen] = useState(kinds.length > 0);

  const chosen = useMemo(() => new Set(kinds), [kinds]);

  /**
   * How many hadiths each option would leave.
   *
   * Counted over the collections in scope rather than the drawn selection, so
   * a number does not move about as a search narrows things — and computed
   * once for every option together, since walking fifty thousand chains per
   * tick box would not be.
   */
  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    if (!open) return tally;
    for (const slug of activeBooks) {
      const book = books.get(slug);
      if (!book) continue;
      for (const hadith of book.hadiths) {
        const mine = kindsOf(hadith, book.slug, narrators);
        for (const group of KIND_GROUPS) {
          for (const kind of group.kinds) {
            // What this option would give *with the others still applied*: the
            // count of a filter you are about to add, not of it alone.
            const withThis = new Set(chosen);
            withThis.add(kind.id);
            if (matchesKinds(withThis, mine)) {
              tally.set(kind.id, (tally.get(kind.id) ?? 0) + 1);
            }
          }
        }
      }
    }
    return tally;
  }, [books, activeBooks, narrators, chosen, open]);

  if (!books.size) return null;

  const chosenLabels = ALL_KINDS.filter((k) => chosen.has(k.id)).map((k) => k.label);

  return (
    <section className={`panel panel--fold${open ? ' panel--open' : ''}`}>
      <div className="panel__head">
        <button
          className="fold"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="kinds-body"
        >
          <span className="fold__mark" aria-hidden>
            ▸
          </span>
          <h2>Kinds of report</h2>
          {kinds.length ? <span className="fold__count">{kinds.length}</span> : null}
        </button>
        {kinds.length ? (
          <button className="link" onClick={clearKinds}>
            clear
          </button>
        ) : null}
      </div>

      {/*
        Closed, the panel still has to answer "is anything filtering what I am
        looking at?" — a hidden filter that quietly halves the corpus is worse
        than a long list.
      */}
      {!open ? (
        <p className="fold__summary">
          {chosenLabels.length ? chosenLabels.join(' · ') : 'Ruling, shape of the chain, who is in it'}
        </p>
      ) : null}

      {open ? (
        <div id="kinds-body">
          {KIND_GROUPS.map((group) => (
            <div className="kinds" key={group.id}>
              <h3 className="kinds__head">{group.label}</h3>
              <ul className="kinds__list">
                {group.kinds.map((kind) => {
                  const on = chosen.has(kind.id);
                  const n = counts.get(kind.id) ?? 0;
                  return (
                    <li key={kind.id}>
                      <label className={`check check--tight${!on && !n ? ' check--empty' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleKind(kind.id)} />
                        <span className="check__box" />
                        <span className="check__label">
                          <span className="kinds__name">
                            {kind.label}
                            {kind.term ? <em className="kinds__term">{kind.term}</em> : null}
                          </span>
                          {kind.hint ? <span className="kinds__hint">{kind.hint}</span> : null}
                        </span>
                        <span className="kinds__n">{n.toLocaleString()}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="hint">{group.note}</p>
            </div>
          ))}

          <p className="hint">
            Choices within a heading widen the result; choices under different headings narrow
            it. Marfūʿ, mawqūf and maqṭūʿ are deliberately not offered: they cannot be read off
            a parsed chain reliably enough to be worth showing.
          </p>
        </div>
      ) : null}
    </section>
  );
}
