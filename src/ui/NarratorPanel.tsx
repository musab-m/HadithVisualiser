import { GENERATION_SOURCE_LABEL, GRADE_COLOR, GRADE_LABEL, PROPHET_ID } from '../corpus/types';
import { useStore } from '../state/store';
import { HadithRefs } from './HadithRefs';
import { Sira } from './Sira';
import { Verdict } from './Verdict';

/**
 * The name, without the disagreement about it.
 *
 * 351 of the 8,123 records carry the rijāl literature's apparatus inside the
 * full name — `عبد الرحمن بن صخر ، وقيل : عبد الرحمن بن غنم ، وقيل : …`, which
 * for Abū Hurayra runs to fourteen alternatives and fills a phone screen before
 * a word of biography. The heading takes the reading up to the first `وقيل`;
 * the whole of it stays on the heading's title, and the variants the chains
 * actually use are listed further down the panel anyway.
 */
const APPARATUS = /\s*[،,]?\s*(?:ويقال|وقيل|وقال|:)\s/u;

function settledName(name: string): string {
  return name.split(APPARATUS)[0].trim();
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function NarratorPanel() {
  const focus = useStore((s) => s.focus);
  const narrators = useStore((s) => s.narrators);
  const bios = useStore((s) => s.bios);
  const books = useStore((s) => s.books);
  const setFocus = useStore((s) => s.setFocus);
  const setPins = useStore((s) => s.setPins);

  if (!focus) return null;
  const entry = narrators.get(focus);
  const bio = bios.get(focus);
  if (!entry) return null;

  const colour = GRADE_COLOR[entry.grade];
  const isProphet = focus === PROPHET_ID;
  const isCollector = focus.startsWith('collector:');

  return (
    <aside className="detail">
      {/*
        The way out rides along the top of the panel as it scrolls. It used to
        be positioned against the panel, which is the element that scrolls, so
        a long biography carried it off the screen and left no way to close at
        all — worst on a phone, where the panel is a sheet and the browser's
        own bar takes the bottom of it.
      */}
      <div className="detail__bar">
        <button className="detail__close" onClick={() => setFocus(undefined)} aria-label="Close">
          ×
        </button>
      </div>

      <header className="detail__head">
        <div className="detail__names">
          <h2 className="detail__ar" title={bio?.fullNameAr ?? entry.ar}>
            {settledName(bio?.fullNameAr ?? entry.ar)}
          </h2>
          {bio?.fullNameEn || entry.en ? (
            <p className="detail__en">{bio?.fullNameEn ?? entry.en}</p>
          ) : null}
        </div>
        {!isProphet && !isCollector ? (
          <span className="grade" style={{ ['--grade' as string]: colour }}>
            {GRADE_LABEL[entry.grade]}
            {entry.amb ? <em> · uncertain</em> : null}
          </span>
        ) : null}
      </header>

      {/*
        For the Prophet ﷺ every row below carries the same answer for the same
        reason — no grade, generation zero, every chain — and the hadiths
        passing through him are the whole corpus. So his panel gives the sīra
        in outline rather than restating the shape of the graph.
      */}
      {isProphet ? (
        <Sira chains={entry.n} />
      ) : (
        <>
          {bio?.note ? <p className="detail__note">{bio.note}</p> : null}

          <dl className="rows">
            <Row label="Kunya" value={bio?.kunya} />
            <Row label="Laqab" value={bio?.laqab} />
            <Row label="Nasab" value={bio?.nasab} />
            <Row label="Ṭabaqa" value={bio?.tabaqatAr} />
            <Row label="Settled in" value={bio?.city} />
            <Row label="Died" value={bio?.diedRaw ?? (entry.d ? `${entry.d} AH` : undefined)} />
            {/*
              Where no scholar graded a transmitter directly, the database
              records how the grade was arrived at instead. That is not a
              verdict and must not be labelled as one.
             */}
            <Row
              label={
                bio?.gradeAr?.includes('استنباط') ? 'Grading derived from' : 'Verdict in Arabic'
              }
              value={bio?.gradeAr}
            />
            <Row
              label="Generation"
              value={`${entry.gen} — ${GENERATION_SOURCE_LABEL[entry.gf] ?? 'from the chains'}`}
            />
            <Row
              label="In this corpus"
              value={`${entry.n.toLocaleString()} ${entry.n === 1 ? 'chain' : 'chains'}`}
            />
          </dl>

          {bio?.verdicts?.length ? (
            <section className="detail__section">
              <h3>Assessments in ʿilm ar-rijāl</h3>
              <ul className="verdicts">
                {bio.verdicts.map((verdict) => (
                  <Verdict key={verdict.key} verdict={verdict} />
                ))}
              </ul>
            </section>
          ) : null}

          {bio?.variants?.length && bio.variants.length > 1 ? (
            <section className="detail__section">
              <h3>Named in the chains as</h3>
              <p className="variants">{bio.variants.join(' · ')}</p>
            </section>
          ) : null}

          {bio?.teachers?.length || bio?.students?.length ? (
            <section className="detail__section">
              <h3>Transmission circle</h3>
              {bio.teachers?.length ? (
                <div className="circle">
                  <span className="circle__label">Heard from</span>
                  <div className="chips">
                    {bio.teachers.map((id) => (
                      <button key={id} className="chip" onClick={() => setFocus(id)}>
                        {narrators.get(id)?.ar ?? id}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {bio.students?.length ? (
                <div className="circle">
                  <span className="circle__label">Transmitted to</span>
                  <div className="chips">
                    {bio.students.map((id) => (
                      <button key={id} className="chip" onClick={() => setFocus(id)}>
                        {narrators.get(id)?.ar ?? id}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {bio?.books && Object.keys(bio.books).length ? (
            <section className="detail__section">
              <h3>Appears in</h3>
              <ul className="appearances">
                {Object.entries(bio.books)
                  .sort((a, b) => b[1] - a[1])
                  .map(([slug, count]) => (
                    <li key={slug}>
                      <span>{books.get(slug)?.titleEn ?? slug}</span>
                      <span className="appearances__count">{count.toLocaleString()}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          {bio?.hadiths?.length ? (
            <section className="detail__section">
              <div className="detail__sectionhead">
                <h3>Chains passing through</h3>
                <button className="link" onClick={() => setPins(bio.hadiths.slice(0, 60))}>
                  show only these
                </button>
              </div>
              <HadithRefs key={focus} ids={bio.hadiths} />
            </section>
          ) : null}
        </>
      )}
    </aside>
  );
}
