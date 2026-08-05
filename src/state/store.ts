import { create } from 'zustand';
import { loadBio, loadBook, loadManifest, loadNarratorIndex, loadText } from '../corpus/loader';
import { collectorId, PROPHET_ID } from '../corpus/types';
import type {
  BookFile,
  CorpusManifest,
  HadithRecord,
  HadithText,
  NarratorBio,
  NarratorIndexEntry,
} from '../corpus/types';
import { loadView, saveView } from './persist';
import { buildGraph, type GraphData } from '../graph/build';
import { search as runTextSearch, type SearchResult } from '../search/client';
import type { LayoutBand, LayoutResponse } from '../graph/layout.worker';

export interface LayoutResult {
  positions: Float32Array;
  radius: number;
  height: number;
  spacing: number;
  bands: LayoutBand[];
}

interface State {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  manifest?: CorpusManifest;
  narrators: Map<string, NarratorIndexEntry>;
  books: Map<string, BookFile>;

  /** Books whose hadiths are in scope. */
  activeBooks: Set<string>;
  /** Chapters to narrow to, per book. Empty means the whole book. */
  activeChapters: Map<string, Set<number>>;
  /** Individually chosen hadiths. When non-empty these are the whole graph. */
  pinned: string[];
  /** The wording being traced, and every hadith reporting it. */
  textQuery: string;
  matches?: SearchResult;
  searching: boolean;
  /** Narrow a search to the reports carrying the query as a phrase. */
  phraseOnly: boolean;
  /**
   * Narrators every drawn chain has to run through.
   *
   * A lens over whatever else is selected rather than a selection of its own,
   * so it composes: the chains for this wording, in these two collections,
   * that passed through this man. With more than one narrator the chain has to
   * carry all of them, which is how you ask whether a route between two people
   * exists at all.
   */
  isolated: string[];

  /** The narrator menu, and where on screen it was opened. */
  menu?: { id: string; x: number; y: number };

  /** The current selection's graph. Drives the counts in the sidebar. */
  graph?: GraphData;
  /**
   * The graph the layout below was computed for, and its positions.
   *
   * These travel together and are never set apart. Node indices are only
   * meaningful against the graph that produced them, so pairing a new graph
   * with stale positions puts every narrator at someone else's coordinates —
   * and hover, which resolves a name from the index the raycast returns, then
   * reports the wrong person entirely.
   */
  scene?: { graph: GraphData; layout: LayoutResult };
  laying: boolean;

  focus?: string;
  hover?: string;
  /**
   * Which of the two sheets was opened most recently.
   *
   * On a phone the biography and the hadith reader occupy the same space, and
   * each opens the other: a name in a chain opens the biography, a reference
   * under "chains passing through" opens the reader. Whichever was asked for
   * last has to be the one on top, or the answer to a tap arrives underneath
   * what you were already looking at and reads as nothing having happened.
   */
  topSheet?: 'detail' | 'reader';
  bios: Map<string, NarratorBio>;
  texts: Map<string, HadithText>;
  reading?: string;

  init: () => Promise<void>;
  toggleBook: (slug: string) => void;
  setAllBooks: (on: boolean) => void;
  toggleChapter: (slug: string, chapterId: number) => void;
  clearChapters: (slug: string) => void;
  pin: (hadithId: string) => void;
  unpin: (hadithId: string) => void;
  clearPins: () => void;
  setPins: (ids: string[]) => void;
  runSearch: (query: string) => Promise<void>;
  clearSearch: () => void;
  setPhraseOnly: (on: boolean) => void;
  isolate: (narratorId: string, alsoThrough?: boolean) => void;
  release: (narratorId: string) => void;
  clearIsolation: () => void;
  openMenu: (narratorId: string, x: number, y: number) => void;
  closeMenu: () => void;
  setFocus: (id?: string) => void;
  setHover: (id?: string) => void;
  read: (hadithId?: string) => Promise<void>;
}

let worker: Worker | undefined;
let layoutToken = 0;
/** Whether a layout is in flight, so a superseded one can be abandoned. */
let running = false;

