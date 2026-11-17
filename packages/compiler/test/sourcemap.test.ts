import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.ts';
import { decodeMappings } from '../src/map.ts';

describe('source maps', () => {
  it('maps the generated JSX line to line 1', () => {
    const code = 'const n = 1;\nconst f = () => <b>{n}</b>;\n';
    const result = compile(code, { filename: 'f.tsx' });
    const map = JSON.parse(result.map!) as { sources: string[]; sourcesContent: string[]; mappings: string };
    expect(map.sources).toEqual(['f.tsx']);
    expect(map.sourcesContent).toEqual([code]);
    const lines = result.code.split('\n');
    const genLine = lines.findIndex((l) => l.startsWith('const f'));
    const seg = decodeMappings(map.mappings).find((s) => s[0] === genLine);
    expect(seg).toEqual([genLine, 0, 1, 0]);
  });

  it('maps copied code through getter inserts', () => {
    const code = 'const [a] = useState(0);\nconst x = a + a;\nconst el = <i>{a}</i>;\nconst y = 2;\n';
    const result = compile(code, { filename: 'g.tsx' });
    const lines = result.code.split('\n');
    const segs = decodeMappings((JSON.parse(result.map!) as { mappings: string }).mappings);
    const at = (prefix: string) => segs.find((s) => s[0] === lines.findIndex((l) => l.startsWith(prefix)));
    expect(at('const x')?.slice(2)).toEqual([1, 0]);
    expect(at('const y')?.slice(2)).toEqual([3, 0]);
  });

  it('emits one segment per generated line', () => {
    const code = 'const el = (\n  <div>\n    <b>{x()}</b>\n  </div>\n);\nconst z = 1;\n';
    const result = compile(code, { filename: 'h.tsx' });
    const segs = decodeMappings((JSON.parse(result.map!) as { mappings: string }).mappings);
    const perLine = new Map<number, number>();
    for (const s of segs) perLine.set(s[0], (perLine.get(s[0]) ?? 0) + 1);
    expect([...perLine.values()].every((n) => n === 1)).toBe(true);
  });
});
