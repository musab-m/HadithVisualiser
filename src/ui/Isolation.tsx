import { useStore } from '../state/store';

/**
 * What the graph has been narrowed to, and the way back out.
 *
 * An isolated graph looks like a perfectly ordinary small selection, so the
 * only thing separating "this narrator carried nine chains" from "the corpus
 * holds nine chains" is saying so on screen.
 */
export function Isolation() {
  const isolated = useStore((s) => s.isolated);
  const narrators = useStore((s) => s.narrators);
  const hadiths = useStore((s) => s.graph?.hadithCount ?? 0);
  const release = useStore((s) => s.release);
  const clearIsolation = useStore((s) => s.clearIsolation);

  if (!isolated.length) return null;

  return (
    <div className="isolation">
      {/* Two phrasings for one thing: the bar sits over the apex of the graph,
          and on a phone the full sentence wraps it onto a second line and
          across the Prophet's label. */}
      <span className="isolation__label">
        <span className="isolation__long">
          {isolated.length > 1 ? 'only the chains through all of' : 'only the chains through'}
        </span>
        <span className="isolation__short">only through</span>
      </span>
      <ul className="isolation__who">
        {isolated.map((id) => (
          <li key={id}>
            <span className="isolation__ar">{narrators.get(id)?.ar ?? id}</span>
            <button
              className="isolation__drop"
              onClick={() => release(id)}
              aria-label={`stop requiring ${narrators.get(id)?.en ?? id}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <span className="isolation__count">
        {hadiths
          ? `${hadiths.toLocaleString()} ${hadiths === 1 ? 'hadith' : 'hadiths'}`
          : 'nothing in this selection'}
      </span>
      <button className="isolation__clear" onClick={clearIsolation}>
        <span className="isolation__long">show everything</span>
        <span className="isolation__short">show all</span>
      </button>
    </div>
  );
}
