import { PROPHET_ID, collectorId } from '../corpus/types';
import { useStore } from '../state/store';

/**
 * The critic's name without the honorifics and death year, for a chip that has
 * to sit on one line. The full form is on the chip's title.
 */
function shortName(author: string): string {
  return author.replace(/\s*\(d\.[^)]*\)\s*$/, '').split(' ').slice(-1)[0];
}

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
  /*
    The Prophet ﷺ heads the path whether or not the chain reaches him, because
    that is the frame every report is read in — but where it does not reach him
    the first step is a gap, not a hearing. Drawn as an ordinary arrow it read
    as a claim the chain does not make, so it is struck through.
  */
  const breaks = record ? !record.toProphet : false;

  return (
    <div className="reader" role="dialog" aria-label="Hadith">
      <div className="reader__bar">
        <div>
          <span className="reader__book">{book?.titleEn ?? slug}</span>
          <span className="reader__ref">#{record?.ref ?? ''}</span>
          {/*
            The grade never appears on its own. It is one critic's ruling on
            this report, not a property of the report, and shown bare it reads
            as the latter — so whose it is travels with it, and the title
            carries the work it was published in.
          */}
          {record?.grade && book?.gradedBy ? (
            <span className="reader__grade" title={`${book.gradedBy.work} — ${book.gradedBy.author}`}>
              {record.grade}
              <em className="reader__grade-by">{shortName(book.gradedBy.author)}</em>
            </span>
          ) : null}
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
                {i < path.length - 1 ? (
                  breaks && i === 0 ? (
                    <span
                      className="chain__arrow chain__arrow--broken"
                      role="img"
                      aria-label="broken link: the chain does not reach the Prophet"
                      title="The chain as parsed stops short of the Prophet ﷺ — this report is traced no further back than the narrator beside it."
                    >
                      →
                    </span>
                  ) : (
                    <span className="chain__arrow" aria-hidden>
                      →
                    </span>
                  )
                ) : null}
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
