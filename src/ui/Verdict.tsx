import { useState } from 'react';
import { GRADE_COLOR, GRADE_LABEL, type RijalVerdict } from '../corpus/types';

/**
 * One critic's assessment, and — where the work could be read and the man found
 * in it — what the work actually says.
 *
 * The card used to end at the verdict phrase, which is a word: `ثقة حافظ`,
 * `إمام`, `يضع`. That word is the tradition's summary of a sentence, and the
 * sentence is where the reasons are, so the card opens onto it.
 *
 * The entry stays in Arabic. Translating Ibn Ḥajar would mean choosing what
 * `صدوق يهم` comes out as in English, and that choice is the whole content of
 * the judgement — this project has no business making it silently.
 */
export function Verdict({ verdict }: { verdict: RijalVerdict }) {
  const [open, setOpen] = useState(false);
  const readable = Boolean(verdict.entryAr);

  const head = (
    <>
      <div className="verdict__work">
        {verdict.work}
        {verdict.author ? <span className="verdict__author">{verdict.author}</span> : null}
      </div>
      <div className="verdict__grade">
        {verdict.gradeAr ? <span className="verdict__ar">{verdict.gradeAr}</span> : null}
        {verdict.gradeEn ? (
          <span
            className="verdict__en"
            style={{ ['--grade' as string]: GRADE_COLOR[verdict.gradeEn] }}
          >
            {GRADE_LABEL[verdict.gradeEn]}
          </span>
        ) : null}
        {/*
          Only where there is something behind it. A card that offers to open
          and then shows the phrase again is worse than one that never offered.
        */}
        {readable ? (
          <span className="verdict__more" aria-hidden>
            {open ? 'hide the entry' : 'read the entry'}
          </span>
        ) : null}
      </div>
    </>
  );

  if (!readable) return <li className="verdict">{head}</li>;

  return (
    <li className={`verdict verdict--open${open ? ' verdict--shown' : ''}`}>
      <button
        className="verdict__toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Read'} what ${verdict.work} says about him`}
      >
        {head}
      </button>
      {open ? (
        <div className="verdict__entry">
          <p className="verdict__text">{verdict.entryAr}</p>
          {/*
            Which printing this was read from. An entry quoted without it
            invites being taken for the work rather than for one edition of it,
            and the editions differ.
          */}
          <p className="verdict__edition">
            {verdict.entryNo ? <span className="verdict__no">#{verdict.entryNo}</span> : null}
            {verdict.edition}
          </p>
        </div>
      ) : null}
    </li>
  );
}
