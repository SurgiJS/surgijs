/** Modules imported with `?ssr` are compiled by the Vite plugin with `generate: 'ssr'`. */
declare module '*?ssr' {
  const views: { readonly [name: string]: ((props: { readonly [key: string]: () => unknown }) => string) | undefined };
  export = views;
}
