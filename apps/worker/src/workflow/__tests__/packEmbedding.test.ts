import { describe, expect, it } from 'vitest';
import { packEmbedding } from '../PlanOutboxRunner';

function unpack(packed: string): number[] {
  const raw = Buffer.from(packed.slice(4), 'base64');
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const h = raw.readUInt16LE(i);
    const sign = h & 0x8000 ? -1 : 1, exp = (h >> 10) & 0x1f, man = h & 0x3ff;
    out.push(exp === 0 ? sign * man * 2 ** -24 : exp === 31 ? (man ? NaN : sign * Infinity) : sign * (1 + man / 1024) * 2 ** (exp - 15));
  }
  return out;
}

describe('packEmbedding', () => {
  it('keeps a 768-d vector within float16 precision at well under half the JSON size', () => {
    const vector = Array.from({ length: 768 }, (_, i) => Math.sin(i * 1.7) * 0.2);
    const packed = packEmbedding(vector);
    expect(packed.startsWith('f16:')).toBe(true);
    unpack(packed).forEach((value, i) => expect(Math.abs(value - vector[i])).toBeLessThan(2e-4));
    const json = JSON.stringify(vector.map((v) => Math.round(v * 1e4) / 1e4));
    expect(packed.length).toBeLessThan(json.length / 2);
  });

  it('rounds to the nearest half-precision value, carrying into the exponent', () => {
    expect(unpack(packEmbedding([0.99995, 1, -2, 0.5, 0]))).toEqual([1, 1, -2, 0.5, 0]);
  });
});
