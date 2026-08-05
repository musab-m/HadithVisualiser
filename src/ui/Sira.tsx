import { SIRA, SIRA_SOURCES } from './sira';

/**
 * The body of the panel when the node in focus is the Prophet ﷺ.
 *
 * Every other narrator's panel is a report on the corpus — grade, generation,
 * how many chains run through them. For him each of those has the same answer
 * for the same reason, so the panel says something a reader might actually not
 * know instead.
 */
export function Sira({ chains }: { chains: number }) {
  return (
    <>
      <p className="detail__note">
        He stands at the head of {chains.toLocaleString()} chains in this corpus. What follows is
        the outline of his life rather than a reading of the graph.
      </p>

      {SIRA.map((section) => (
        <section className="detail__section" key={section.heading}>
          <h3>{section.heading}</h3>

          {section.prose?.map((para) => (
            <p className="sira__p" key={para.slice(0, 40)}>
              {para}
            </p>
          ))}

          {section.rows?.length ? (
            <dl className="sira__rows">
              {section.rows.map((row) => (
                <div className="sira__row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {section.events?.length ? (
            <ol className="sira__events">
              {section.events.map((event) => (
                <li key={`${event.when} ${event.what}`}>
                  <span className="sira__when">{event.when}</span>
                  <span className="sira__what">
                    {event.what}
                    {event.note ? <em className="sira__note"> — {event.note}</em> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}

      <p className="sira__sources">{SIRA_SOURCES}</p>
    </>
  );
}
