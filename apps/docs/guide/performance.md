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
| Native | 0.34 | 3.48 |
| **SurgiJS 0.3.0** | **0.44** | **4.25** |
| lit-html 3.3 | 0.53 | 4.90 |
| FAST Element 3.1 | 0.58 | 6.83 |
| Inferno 10 | 0.75 | 7.76 |
| Solid 1.9 | 0.77 | 7.45 |
| React 19 | 1.23 | 11.19 |
| Svelte 5 | 1.36 | 8.83 |
| Vue 3 | 1.71 | 18.52 |

10 000 rows:

| Library | init, ms | toggle all, ms | heap, MB | case bundle, KB gzip |
| --- | ---: | ---: | ---: | ---: |
| Native | 12.1 | 2.9 | 0.9 | 0.4 |
| **SurgiJS 0.3.0** | **14.9** | **2.7** | **1.9** | **3.1** |
| Solid | 15.3 | 4.6 | 6.8 | 5.4 |
| Inferno | 16.7 | 5.2 | 3.9 | 9.4 |
| Vue | 21.1 | 14.9 | 2.3 | 22.5 |
| Svelte | 26.6 | 7.4 | 10.7 | 19.3 |
| lit-html | 33.4 | 3.3 | 4.6 | 4.1 |
| FAST Element | 42.6 | 4.8 | 0.5 | 18.5 |
| React | 205.6 | 9.1 | 6.9 | 67.4 |

### Framework idioms

Each case uses the keyed-list pattern that the framework documents for this job, the same one the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) implementations use:

- Svelte: the list and each row's fields are `$state.raw`. Deep `$state` proxies every row on first access and made `init` 13 times slower (328 ms at 10 000 rows before the change).
- Vue: one component renders the list with `v-for`, `v-memo` and `shallowRef`. A component per row is faster for a single label change (0.07 ms against 4.0 ms here), but `redrawAll` is about twice as slow (35.9 ms against 18.5 ms at 10 000 rows), so the single-component form is what the bench reports.
## Bundle size

| Bundle | min + gzip |
| --- | ---: |
| full runtime (`export *`) | 5.9 KB |
| useState only | 0.5 KB |
| counter app (compiled) | 3.6 KB |
| dropdown app (compiled) | 5.3 KB |

`pnpm size` checks these on every pull request.
