import { describe, expect, it } from 'vitest';
import { blend, contrastRatio, distance, isHexColor, parseHex } from '../../src/themes/color.js';

describe('parseHex', () => {
  it('reads 3, 6 and 8 digit colors', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHex('#0b1021')).toEqual({ r: 11, g: 16, b: 33, a: 1 });
    expect(parseHex('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 });
  });

  it.each(['', 'fff', '#ff', '#fffff', '#ggg', '#1234567', 'red'])('rejects %j', (text) => {
    expect(() => parseHex(text)).toThrow(/color/);
    expect(isHexColor(text)).toBe(false);
  });

  it('knows a valid color when it sees one', () => {
    expect(isHexColor('#abc')).toBe(true);
    expect(isHexColor('#AABBCCDD')).toBe(true);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for the same color', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('does not depend on which color is the text', () => {
    expect(contrastRatio('#112233', '#ddeeff')).toBeCloseTo(contrastRatio('#ddeeff', '#112233'), 10);
  });

  it('matches the reference value for mid grey on white (WCAG: about 4.48)', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('accepts short colors', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
  });
});

describe('blend', () => {
  it('lays a translucent color over a background', () => {
    expect(blend('#ffffff80', '#000000')).toBe('#808080');
  });

  it('returns an opaque color unchanged', () => {
    expect(blend('#123456', '#ffffff')).toBe('#123456');
  });

  it('does not let the background show through an opaque color', () => {
    expect(blend('#ff0000ff', '#00ff00')).toBe('#ff0000');
  });
});

describe('distance', () => {
  it('is zero for equal colors and grows with difference', () => {
    expect(distance('#102030', '#102030')).toBe(0);
    expect(distance('#000000', '#ffffff')).toBeCloseTo(Math.sqrt(3 * 255 * 255), 5);
    expect(distance('#ff0000', '#00ff00')).toBeCloseTo(Math.sqrt(2 * 255 * 255), 5);
  });
});
