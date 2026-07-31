import { PROPHET_ID, collectorId } from '../corpus/types';
import { useStore } from '../state/store';

/**
 * The text of one hadith, with its chain laid out as the path it travelled.
 * Every name in the path opens that narrator.
 */
export function HadithReader() {
  const reading = useStore((s) => s.reading);
  const texts = useStore((s) => s.texts);
  const books = useStore((s) => s.books);
  const narrators = useStore((s) => s.narrators);
  const read = useStore((s) => s.read);
  const setFocus = useStore((s) => s.setFocus);
  const pin = useStore((s) => s.pin);

  if (!reading) return null;
  const slug = reading.split(':')[0];
  const book = books.get(slug);
  const record = book?.hadiths.find((h) => h.id === reading);
  const text = texts.get(reading);

  const path = record ? [PROPHET_ID, ...record.chain, collectorId(slug)] : [];

  return (
    <div className="reader" role="dialog" aria-label="Hadith">
      <div className="reader__bar">
        <div>
          <span className="reader__book">{book?.titleEn ?? slug}</span>
          <span className="reader__ref">#{record?.ref ?? ''}</span>
          {record?.grade ? <span className="reader__grade">{record.grade}</span> : null}
          {record && !record.toProphet ? (
            <span className="reader__grade reader__grade--warn">chain not traced to the Prophet</span>
          ) : null}
        </div>
        <div className="reader__actions">
          <button className="link" onClick={() => pin(reading)}>
            show only this chain
          </button>
          <button className="reader__close" onClick={() => void read(undefined)} aria-label="Close">
            ×
          </button>
        </div>
      </div>

      {path.length ? (
        <ol className="chain">
          {path.map((id, i) => {
            const entry = narrators.get(id);
            return (
              <li key={`${id}-${i}`}>
                <button className="chain__node" onClick={() => setFocus(id)}>
                  {entry?.ar ?? id}
                </button>
                {i < path.length - 1 ? <span className="chain__arrow" aria-hidden>→</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="reader__body">
        {text?.ar ? <p className="reader__ar">{text.ar}</p> : null}
        {text?.by ? <p className="reader__by">{text.by}</p> : null}
        {text?.en ? <p className="reader__en">{text.en}</p> : null}
        {!text ? <p className="hint">Loading…</p> : null}
      </div>
    </div>
  );
}
