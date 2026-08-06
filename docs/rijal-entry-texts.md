# Where the assessments come from, and why they are about to change

**Status:** decided, being built.
**Question:** the panel lists what the classical critics said about a narrator —
*Taqrīb al-Tahdhīb · Ibn Ḥajar · ثقة حافظ*. Should those cards open the entry
itself, in Arabic?

**Answer:** yes, and the text has to be ingested from the works, because we do
not have it today and cannot get it from where the rest of the rijāl data comes
from.

## What we hold now

Every assessment on screen comes from [Itqan](https://github.com/R3GENESI5/Itqan),
whose `profiles_*.json` give, per work:

```json
"classical_sources": {
  "taqrib": { "entry_id": 3030, "grade_en": "reliable", "grade_ar": "ثقة حافظ" }
}
```

Three fields, and the card already shows all three. `entry_id` points into
Itqan's own parse of the work; that parse is not published — `narrator_unified.json`
is gitignored as regenerable, and the repository carries no per-work entry files.
So a card that opened on click would have nothing further to open. The
`unique_key` field looks promising and is not: it is a deduplication key
(`name|d:death|k:kunya|t:teacher|s:student`), not the entry.

## The options that were weighed

**Link out to a search inside the work** on Shamela or Turath. An afternoon's
work, stays in Arabic, and gives the reader a way through to the text. Rejected
as the answer, kept as a possible stopgap: it hands the reader to a search box
rather than to the entry, it needs the site to stay up and keep its URL shape,
and it cannot be verified from this environment — the sandbox's proxy refuses
`shamela.ws`, `app.turath.io`, `dorar.net`, `islamweb.net` and
`hadith.islam-db.com` alike, so any link would ship unproven.

**Expand the card in place** with everything already held — the verdict phrase,
al-Dhahabī's own wording where the profile carries it, ṭabaqa, death notice.
Cheap and honest, and it adds a line or two to what is already visible. Not
worth a click.

**Ingest the entries from [OpenITI](https://github.com/OpenITI)** — the same
corpus Itqan parsed these 22 works from, public, machine-readable, Arabic. This
is what a reader means by *what the books actually say*: Ibn Ḥajar's sentence,
not one word lifted out of it. It is also the only option that works offline,
with no third party in the path, and keeps the project's rule that what is shown
is something we hold and can point at.

## What that costs, and where it can go wrong

The work is not the fetching. It is:

1. **Segmenting** each work into entries. OpenITI texts are mARkdown; entry
   boundaries are a per-work convention, not a schema.
2. **Aligning** entries to the 8,123 narrators in this corpus by name — the same
   problem the chain resolver already solves, with the same trap. `الزهري` is
   one name and several men.

The failure mode is the one that matters: **attaching one man's biography to
another**. A wrong grade is a wrong word; a wrong entry is a wrong life, quoted
at length under a heading that says the book said it. So this is built the way
the grade join was built — matched conservatively, measured against cases where
the answer is already known, and dropped where the match is not clear rather
than guessed. Nothing is displayed without naming the work, the author and the
edition it was taken from.

## How it is being built

**One work first: Taqrīb al-Tahdhīb.** 8,522 entries, the shortest of them, the
most cited, and the one whose grade we already hold from Itqan for the same
narrator — which makes it self-checking: where our alignment picks an entry
whose verdict disagrees with the grade Itqan read from the same work, one of the
two is wrong, and the rate at which that happens is the measurement.

Only once that rate is known does the rest follow. The remaining 21 works are
larger, later, and none of them is worth shipping on an alignment nobody has
measured.

## The prototype, and what it measures

Taqrīb is in OpenITI at `0875AH` (the corpus is split every 25 years, not every
hundred, so Ibn Ḥajar d. 852 sits under 875). Four versions are published; only
the one marked `.completed` — Muḥammad ʿAwwāma's edition, Dār al-Rashīd, 1406 —
carries the biography markup. It gives **8,522 entries**, exactly the count
Itqan reports for the work.

**Itqan's `entry_id` cannot be used as the join.** Its 8,975 citations of Taqrīb
use only 8,104 distinct ids, and a fifth of them land on a different man —
profile «أحمد بن أبي بكر … أبو مصعب الزهري» against the entry for «عبد الرحمن بن
عبد الله بن عمر». So the alignment is made here, from the names, in
`tools/ingest/rijal/align.ts`.

The rule that survived contact with the data:

| | |
| --- | --- |
| **Longest name wins** | `محمد بن مسلم بن عبيد الله بن عبد الله بن شهاب` is al-Zuhrī and `محمد بن مسلم بن تدرس` is Abū al-Zubayr, and the first three words are the same three words. |
| **Ṭabaqa and death veto, they do not vouch** | Silence is not evidence: Taqrīb gives Anas ibn Mālik no ṭabaqa at all, while a different Anas is called `صحابي` outright — so rewarding agreement handed the Prophet's servant to the wrong Companion. A *stated* ṭabaqa that contradicts the record is another matter. |
| **Ambiguity is refused** | Two entries answering a name equally well are two men, and neither is shown. |
| **An uncorroborated match needs five words of name** | Three words belong to several people and one of them is the wrong one. |

Two readings had to be got right before any of this worked. Arabic attaches the
conjunction — `ثلاث وسبعين` — so a year read word by word ends at its units
digit, and `3` against a death in `73` looks like two different men. And Taqrīb
routinely omits the century — al-Zuhrī `مات سنة خمس وعشرين`, meaning 125 — so a
reading under a hundred is a year whose century was not written.

### Where it stands

| | |
| ---: | --- |
| **5,192 of 7,410** | narrators in the corpus matched to an entry (70.1%) |
| **77.7%** | of narrator *appearances* covered — the busy ones match best |
| **94.8%** | of matches corroborated by the ṭabaqa or the death year the entry itself states |
| **96.1%** | agree with the entry Itqan cites, where Itqan cites one |

Spot-checked against the most-used narrators in the corpus, every one is right:
Abū Hurayra to `#8426 أبو هريرة الدوسي الصحابي الجليل`, al-Zuhrī to `#6296`,
Anas to `#565 خادم رسول الله ﷺ`, Ibn ʿUmar, Ibn ʿAbbās, Shuʿba, Sufyān al-Thawrī,
Mālik, Ibn Abī Shayba, Qutayba, Jābir, ʿUrwa.

The gap — three narrators in ten — is mostly men named in the chains too briefly
to be pinned to one entry, which is the same reason a quarter of the first
generation shows as unassessed. They will show what they show now.

## Still to do

1. Fetch the text at ingest, into `.cache/` beside the other sources, and record
   the edition with it.
2. Store the entry on the narrator's bio shard, which is already lazy-loaded, so
   the corpus that ships is not made heavier for readers who never open a card.
3. Make the card open it, in Arabic, with the work, the author and the edition
   named beneath.
4. Then the other 21 works, one at a time, each measured the same way before it
   ships.
