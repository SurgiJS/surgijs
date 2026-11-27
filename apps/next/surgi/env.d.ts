/** Modules imported with `?ssr` are compiled by the loader with `generate: 'ssr'`: views return HTML strings. */
declare module '*?ssr' {
  const views: { readonly [name: string]: ((props: { readonly [key: string]: () => unknown }) => string) | undefined };
  export = views;
}
