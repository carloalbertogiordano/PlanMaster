import type { Config } from './types.js';

export const SUPPORTED_FORMAT = 1;

export const DEFAULT_CONFIG: Readonly<Config> = {
  format: SUPPORTED_FORMAT,
  people: [],
  staleAfterMinutes: 120,
  doneVisibleDays: 3,
  archiveAfterDays: 14,
  lanesDir: '.planmaster/lanes',
};

export class ConfigError extends Error {}

const POSITIVE_INTEGER_KEYS = ['format', 'staleAfterMinutes', 'doneVisibleDays', 'archiveAfterDays'] as const;

/**
 * Parses the text of `config.json`. Missing text gives the defaults; broken
 * text is an error, never silently replaced by defaults.
 */
export function parseConfig(text: string | undefined): Config {
  if (text === undefined) return { ...DEFAULT_CONFIG, people: [] };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`config.json is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('config.json must contain a JSON object');
  }

  const source = raw as Record<string, unknown>;
  const config: Config = { ...DEFAULT_CONFIG, people: [] };

  for (const key of POSITIVE_INTEGER_KEYS) {
    const value = source[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new ConfigError(`config.json: "${key}" must be a positive integer`);
    }
    config[key] = value;
  }

  if (source.people !== undefined) {
    const people = source.people;
    if (!Array.isArray(people) || people.some((p) => typeof p !== 'string' || !/^[^\s]+$/.test(p))) {
      throw new ConfigError('config.json: "people" must be an array of strings without spaces');
    }
    config.people = [...(people as string[])];
  }

  if (source.lanesDir !== undefined) {
    if (typeof source.lanesDir !== 'string' || source.lanesDir.length === 0) {
      throw new ConfigError('config.json: "lanesDir" must be a non-empty string');
    }
    config.lanesDir = source.lanesDir;
  }

  return config;
}
