import { describe, it, expect } from 'vitest';

import { prettyOpponent, ACRONYM_ALLOW_LIST } from './opponentPretty.js';

describe('prettyOpponent', () => {
  it.each([
    ['united', 'United'],
    ['city-sc', 'City SC'],
    ['ac-milan', 'AC Milan'],
    ['real-madrid-cf', 'Real Madrid Cf'],
    ['FC-Barcelona', 'FC Barcelona'],
    ['a', 'A'],
    ['', ''],
    ['fc-fc-fc', 'FC FC FC'],
  ])('prettyOpponent(%s) === %s', (input, expected) => {
    expect(prettyOpponent(input)).toBe(expected);
  });
});

describe('ACRONYM_ALLOW_LIST', () => {
  it('contains sc, fc, ac and nothing else', () => {
    expect(ACRONYM_ALLOW_LIST.has('sc')).toBe(true);
    expect(ACRONYM_ALLOW_LIST.has('fc')).toBe(true);
    expect(ACRONYM_ALLOW_LIST.has('ac')).toBe(true);
    expect(ACRONYM_ALLOW_LIST.has('cf')).toBe(false);
  });
});
