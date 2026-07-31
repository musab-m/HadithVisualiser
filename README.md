# Isnād — a 3D atlas of the hadith corpus

Every hadith carries an **isnad**: the chain of people who passed the report down,
from the Prophet ﷺ to the scholar who wrote it in a book. This project reads those
chains out of the Arabic text of the collections, matches each name against the
biographical literature of **ʿilm ar-rijāl**, and draws the whole corpus as one
graph in three dimensions.

The Prophet ﷺ sits at the apex. Each layer below is a generation of transmitters
who heard from the layer above. The compilers — al-Bukhārī, Muslim, Mālik — are at
the floor. Click any narrator to read their biography, the verdicts classical
critics passed on them, who they heard from and taught, and the chains they carry.

You can look at one hadith, a chapter, several collections, or everything at once.

![The whole corpus: 49,821 chains through 8,204 narrators](docs/overview.png)

| One narrator | Three chains |
| --- | --- |
| ![A narrator's biography](docs/narrator.png) | ![Three individual chains](docs/single-chain.png) |

---

## Running it

```bash
npm install
npm run rijal:fetch          # ~124 MB of narrator profiles, fetched once into .cache/
npm run ingest -- --all      # or: npm run ingest -- bukhari muslim
npm run dev
```

`npm run build` produces a fully static site in `dist/` — no server, no API keys.

### The catalogue

```bash
npm run ingest -- --list
```

```
  ● bukhari                Sahih al-Bukhari                  7261/7277 chains
  ○ tirmidhi               Jami` at-Tirmidhi
  …
```

Sixteen collections are wired up, including the nine canonical books. Ingest them
one at a time; each writes its own directory and the narrator registry is rebuilt
across whatever is present. Adding Muslim never re-parses Bukhari.

---

## How a chain gets built

**1 — Parse.** `tools/ingest/isnad/parse.ts` walks the transmission verbs that
open every hadith (`حدثنا`, `أخبرني`, `سمعت`, `عن`, …), taking the span after each
one as a narrator and stopping when the chain reaches the Prophet ﷺ or when a span
stops reading like a name. Kin references (`عن أبيه`, `عن جده`) are resolved
through lookup tables; where they cannot be, the link is dropped rather than
guessed at. This recovers a chain from **99.8%** of Sahih al-Bukhari and **100%**
of Sahih Muslim.

**2 — Identify.** `tools/ingest/rijal/db.ts` matches each name against 115,735
narrator profiles and their 196,488 recorded name variants. This is the hard part:
isnads name people the way specialists would — `سفيان`, `الزهري`, `ابن شهاب` — and
hundreds of profiles can share a surface form. Chains are therefore resolved whole:
unambiguous links are fixed first, then the biographical teacher/student records,
the ṭabaqa ordering, and death dates decide the rest. A chain that reaches the
Prophet must end in a Companion, which alone rules out most namesakes.

**3 — Draw.** The vertical axis is generation, taken from where a narrator actually
sits across every chain they appear in. Horizontal position is relaxed in a worker:
nodes are pulled toward the people they transmit with and pushed off their
neighbours. Node colour is the transmitter's grade in the rijal literature.

### On accuracy

Parsing prose is inexact, and this is a heuristic over unstructured text rather
than a scholarly edition. Two things follow, and the app is built to show both:

- Where a name could refer to more than one figure and nothing in the chain
  separates them, the identification is marked **uncertain** in the panel instead
  of being presented as settled.
- Every node keeps the raw surface forms it was read from, listed under *named in
  the chains as*, so a reading can always be checked against the text.

Names that match nothing in the rijal literature are kept as nodes in their own
right, greyed and marked as unassessed, rather than being dropped or invented.

**This is a research and visualisation tool. It is not a source for legal rulings,
and a grade shown here is a database lookup, not a considered judgement on a
hadith's authenticity.**

---

## Layout

```
src/
  corpus/        the on-disk schema and a lazy loader for it
  graph/         selection → graph, and the layout worker
  scene/         three.js rendering: instanced nodes, additive edges, glow
  ui/            selection sidebar, biography panel, hadith reader
tools/ingest/
  books.ts       the catalogue — add a collection here
  isnad/         Arabic normalisation and the chain parser
  rijal/         the narrator database and the name resolver
  cli.ts         fetch → parse → identify → write
public/data/     generated corpus (committed, so the site is deployable as-is)
```

### Adding a collection

Add an entry to `BOOKS` in `tools/ingest/books.ts`:

```ts
{
  slug: 'tirmidhi',
  titleEn: "Jami` at-Tirmidhi",
  titleAr: 'جامع الترمذي',
  authorEn: 'Abū ʿĪsā al-Tirmidhī',
  authorAr: 'أبو عيسى الترمذي',
  authorDiedAH: 279,
  path: 'db/by_book/the_9_books/tirmidhi.json',
  gradesFrom: 'tirmidhi',        // optional per-hadith authenticity gradings
}
```

Then `npm run ingest -- tirmidhi`. Nothing else in the pipeline or the app is
book-specific. A collection from a different source needs only a function that
yields `{ idInBook, chapterId, arabic, english }` — the parser and resolver take
it from there.

---

## Data sources

This project does not digitise texts; it builds on open datasets and is grateful
to them.

| Source | Used for | Licence |
| --- | --- | --- |
| [hadith-json](https://github.com/AhmedBaset/hadith-json) (pinned at `v1.2.0`) | Arabic text and English translation of the collections, scraped from [sunnah.com](https://sunnah.com) | Hadith texts, public domain collections |
| [Itqan](https://github.com/R3GENESI5/Itqan) by Ali Bin Shahid | 115,735 narrator profiles consolidated from 22 classical works of ʿilm ar-rijāl; per-hadith gradings; the kinship and kunya lookup tables | Code MIT; data compiled from public-domain classical sources |

The verdicts shown in the biography panel come from the classical literature via
Itqan — Ibn Ḥajar's *Taqrīb al-Tahdhīb* and *Tahdhīb al-Tahdhīb*, al-Mizzī's
*Tahdhīb al-Kamāl*, Ibn Abī Ḥātim's *al-Jarḥ wa-l-Taʿdīl*, Ibn Ḥibbān's
*al-Thiqāt*, al-Dhahabī's *Mīzān al-Iʿtidāl*, *al-Kāshif* and *Siyar Aʿlām
al-Nubalāʾ*, Ibn Saʿd's *Ṭabaqāt*, Ibn ʿAdī's *al-Kāmil*, and others. Each is
attributed to its work and author where shown.

The isnad parser's approach, and the kinship and kunya tables it uses, follow
Itqan's `parse_isnad_chains.py`; the parser here is a separate implementation in
TypeScript that produces a chain per hadith rather than an aggregate per book.

`.cache/` holds the downloaded sources and is not committed. `public/data/` holds
the generated corpus and is.
