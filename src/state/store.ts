import { create } from 'zustand';
import { loadBio, loadBook, loadManifest, loadNarratorIndex, loadText } from '../corpus/loader';
import type {
  BookFile,
  CorpusManifest,
  HadithRecord,
  HadithText,
  NarratorBio,
  NarratorIndexEntry,
} from '../corpus/types';
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
  setFocus: (id?: string) => void;
  setHover: (id?: string) => void;
  read: (hadithId?: string) => Promise<void>;
}

let worker: Worker | undefined;
let layoutToken = 0;

function ensureWorker(): Worker {
  worker ??= new Worker(new URL('../graph/layout.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

export const useStore = create<State>((set, get) => {
  /** Rebuild the graph from the current selection and lay it out. */
  const recompute = () => {
    const { books, narrators, activeBooks, activeChapters, pinned, matches } = get();
    if (!books.size) return;

    const selection: { book: BookFile; hadiths: HadithRecord[] }[] = [];

    // A hadith picked by hand beats a search, which beats whole collections.
    const explicit = pinned.length ? pinned : matches?.ids;

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

    const graph = buildGraph(selection, narrators);
    set({ graph, laying: true });

    const token = ++layoutToken;
    const instance = ensureWorker();
    instance.onmessage = (event: MessageEvent<LayoutResponse>) => {
      // A slower earlier layout must not overwrite a newer one.
      if (token !== layoutToken) return;
      set({ scene: { graph, layout: event.data }, laying: false });
    };
    instance.postMessage({
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
    bios: new Map(),
    texts: new Map(),
    laying: false,

    async init() {
      try {
        const [manifest, narrators] = await Promise.all([loadManifest(), loadNarratorIndex()]);
        const loaded = await Promise.all(manifest.books.map((b) => loadBook(b.slug)));
        const books = new Map(loaded.map((book) => [book.slug, book]));
        set({
          manifest,
          narrators,
          books,
          activeBooks: new Set(books.keys()),
          status: 'ready',
        });
        recompute();
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
        set({ matches, searching: false });
        recompute();
      } catch {
        set({ searching: false, matches: undefined });
      }
    },

    clearSearch() {
      set({ textQuery: '', matches: undefined, searching: false });
      recompute();
    },

    setFocus(id) {
      set({ focus: id });
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
      set({ reading: hadithId });
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
