import { useState } from 'react';
import { useStore } from '../state/store';

const PAGE = 40;

/**
 * A list of hadith references that reveals more when asked.
 *
 * It used to stop at forty and say how many were left, which told you the
 * chains existed but gave you no way to reach them — the count read as a
 * button and was not one.
 *
 * Give this a `key` of whatever it is listing, so moving to another narrator
 * starts the list closed again rather than mid-scroll through the last one.
 */
export function HadithRefs({ ids, onlyButton }: { ids: string[]; onlyButton?: boolean }) {
  const [shown, setShown] = useState(PAGE);
  const read = useStore((s) => s.read);
  const pin = useStore((s) => s.pin);
  const visible = ids.slice(0, shown);
  const left = ids.length - visible.length;

  return (
    <>
      <ul className="hadiths">
        {visible.map((id) =>
          onlyButton ? (
            <li key={id} className="hadiths__pair">
              <button className="hadith-ref" onClick={() => void read(id)}>
                {id}
              </button>
              <button className="found__only" onClick={() => pin(id)} title="Show only this chain">
                only
              </button>
            </li>
          ) : (
            <li key={id}>
              <button className="hadith-ref" onClick={() => void read(id)}>
                {id}
              </button>
            </li>
          ),
        )}
      </ul>
      {left > 0 ? (
        <button className="link reveal" onClick={() => setShown(shown + PAGE * 4)}>
          show {Math.min(left, PAGE * 4).toLocaleString()} more
          {left > PAGE * 4 ? (
            <span className="reveal__left">of {left.toLocaleString()}</span>
          ) : null}
        </button>
      ) : null}
    </>
  );
}
