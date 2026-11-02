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

type IntegerKey = 'format' | 'staleAfterMinutes' | 'doneVisibleDays' | 'archiveAfterDays';
type RawConfig = Record<string, unknown>;

/**
 * Parses the text of `config.json`. Missing text gives the defaults; broken
 * text is an error, never silently replaced by defaults.
 */
export function parseConfig(text: string | undefined): Config {
  if (text === undefined) return { ...DEFAULT_CONFIG, people: [] };
  const raw = readObject(text);
  return {
    format: readPositiveInteger(raw, 'format'),
    staleAfterMinutes: readPositiveInteger(raw, 'staleAfterMinutes'),
    doneVisibleDays: readPositiveInteger(raw, 'doneVisibleDays'),
    archiveAfterDays: readPositiveInteger(raw, 'archiveAfterDays'),
    people: readPeople(raw),
    lanesDir: readLanesDir(raw),
  };
}

function readObject(text: string): RawConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`config.json is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError('config.json must contain a JSON object');
  }
  return parsed as RawConfig;
}

function readPositiveInteger(raw: RawConfig, key: IntegerKey): number {
  const value = raw[key];
  if (value === undefined) return DEFAULT_CONFIG[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ConfigError(`config.json: "${key}" must be a positive integer`);
  }
  return value;
}

function readPeople(raw: RawConfig): string[] {
  const value = raw.people;
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isPersonKey)) {
    throw new ConfigError('config.json: "people" must be an array of strings without spaces');
  }
  return [...value];
}

function isPersonKey(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && !/\s/.test(value);
}

function readLanesDir(raw: RawConfig): string {
  const value = raw.lanesDir;
  if (value === undefined) return DEFAULT_CONFIG.lanesDir;
  if (typeof value !== 'string' || value === '') {
    throw new ConfigError('config.json: "lanesDir" must be a non-empty string');
  }
  return value;
}
