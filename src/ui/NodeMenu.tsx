import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

/** Keep the menu clear of the viewport edges by this much. */
const MARGIN = 12;

/**
 * What can be done with one narrator, opened by a right-click or a long press.
 *
 * The graph answers "who transmitted this" well and "what did this narrator
 * carry" badly: at corpus scale a busy one is a bright knot with several thousand
 * lines through it, and no amount of rotating separates their chains from the
 * ones merely passing nearby. Isolating rebuilds the graph from only the
 * hadiths whose chain runs through them, which turns that knot into a shape you
 * can read — and stacks, so two narrators together answer whether any chain
 * joins them at all.
 */
export function NodeMenu() {
  const menu = useStore((s) => s.menu);
  const closeMenu = useStore((s) => s.closeMenu);
  const narrators = useStore((s) => s.narrators);
  const graph = useStore((s) => s.graph);
  const isolated = useStore((s) => s.isolated);
  const isolate = useStore((s) => s.isolate);
  const release = useStore((s) => s.release);
  const clearIsolation = useStore((s) => s.clearIsolation);
  const setFocus = useStore((s) => s.setFocus);

  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | undefined>(undefined);

  // Measure, then place: a menu opened near the right edge or low on a phone
  // has to come back on screen, and that cannot be known before it is rendered.
  useLayoutEffect(() => {
    const element = box.current;
    if (!menu || !element) {
      setAt(undefined);
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    const x = Math.min(Math.max(menu.x, MARGIN), Math.max(window.innerWidth - width - MARGIN, MARGIN));
    const y = Math.min(Math.max(menu.y, MARGIN), Math.max(window.innerHeight - height - MARGIN, MARGIN));
    setAt({ x, y });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) closeMenu();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    // Capture, so the dismissal beats anything the graph does with the click.
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menu, closeMenu]);

  if (!menu) return null;

  const entry = narrators.get(menu.id);
  const node = graph?.index.get(menu.id);
  const through = node === undefined ? 0 : graph?.weight[node] ?? 0;
  const already = isolated.includes(menu.id);
  const name = entry?.ar ?? menu.id;

  return (
    <div
      ref={box}
      className="menu"
      // Hidden until measured, rather than flashed at the pointer and moved.
      style={{ left: at?.x ?? 0, top: at?.y ?? 0, visibility: at ? 'visible' : 'hidden' }}
      role="menu"
    >
      <div className="menu__head">
        <span className="menu__ar">{name}</span>
        {entry?.en ? <span className="menu__en">{entry.en}</span> : null}
        <span className="menu__n">
          on {through.toLocaleString()} of the chains shown
        </span>
      </div>

      <button className="menu__item" role="menuitem" onClick={() => isolate(menu.id)}>
        only the chains through this narrator
      </button>

      {isolated.length && !already ? (
        <button className="menu__item" role="menuitem" onClick={() => isolate(menu.id, true)}>
          narrow further — and through this one
        </button>
      ) : null}

      {already ? (
        <button className="menu__item" role="menuitem" onClick={() => release(menu.id)}>
          stop requiring this narrator
        </button>
      ) : null}

      {isolated.length ? (
        <button className="menu__item" role="menuitem" onClick={clearIsolation}>
          show every chain again
        </button>
      ) : null}

      <button
        className="menu__item menu__item--quiet"
        role="menuitem"
        onClick={() => {
          setFocus(menu.id);
          closeMenu();
        }}
      >
        open the biography
      </button>
    </div>
  );
}
