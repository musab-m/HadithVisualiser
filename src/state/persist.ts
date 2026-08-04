/**
 * Remembering what the viewer was looking at.
 *
 * Arriving at a question — this wording, in these two collections, only the
 * chains through this man — takes a dozen deliberate choices, and a refresh
 * used to throw all of them away. What is saved is the *question*, not the
 * answer: the query rather than the hadiths it matched, the book slugs rather
 * than the graph. Everything else is rebuilt from the corpus on load, so a
 * saved view stays valid when a collection is re-ingested and the ids move.
 */

const KEY = 'isnad:view';

/**
 * Bumped when the shape below changes. An older payload is dropped rather
 * than migrated: the cost of guessing wrong is a view the viewer did not ask
 * for, and the cost of dropping it is one lost session.
 */
const VERSION = 2;

export interface SavedView {
  v: number;
  /** Book slugs in scope. */
  books: string[];
  /** Chapter ids per book, for books narrowed to chapters. */
  chapters: [string, number[]][];
  /** Individually chosen hadith ids. */
  pinned: string[];
  /** The wording being traced. Re-run on load; the hits are not stored. */
  query: string;
  phraseOnly: boolean;
  /** Narrators every drawn chain has to pass through. */
  isolated: string[];
  /** The biography that was open. */
  focus?: string;
}

export function loadView(): SavedView | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as SavedView;
    if (saved?.v !== VERSION || !Array.isArray(saved.books)) return undefined;
    return saved;
  } catch {
    // Unparseable, or storage is unavailable — Safari's private mode throws on
    // read. Either way there is nothing to restore, which is not an error.
    return undefined;
  }
}

export function saveView(view: Omit<SavedView, 'v'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...view }));
  } catch {
    // Storage disabled or full. The session still works; it just will not
    // survive a refresh, and saying so would be noise.
  }
}

export function clearView(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* as above */
  }
}
