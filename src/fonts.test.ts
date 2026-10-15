import { describe, expect, it } from 'vitest';
import have from './assets/fonts/chars.txt?raw';

const sources = import.meta.glob(['/index.html', '/src/**/*.{ts,tsx,css}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('自托管字体', () => {
  it('网页里用到的字都在字体子集里（缺字就重跑 python scripts/subset-fonts.py）', () => {
    const set = new Set(have);
    const missing = new Set<string>();
    for (const text of Object.values(sources)) for (const ch of text) if (ch.codePointAt(0)! >= 0x80 && !set.has(ch)) missing.add(ch);
    expect([...missing].join('')).toBe('');
  });
});
