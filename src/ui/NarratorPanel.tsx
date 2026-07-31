import { GRADE_COLOR, GRADE_LABEL, PROPHET_ID } from '../corpus/types';
import { useStore } from '../state/store';

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
  const read = useStore((s) => s.read);
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
      <button className="detail__close" onClick={() => setFocus(undefined)} aria-label="Close">
        ×
      </button>

      <header className="detail__head">
        <div className="detail__names">
          <h2 className="detail__ar">{bio?.fullNameAr ?? entry.ar}</h2>
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

      {bio?.note ? <p className="detail__note">{bio.note}</p> : null}

      <dl className="rows">
        <Row label="Kunya" value={bio?.kunya} />
        <Row label="Laqab" value={bio?.laqab} />
        <Row label="Nasab" value={bio?.nasab} />
        <Row label="Ṭabaqa" value={bio?.tabaqatAr} />
        <Row label="Settled in" value={bio?.city} />
        <Row label="Died" value={bio?.diedRaw ?? (entry.d ? `${entry.d} AH` : undefined)} />
        {/*
          Where no scholar graded a transmitter directly, the database records
          how the grade was arrived at instead. That is not a verdict and must
          not be labelled as one.
         */}
        <Row
          label={bio?.gradeAr?.includes('استنباط') ? 'Grading derived from' : 'Verdict in Arabic'}
          value={bio?.gradeAr}
        />
        <Row
          label="In this corpus"
          value={`${entry.n.toLocaleString()} ${entry.n === 1 ? 'chain' : 'chains'}, generation ${entry.gen}`}
        />
      </dl>

      {bio?.verdicts?.length ? (
        <section className="detail__section">
          <h3>Assessments in ʿilm ar-rijāl</h3>
          <ul className="verdicts">
            {bio.verdicts.map((verdict) => (
              <li key={verdict.key}>
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
                </div>
              </li>
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
          <ul className="hadiths">
            {bio.hadiths.slice(0, 40).map((id) => (
              <li key={id}>
                <button className="hadith-ref" onClick={() => void read(id)}>
                  {id}
                </button>
              </li>
            ))}
          </ul>
          {bio.hadiths.length > 40 ? (
            <p className="hint">and {(bio.hadiths.length - 40).toLocaleString()} more</p>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}
