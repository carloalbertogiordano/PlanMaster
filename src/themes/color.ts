export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 to 1. */
  a: number;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isHexColor(text: string): boolean {
  return HEX.test(text);
}

/** Reads `#rgb`, `#rrggbb` or `#rrggbbaa`. */
export function parseHex(text: string): Rgba {
  if (!isHexColor(text)) throw new Error(`Not a hex color: "${text}"`);
  const digits = text.slice(1);
  const full = digits.length === 3 ? digits.split('').map((d) => d + d).join('') : digits;
  const channel = (index: number): number => Number.parseInt(full.slice(index * 2, index * 2 + 2), 16);
  return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? channel(3) / 255 : 1 };
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG contrast ratio between two colors, from 1 to 21. Transparency is
 * ignored: blend a translucent color over its background first.
 */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const toHex = (value: number): string => Math.round(value).toString(16).padStart(2, '0');

/** `foreground` laid over an opaque `background`, as `#rrggbb`. */
export function blend(foreground: string, background: string): string {
  const top = parseHex(foreground);
  const bottom = parseHex(background);
  const mix = (t: number, b: number): number => t * top.a + b * (1 - top.a);
  return `#${toHex(mix(top.r, bottom.r))}${toHex(mix(top.g, bottom.g))}${toHex(mix(top.b, bottom.b))}`;
}

/** Straight-line distance between two colors in RGB space; a rough measure of how different they look. */
export function distance(a: string, b: string): number {
  const x = parseHex(a);
  const y = parseHex(b);
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
}
