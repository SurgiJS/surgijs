import { compile } from '@surgijs/compiler';

/**
 * Compiles SurgiJS JSX before Next's own transforms. `?ssr` imports compile for the server
 * (element trees for `@surgijs/core/server`), everything else for the DOM.
 */
export default function surgiLoader(source) {
  const callback = this.async();
  const generate = /(^|&)ssr(&|=|$)/.test(this.resourceQuery.slice(1)) ? 'ssr' : 'dom';
  try {
    const result = compile(source, { filename: this.resourcePath, generate });
    for (const w of result.warnings) this.emitWarning(new Error(`${this.resourcePath}:${w.line}:${w.column} ${w.message}`));
    callback(null, result.code, result.changed && result.map ? JSON.parse(result.map) : undefined);
  } catch (err) {
    callback(err);
  }
}
