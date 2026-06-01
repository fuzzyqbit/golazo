import { describe, it, expect } from 'vitest';
import {
  parseListParams,
  serializeListParams,
  DEFAULT_LIST_PARAMS,
  SORT_KEYS,
  KID_FILTERS,
} from './listParams.js';
import type { ListParams } from './listParams.js';

describe('SORT_KEYS', () => {
  it('exports all expected sort keys', () => {
    expect(SORT_KEYS).toEqual(['date', 'opponent', 'result', 'kid']);
  });
});

describe('KID_FILTERS', () => {
  it('exports all expected kid filters', () => {
    expect(KID_FILTERS).toEqual(['all', 'leo', 'mateo']);
  });
});

describe('DEFAULT_LIST_PARAMS', () => {
  it('has sort date.desc and kid all', () => {
    expect(DEFAULT_LIST_PARAMS).toEqual({
      sort: { key: 'date', dir: 'desc' },
      kid: 'all',
    });
  });
});

describe('parseListParams', () => {
  it.each<[string, Record<string, string | string[] | undefined>, ListParams]>([
    [
      'empty input returns defaults',
      {},
      { sort: { key: 'date', dir: 'desc' }, kid: 'all' },
    ],
    [
      'sort=opponent.asc returns opponent/asc',
      { sort: 'opponent.asc' },
      { sort: { key: 'opponent', dir: 'asc' }, kid: 'all' },
    ],
    [
      'sort=opponent.asc&kid=leo returns opponent/asc + leo',
      { sort: 'opponent.asc', kid: 'leo' },
      { sort: { key: 'opponent', dir: 'asc' }, kid: 'leo' },
    ],
    [
      'sort=date.desc&kid=mateo returns date/desc + mateo',
      { sort: 'date.desc', kid: 'mateo' },
      { sort: { key: 'date', dir: 'desc' }, kid: 'mateo' },
    ],
    [
      'sort=result.desc is valid',
      { sort: 'result.desc' },
      { sort: { key: 'result', dir: 'desc' }, kid: 'all' },
    ],
    [
      'sort=result.asc is valid',
      { sort: 'result.asc' },
      { sort: { key: 'result', dir: 'asc' }, kid: 'all' },
    ],
    [
      'sort=kid.asc is valid — kid IS a sort key',
      { sort: 'kid.asc' },
      { sort: { key: 'kid', dir: 'asc' }, kid: 'all' },
    ],
    [
      'sort=bogus.asc falls back to default sort (no throw)',
      { sort: 'bogus.asc' },
      { sort: { key: 'date', dir: 'desc' }, kid: 'all' },
    ],
    [
      'sort=date.sideways falls back to default sort (no throw)',
      { sort: 'date.sideways' },
      { sort: { key: 'date', dir: 'desc' }, kid: 'all' },
    ],
    [
      'kid=unknown falls back to all (no throw)',
      { kid: 'unknown' },
      { sort: { key: 'date', dir: 'desc' }, kid: 'all' },
    ],
    [
      'array sort value (repeated key in Next.js) falls back to default (no throw)',
      { sort: ['a', 'b'] },
      { sort: { key: 'date', dir: 'desc' }, kid: 'all' },
    ],
    [
      'sort=date.asc is valid',
      { sort: 'date.asc' },
      { sort: { key: 'date', dir: 'asc' }, kid: 'all' },
    ],
    [
      'sort=opponent.desc&kid=mateo is valid',
      { sort: 'opponent.desc', kid: 'mateo' },
      { sort: { key: 'opponent', dir: 'desc' }, kid: 'mateo' },
    ],
    [
      'sort missing a dot falls back to default',
      { sort: 'dateDesc' },
      { sort: { key: 'date', dir: 'desc' }, kid: 'all' },
    ],
  ])('%s', (_label, input, expected) => {
    const result = parseListParams(input);
    expect(result).toEqual(expected);
  });
});

describe('serializeListParams', () => {
  it.each<[string, ListParams, string]>([
    [
      'DEFAULT_LIST_PARAMS serializes to empty string',
      DEFAULT_LIST_PARAMS,
      '',
    ],
    [
      'non-default sort only — omits kid',
      { sort: { key: 'opponent', dir: 'asc' }, kid: 'all' },
      'sort=opponent.asc',
    ],
    [
      'default sort + non-default kid — omits sort',
      { sort: { key: 'date', dir: 'desc' }, kid: 'leo' },
      'kid=leo',
    ],
    [
      'both non-default — sort before kid',
      { sort: { key: 'opponent', dir: 'asc' }, kid: 'leo' },
      'sort=opponent.asc&kid=leo',
    ],
    [
      'result.asc is non-default, serializes',
      { sort: { key: 'result', dir: 'asc' }, kid: 'all' },
      'sort=result.asc',
    ],
    [
      'kid.desc + mateo — both non-default',
      { sort: { key: 'kid', dir: 'desc' }, kid: 'mateo' },
      'sort=kid.desc&kid=mateo',
    ],
  ])('%s', (_label, params, expected) => {
    const result = serializeListParams(params);
    expect(result).toBe(expected);
  });
});

describe('round-trip', () => {
  it('serialize(parse(default inputs)) returns empty string', () => {
    expect(serializeListParams(parseListParams({}))).toBe('');
  });

  it('serialize(parse(non-default)) round-trips correctly', () => {
    const input = 'sort=opponent.asc&kid=leo';
    const params = parseListParams({ sort: 'opponent.asc', kid: 'leo' });
    expect(serializeListParams(params)).toBe(input);
  });

  it('serialize(parse(invalid)) produces empty string (falls back to defaults)', () => {
    const params = parseListParams({ sort: 'bogus.xyz', kid: 'unknown' });
    expect(serializeListParams(params)).toBe('');
  });
});
