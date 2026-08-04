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
      <span className="isolation__label">
        {isolated.length > 1 ? 'only the chains through all of' : 'only the chains through'}
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
        show everything
      </button>
    </div>
  );
}
