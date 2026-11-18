# Performance

## Method

`pnpm bench [ids...] [--rows N]` bundles each case as a minified production build, serves it locally and drives headless Chrome over the DevTools protocol (`--headless=new --js-flags=--expose-gc --enable-precise-memory-info`). The page is cross-origin isolated, so `performance.now()` has 5 µs precision.

Each row is `<div class="row"><span class="id">…</span><span class="label">…</span></div>`. Scenarios:

| Scenario | Work |
| --- | --- |
| init | create all rows |
| init+layout | create all rows and force layout |
| redrawOne | change one label |
| redrawAll | change every label |
| redrawAll+layout | change every label and force layout |
| toggleOne | toggle the class of one row |
| toggleAll | toggle the class of every row |

Every sample runs on a fresh mount after `gc()`. The reported number is the median of 21 runs after 4 warmups. The clock includes the library's commit: a microtask flush for SurgiJS, `nextTick` for Vue, `flushSync` for React and Svelte, `Updates.process()` for FAST. Memory reports the retained heap after `gc()` (median of 9) and the heap allocated by one full redraw. Before timing, the harness checks the rendered DOM after every operation.

Cases: native DOM, SurgiJS (signals per row), Solid, Inferno, lit-html, FAST Element (light DOM, `repeat`, observable row fields), Svelte 5, Vue 3, React 19. Results land in `bench/results.json` (1000 rows) and `bench/results-N.json`. A run with a subset of ids writes only those libraries to the results file.

## Results

Chrome 157, headless, Linux VM.

Change every label, ms:

| Library | 1 000 | 10 000 |
| --- | ---: | ---: |
| Native | 0.34 | 3.38 |
| **SurgiJS 0.1.0** | **0.41** | **3.97** |
| lit-html 3.3 | 0.54 | 5.02 |
| FAST Element 3.1 | 0.58 | 5.67 |
| Solid 1.9 | 0.83 | 6.98 |
| Inferno 10 | 0.77 | 7.58 |
| React 19 | 1.21 | 11.32 |
| Svelte 5 | 2.69 | 14.65 |
| Vue 3 | 2.18 | 30.61 |

10 000 rows:

| Library | init, ms | toggle all, ms | heap, MB | case bundle, KB gzip |
| --- | ---: | ---: | ---: | ---: |
| Native | 12.1 | 2.8 | 0.9 | 0.4 |
| Solid | 14.4 | 4.6 | 6.8 | 5.4 |
| **SurgiJS** | **14.7** | **2.4** | **1.8** | **2.9** |
| Inferno | 16.8 | 5.5 | 3.9 | 9.4 |
| Vue | 29.6 | 25.3 | 20.5 | 22.0 |
| lit-html | 34.0 | 3.1 | 4.6 | 4.1 |
| FAST Element | 43.8 | 4.4 | 0.5 | 18.5 |
| React | 204.0 | 9.1 | 6.9 | 67.4 |
| Svelte | 336.9 | 12.6 | 11.2 | 19.3 |

## Bundle size

| Bundle | min + gzip |
| --- | ---: |
| full runtime (`export *`) | 5.6 KB |
| useState only | 0.7 KB |
| counter app (compiled) | 3.5 KB |
| dropdown app (compiled) | 5.0 KB |

`pnpm size` checks these on every pull request.