function ensureWorker(): Worker {
  worker ??= new Worker(new URL('../graph/layout.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

/**
 * Give up on a layout that is still running.
 *
 * The worker takes one message at a time and a full-corpus relaxation is a
 * second or two of solid work, so unchecking three books in a row queues three
 * of them — the newest selection waits behind two results that will be thrown
 * away. There is no way to interrupt a worker mid-loop; terminating it is the
 * interrupt, and starting a fresh one costs nothing next to the work avoided.
 */
function abandonLayout(): void {
  if (!running) return;
  worker?.terminate();
  worker = undefined;
  running = false;
}

/**
 * Whether a hadith's drawn path runs through every one of `through`.
 *
 * The path is the Prophet, the chain, then the compiler — the same three parts
 * the graph is built from, so isolating on a node always keeps the chains that
 * visibly touch it. The Prophet and the compiler are not in the stored chain
 * but are on every path that book contributes, and are matched accordingly.
 */
function passesThrough(hadith: HadithRecord, bookSlug: string, through: string[]): boolean {
  const collector = collectorId(bookSlug);
  return through.every(
    (id) => id === PROPHET_ID || id === collector || hadith.chain.includes(id),
  );
}

export const useStore = create<State>((set, get) => {
  /** Write the current question to storage, so a refresh does not lose it. */
  const remember = () => {
    const { activeBooks, activeChapters, pinned, textQuery, phraseOnly, isolated, focus } = get();
    saveView({
      books: [...activeBooks],
      chapters: [...activeChapters]
        .filter(([, ids]) => ids.size)
        .map(([slug, ids]) => [slug, [...ids]] as [string, number[]]),
      pinned,
      query: textQuery,
      phraseOnly,
      isolated,
      focus,
    });
  };

  /** Rebuild the graph from the current selection and lay it out. */
  const recompute = () => {
    const { books, narrators, activeBooks, activeChapters, pinned, matches, phraseOnly, isolated } =
      get();
    if (!books.size) return;
    remember();

    const selection: { book: BookFile; hadiths: HadithRecord[] }[] = [];

    // A hadith picked by hand beats a search, which beats whole collections.
    const found = phraseOnly ? matches?.phraseIds : matches?.ids;
    const explicit = pinned.length ? pinned : found;

    if (explicit?.length) {
      const wanted = new Set(explicit);
      for (const book of books.values()) {
        const hadiths = book.hadiths.filter((h) => wanted.has(h.id));
        if (hadiths.length) selection.push({ book, hadiths });
      }
    } else {
      for (const slug of activeBooks) {
        const book = books.get(slug);
        if (!book) continue;
        const chapters = activeChapters.get(slug);
        const hadiths = chapters?.size
          ? book.hadiths.filter((h) => h.chapterId !== undefined && chapters.has(h.chapterId))
          : book.hadiths;
        if (hadiths.length) selection.push({ book, hadiths });
      }
    }

    // Isolation applies last, over whatever the selection turned out to be, so
    // it narrows a search and a set of collections alike instead of replacing
    // them.
    const drawn = isolated.length
      ? selection
          .map(({ book, hadiths }) => ({
            book,
            hadiths: hadiths.filter((h) => passesThrough(h, book.slug, isolated)),
          }))
          .filter(({ hadiths }) => hadiths.length)
      : selection;

    const graph = buildGraph(drawn, narrators);
    set({ graph, laying: true });

    const token = ++layoutToken;
    abandonLayout();
    running = true;
    const instance = ensureWorker();
    instance.onmessage = (event: MessageEvent<LayoutResponse>) => {
      // Compare the token the worker echoed, not the one this closure captured.
      // The handler is replaced on every recompute, so only the newest one ever
      // runs, and checking its own token against the newest request compares a
      // request with itself — it can never fail. An earlier result would then be
      // paired with the latest graph, putting every narrator at someone else's
      // coordinates, or blowing up outright when the two disagree on how many
      // narrators there are.
      if (event.data.token !== layoutToken) return;
      running = false;
      set({ scene: { graph, layout: event.data }, laying: false });
    };
    instance.postMessage({
      token,
      gen: graph.gen,
      genExact: graph.genExact,
      weight: graph.weight,
      edges: graph.edges,
      edgeWeight: graph.edgeWeight,
      iterations: graph.ids.length > 6000 ? 140 : 240,
    });
  };

  return {
    status: 'loading',
    narrators: new Map(),
    books: new Map(),
    activeBooks: new Set(),
    activeChapters: new Map(),
    pinned: [],
    textQuery: '',
    searching: false,
    phraseOnly: false,
    isolated: [],
    bios: new Map(),
    texts: new Map(),
    laying: false,

    async init() {
      try {
        const [manifest, narrators] = await Promise.all([loadManifest(), loadNarratorIndex()]);
        const loaded = await Promise.all(manifest.books.map((b) => loadBook(b.slug)));
        const books = new Map(loaded.map((book) => [book.slug, book]));

        // Restore the last view, but only the parts the corpus still supports:
        // a collection can be re-ingested or dropped between visits, and a
        // stale slug would silently select nothing.
        const saved = loadView();
        const restored = saved?.books.filter((slug) => books.has(slug)) ?? [];
        const chapters = new Map<string, Set<number>>();
        for (const [slug, ids] of saved?.chapters ?? []) {
          if (books.has(slug) && ids.length) chapters.set(slug, new Set(ids));
        }
        const known = new Set(narrators.keys());

        set({
          manifest,
          narrators,
          books,
          // An empty saved list means the viewer had turned everything off,
          // which is worth honouring; no saved view at all means a first visit.
          activeBooks: new Set(saved ? restored : books.keys()),
          activeChapters: chapters,
          pinned: saved?.pinned.filter((id) => books.has(id.split(':')[0])) ?? [],
          isolated: saved?.isolated.filter((id) => known.has(id)) ?? [],
          focus: saved?.focus && known.has(saved.focus) ? saved.focus : undefined,
          status: 'ready',
        });

        if (saved?.focus) get().setFocus(saved.focus);

        // The hits themselves are not stored — they are whatever the index says
        // today — so a restored query is simply run again. It recomputes on its
        // own, which is why this branch does not.
        if (saved?.query.trim()) {
          void get()
            .runSearch(saved.query)
            .then(() => {
              if (saved.phraseOnly) get().setPhraseOnly(true);
            });
        } else {
          recompute();
        }
      } catch (error) {
        set({
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'The corpus could not be loaded. Run `npm run ingest -- --all` to generate it.',
        });
      }
    },

    toggleBook(slug) {
      const activeBooks = new Set(get().activeBooks);
      if (activeBooks.has(slug)) activeBooks.delete(slug);
      else activeBooks.add(slug);
      set({ activeBooks, pinned: [], matches: undefined, textQuery: '' });
      recompute();
    },

    setAllBooks(on) {
      set({
        activeBooks: on ? new Set(get().books.keys()) : new Set(),
        activeChapters: new Map(),
        pinned: [],
        matches: undefined,
        textQuery: '',
      });
      recompute();
    },

    toggleChapter(slug, chapterId) {
      const activeChapters = new Map(get().activeChapters);
      const chapters = new Set(activeChapters.get(slug) ?? []);
      if (chapters.has(chapterId)) chapters.delete(chapterId);
      else chapters.add(chapterId);
      activeChapters.set(slug, chapters);
      const activeBooks = new Set(get().activeBooks);
      if (chapters.size) activeBooks.add(slug);
      set({ activeChapters, activeBooks, pinned: [], matches: undefined, textQuery: '' });
      recompute();
    },

    clearChapters(slug) {
      const activeChapters = new Map(get().activeChapters);
      activeChapters.delete(slug);
      set({ activeChapters, pinned: [], matches: undefined, textQuery: '' });
      recompute();
    },

    pin(hadithId) {
      if (get().pinned.includes(hadithId)) return;
      set({ pinned: [...get().pinned, hadithId] });
      recompute();
    },

    unpin(hadithId) {
      set({ pinned: get().pinned.filter((id) => id !== hadithId) });
      recompute();
    },

    clearPins() {
      set({ pinned: [] });
      recompute();
    },

    setPins(ids) {
      set({ pinned: ids });
      recompute();
    },

    async runSearch(query) {
      const { manifest, books } = get();
      set({ textQuery: query });
      if (!manifest?.search || !query.trim()) {
        set({ matches: undefined, searching: false });
        recompute();
        return;
      }
      set({ searching: true });
      try {
        const matches = await runTextSearch(query, manifest.search, books);
        // A query the user has already moved on from must not land.
        if (get().textQuery !== query) return;
        set({ matches, searching: false, phraseOnly: false });
        recompute();
      } catch {
        set({ searching: false, matches: undefined });
      }
    },

    clearSearch() {
      set({ textQuery: '', matches: undefined, searching: false, phraseOnly: false });
      recompute();
    },

    setPhraseOnly(on) {
      set({ phraseOnly: on });
      recompute();
    },

    isolate(narratorId, alsoThrough = false) {
      const current = get().isolated;
      const isolated = alsoThrough
        ? [...current.filter((id) => id !== narratorId), narratorId]
        : [narratorId];
      set({ isolated, menu: undefined });
      recompute();
    },

    release(narratorId) {
      set({ isolated: get().isolated.filter((id) => id !== narratorId), menu: undefined });
      recompute();
    },

    clearIsolation() {
      set({ isolated: [], menu: undefined });
      recompute();
    },

    openMenu(narratorId, x, y) {
      set({ menu: { id: narratorId, x, y } });
    },

    closeMenu() {
      if (get().menu) set({ menu: undefined });
    },

    setFocus(id) {
      set({ focus: id, topSheet: id ? 'detail' : get().topSheet });
      remember();
      const { manifest, bios } = get();
      if (!id || !manifest || bios.has(id)) return;
      void loadBio(id, manifest.bioShards).then((bio) => {
        if (!bio) return;
        const next = new Map(get().bios);
        next.set(id, bio);
        set({ bios: next });
      });
    },

    setHover(id) {
      if (get().hover !== id) set({ hover: id });
    },

    async read(hadithId) {
      set({ reading: hadithId, topSheet: hadithId ? 'reader' : get().topSheet });
      if (!hadithId || get().texts.has(hadithId)) return;
      const slug = hadithId.split(':')[0];
      const book = get().books.get(slug);
      const record = book?.hadiths.find((h) => h.id === hadithId);
      if (!book || !record) return;
      const texts = await loadText(slug, record.t);
      const next = new Map(get().texts);
      for (const [id, text] of Object.entries(texts)) next.set(id, text);
      set({ texts: next });
    },
  };
});
