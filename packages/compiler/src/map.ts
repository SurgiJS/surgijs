const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(n: number): string {
  let v = n < 0 ? (-n << 1) | 1 : n << 1;
  let s = '';
  do {
    let d = v & 31;
    v >>>= 5;
    if (v) d |= 32;
    s += B64[d];
  } while (v);
  return s;
}

/** Offsets of line starts in `text`. */
export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}

export function lineCol(starts: readonly number[], pos: number): [line: number, col: number] {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= pos) lo = mid;
    else hi = mid - 1;
  }
  return [lo, pos - starts[lo]!];
}

/**
 * Source map v3 with one segment at column 0 of every generated line.
 * `lines[i]` is the original `[line, col]` for generated line `i`, or `null`.
 */
export function encodeMap(file: string, content: string, lines: readonly ([number, number] | null)[]): string {
  let prevLine = 0;
  let prevCol = 0;
  const mappings = lines
    .map((l) => {
      if (!l) return '';
      const seg = vlq(0) + vlq(0) + vlq(l[0] - prevLine) + vlq(l[1] - prevCol);
      prevLine = l[0];
      prevCol = l[1];
      return seg;
    })
    .join(';');
  return JSON.stringify({
    version: 3,
    file: file.replace(/^.*[\\/]/, ''),
    sources: [file],
    sourcesContent: [content],
    names: [],
    mappings,
  });
}

/** Decodes `mappings` into `[genLine, genCol, srcLine, srcCol]` tuples. */
export function decodeMappings(mappings: string): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  let srcLine = 0;
  let srcCol = 0;
  mappings.split(';').forEach((line, genLine) => {
    let genCol = 0;
    for (const seg of line.split(',')) {
      if (!seg) continue;
      const nums: number[] = [];
      let v = 0;
      let shift = 0;
      for (const ch of seg) {
        const d = B64.indexOf(ch);
        v += (d & 31) << shift;
        if (d & 32) shift += 5;
        else {
          nums.push(v & 1 ? -(v >>> 1) : v >>> 1);
          v = 0;
          shift = 0;
        }
      }
      genCol += nums[0] ?? 0;
      if (nums.length >= 4) {
        srcLine += nums[2]!;
        srcCol += nums[3]!;
        out.push([genLine, genCol, srcLine, srcCol]);
      }
    }
  });
  return out;
}
