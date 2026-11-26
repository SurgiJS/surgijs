import { createMemo, defineComponent, For, onCleanup, onMount, useState, type ReactiveProps } from 'surgijs';
import { createVirtualWindow } from './virtual';

export interface TileGridProps {
  /** Number of tiles. Default 200 000. */
  count?: number;
  /** Height of the scrolling area in pixels. Default 480. */
  height?: number;
}

const TILE = 96;
const GAP = 8;
const STEP = TILE + GAP;
const PAD = 8;

const css = `
  :host { display: block; font: 14px/1.4 system-ui, sans-serif; color: #1c1f26; }
  .grid { border: 1px solid #d5d9e0; border-radius: 8px; overflow: hidden; background: #fff; }
  .scroller { overflow-y: auto; overscroll-behavior: contain; }
  .spacer { position: relative; }
  .tile { position: absolute; top: 0; left: 0; width: ${TILE}px; height: ${TILE}px; box-sizing: border-box; display: grid; place-content: center; text-align: center; border-radius: 10px; font-variant-numeric: tabular-nums; }
  .tile[hidden] { display: none; }
  .tile b { font-size: 15px; }
  .tile small { color: rgb(0 0 0 / .55); }
  .footer { margin: 0; padding: .5rem .75rem; border-top: 1px solid #d5d9e0; color: #5b6270; font-size: 12px; }
`;

/**
 * Responsive tile grid. Columns follow the width; the rendered rows of tiles are a fixed pool that
 * scrolling reassigns, so the DOM holds about (visible rows + overscan) × columns tiles.
 */
export const TileGrid = (props: ReactiveProps<TileGridProps>) => {
  const { count, height } = props;
  const total = () => count() ?? 200_000;
  const viewport = () => height() ?? 480;
  const [width, setWidth] = useState(800);
  const cols = createMemo(() => Math.max(1, Math.floor((width() - 2 * PAD + GAP) / STEP)));
  const left = createMemo(() => Math.max(PAD, (width() - (cols() * STEP - GAP)) / 2));
  const lines = () => Math.ceil(total() / cols());
  const win = createVirtualWindow({ count: lines, size: STEP, viewport, offset: PAD });
  const slots = createMemo(() => Array.from({ length: win.slots().length * cols() }, (_, k) => k));
  let scroller: HTMLDivElement | undefined;

  onMount(() => {
    const el = scroller!;
    const measure = () => setWidth(el.clientWidth || 800);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="grid">
      <style>{css}</style>
      <div
        class="scroller"
        style={{ height: `${viewport()}px` }}
        ref={(el: HTMLDivElement) => (scroller = el)}
        onScroll={(e: Event) => win.setScrollTop((e.currentTarget as HTMLElement).scrollTop)}
      >
        <div class="spacer" style={{ height: `${lines() * STEP - GAP + 2 * PAD}px` }}>
          <For each={slots()}>
            {(k: number) => {
              const tile = createMemo(() => {
                const c = cols();
                return win.at(Math.floor(k / c)) * c + (k % c);
              });
              return (
                <div
                  class="tile"
                  hidden={tile() >= total()}
                  style={{
                    transform: `translate(${left() + (k % cols()) * STEP}px, ${PAD + Math.floor(tile() / cols()) * STEP}px)`,
                    background: `hsl(${(tile() * 47) % 360} 70% 88%)`,
                  }}
                >
                  <b>{String(tile() + 1)}</b>
                  <small>{`row ${Math.floor(tile() / cols()) + 1}`}</small>
                </div>
              );
            }}
          </For>
        </div>
      </div>
      <p class="footer">
        {String(slots().length)} of {total().toLocaleString('en-US')} tiles in the DOM · {String(cols())} columns
      </p>
    </div>
  );
};

export const UiTileGrid = defineComponent<TileGridProps>('ui-tile-grid', TileGrid, {
  count: Number,
  height: Number,
});
