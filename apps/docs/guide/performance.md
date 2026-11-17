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
| Native | 0.35 | 3.63 |
| **SurgiJS 0.1.0** | **0.43** | **4.42** |
| lit-html 3.3 | 0.52 | 5.01 |
| FAST Element 3.1 | 0.59 | 6.74 |
| Inferno 10 | 0.76 | 7.40 |
| Solid 1.9 | 0.81 | 8.40 |
| React 19 | 1.21 | 12.46 |
| Svelte 5 | 1.97 | 17.78 |
| Vue 3 | 2.11 | 57.16 |

10 000 rows:

| Library | init, ms | toggle all, ms | heap, MB | case bundle, KB gzip |
| --- | ---: | ---: | ---: | ---: |
| Native | 12.1 | 2.9 | 0.9 | 0.4 |
| **SurgiJS** | **18.0** | **3.1** | **3.4** | **2.7** |
| Solid | 14.5 | 4.6 | 6.8 | 5.4 |
| Inferno | 17.3 | 5.3 | 3.9 | 9.4 |
| lit-html | 33.5 | 3.0 | 4.6 | 4.1 |
| FAST Element | 43.0 | 5.6 | 0.5 | 18.5 |
| Vue | 38.4 | 36.7 | 20.5 | 22.0 |
| React | 206.2 | 9.8 | 6.9 | 67.4 |
| Svelte | 348.0 | 17.6 | 11.3 | 19.3 |

## Bundle size

| Bundle | min + gzip |
| --- | ---: |
| full runtime (`export *`) | 5.5 KB |
| useState only | 0.6 KB |
| counter app (compiled) | 3.4 KB |
| dropdown app (compiled) | 4.9 KB |

`pnpm size` checks these on every pull request.
