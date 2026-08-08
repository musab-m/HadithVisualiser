# Where the assessments come from, and why they are about to change

**Status:** built for Taqrīb al-Tahdhīb; the other 21 works follow one at a time.
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
2. **Aligning** entries to the 7,589 narrators in this corpus by name — the same
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
| **Ambiguity is refused, unless the rest of the identity parts them** | Two entries answering a name equally well are two men. Where the nasab, laqab or town settles which is which, it decides — but only on a mark that is *exclusive* to one of them and *rare* in the work. |
| **An uncorroborated match needs five words of name** | Three words belong to several people and one of them is the wrong one. |

Four readings had to be got right before any of this worked, because a year
misread does not merely fail to corroborate — it *vetoes*, and throws out the
right entry.

- Arabic attaches the conjunction — `ثلاث وسبعين` — so a year read word by word
  ends at its units digit, and `3` against a death in `73` looks like two men.
- Taqrīb routinely omits the century — al-Zuhrī `مات سنة خمس وعشرين`, meaning
  125 — so a reading under a hundred is a year whose century was not written.
- The teens are a unit *plus* ten: `سبع عشرة` is 17, not 7 and then 10. Taking
  the later word alone read it as 10, and `مات سنة سبع عشرة` then contradicted a
  death on file in 117.
- The age at death follows the year — `مات سنة سبع عشرة وله ثمانون سنة` — and
  reading on adds it in: 7 + 10 + 80. That is how ʿUmar ibn al-Ḥakam ibn Thawbān
  lost his own entry, #4882, to the man printed after him.

### Where it stands

| | |
| ---: | --- |
| **5,410 of 7,297** | narrators in the corpus matched to an entry (74.1%) |
| **83.9%** | of narrator *appearances* covered — the busy ones match best |
| **95.1%** | of matches corroborated by the ṭabaqa or the death year the entry itself states |
| **96.9%** | agree with the entry Itqan cites, where Itqan cites one |

Each rule was measured on its own before it was kept:

| | matched | appearances | agreement |
| --- | ---: | ---: | ---: |
| name, ṭabaqa and death alone | 5,192 | 77.1% | 97.0% |
| + the two year-reading fixes | 5,295 | 81.5% | 97.0% |
| + tie-breaking on the identity | **5,446** | **83.5%** | 96.9% |

That table, and the two agreement figures above it, were measured while the
corpus still held the five citation collections — 8,123 narrators rather than
7,589. They are properties of the alignment rule rather than of the book list,
and re-running the discarded variants to restate them would prove nothing the
rule has not already been kept for. The headline row is restated above against
the corpus as it now stands.

The tie-breaker was tried twice and rejected once. Counting any exclusive mark
added 261 matches and several plainly wrong ones: `عبد الملك بن عمير`, 191
chains, took the entry of a *majhūl*, and `حبيب بن أبي ثابت` — `ثقة` — took
`حبيب بن النعمان الأسدي`, `مقبول`, on the strength of `الأسدي` alone. Weighing a
mark by how much of the book it fails to describe is what fixed it: `الأسدي`
stands in hundreds of lives and decides nothing, `النصري` in nineteen and
decides. Ranks are excluded outright — `الحافظ` is rare enough in Taqrīb to look
decisive while saying only what a man did.

The cost of that caution is real and worth naming: `حفص بن غياث`, 208 chains,
is no longer matched, because Taqrīb writes his name with a spelling gloss
inside it — `حفص بن غياث بمعجمة مكسورة وياء ومثلثة بن طلق` — and only `القاضي`
remained to part him from the other Ḥafṣes. A missing entry is the cheaper
failure.

Spot-checked against the most-used narrators in the corpus, every one is right:
Abū Hurayra to `#8426 أبو هريرة الدوسي الصحابي الجليل`, al-Zuhrī to `#6296`,
Anas to `#565 خادم رسول الله ﷺ`, Ibn ʿUmar, Ibn ʿAbbās, Shuʿba, Sufyān al-Thawrī,
Mālik, Ibn Abī Shayba, Qutayba, Jābir, ʿUrwa.

The gap — three narrators in ten — is mostly men named in the chains too briefly
to be pinned to one entry, which is the same reason a quarter of the first
generation shows as unassessed. They will show what they show now.

## What shipped

The text is fetched at ingest into `.cache/works/` beside the other sources,
aligned over only the profiles this corpus uses, and hung on the verdict for the
work it came from. It lands on the bio shard, which is already fetched only when
a narrator is opened, so the corpus a reader downloads to look at the graph is
unchanged; the shards grew from 13 MB to 15 MB for the readers who do open one (14 MB
since the citation collections came out).

**5,410 narrators carry an entry.** For 3,243 it enriches a card that was already
there; for **2,167 the entry is the whole card** — Ibn Ḥajar has a life of him
and Itqan extracted no verdict from it. Binding the text to the verdicts alone
would have thrown those away for want of a row to sit in.

The card opens on a click and the entry is set in Arabic at reading size, with
its number in the edition and the edition itself beneath it. It is not
translated: rendering `صدوق يهم` into English means choosing what it comes out
as, and that choice is the whole content of the judgement.

A card that *cannot* open says why, because an inert card is otherwise
indistinguishable from a broken one. There are two reasons and they are
different facts: **not yet read in full** — the work is one of the 21 still to
come — and **not identified in this work**, which is Taqrīb read through
without him being pinned to one entry. 277 cards carry the second.

## Still to do

The other 21 works, one at a time, each measured the way this one was before it
ships. Taqrīb is the easiest of them — short entries, one man each, and a number
printed against every one. Tahdhīb al-Tahdhīb and Tahdhīb al-Kamāl run to
paragraphs and pages, and al-Iṣāba and the Ṭabaqāt segment differently again, so
each needs its own reading of the markup before any of it is worth aligning.
