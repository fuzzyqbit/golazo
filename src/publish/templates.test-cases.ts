/**
 * Table-driven test cases for renderTitle + renderDescription.
 *
 * Pattern: *.test-cases.ts sibling (same as channels.test-cases.ts and
 * filename.test-cases.ts) — importable by non-vitest tooling; excluded from
 * dist/ via the base tsconfig include set.
 */
import type { TemplateInput, TemplateOutput } from './templates.js';

export interface TemplateTestCase {
  name: string;
  input: TemplateInput;
  expected: TemplateOutput;
}

export const TEMPLATE_TEST_CASES: readonly TemplateTestCase[] = [
  {
    name: 'Case 1 — leo vs united 3-1 W (Plan 02-04 fixture parity)',
    input: {
      kid: { name: 'Leo', club: 'FC Eagles', jersey: 10, source: 'Veo' },
      game: { date: '2026-05-13', opponent: 'united', scoreFor: 3, scoreAgainst: 1, result: 'W' },
    },
    expected: {
      title: 'Leo · vs United · 3–1 W · 2026-05-13',
      description:
        'Match Day · 2026-05-13\nLeo (#10, FC Eagles) vs United\nFinal: 3–1\n\nFilmed via Veo. Edited with golazo.',
    },
  },
  {
    name: 'Case 2 — hyphenated opponent (city-sc → City SC)',
    input: {
      kid: { name: 'Mateo', club: 'City SC', jersey: 7, source: 'Trace' },
      game: { date: '2026-05-12', opponent: 'city-sc', scoreFor: 2, scoreAgainst: 2, result: 'D' },
    },
    expected: {
      title: 'Mateo · vs City SC · 2–2 D · 2026-05-12',
      description:
        'Match Day · 2026-05-12\nMateo (#7, City SC) vs City SC\nFinal: 2–2\n\nFilmed via Trace. Edited with golazo.',
    },
  },
  {
    name: 'Case 3 — acronym in front (ac-milan → AC Milan)',
    input: {
      kid: { name: 'Leo', club: 'FC Eagles', jersey: 10, source: 'Veo' },
      game: { date: '2026-06-01', opponent: 'ac-milan', scoreFor: 0, scoreAgainst: 4, result: 'L' },
    },
    expected: {
      title: 'Leo · vs AC Milan · 0–4 L · 2026-06-01',
      description:
        'Match Day · 2026-06-01\nLeo (#10, FC Eagles) vs AC Milan\nFinal: 0–4\n\nFilmed via Veo. Edited with golazo.',
    },
  },
  {
    name: 'Case 4 — acronym at end (real-madrid-fc → Real Madrid FC)',
    input: {
      kid: { name: 'Leo', club: 'FC Eagles', jersey: 10, source: 'Veo' },
      game: { date: '2026-06-02', opponent: 'real-madrid-fc', scoreFor: 1, scoreAgainst: 1, result: 'D' },
    },
    expected: {
      title: 'Leo · vs Real Madrid FC · 1–1 D · 2026-06-02',
      description:
        'Match Day · 2026-06-02\nLeo (#10, FC Eagles) vs Real Madrid FC\nFinal: 1–1\n\nFilmed via Veo. Edited with golazo.',
    },
  },
  {
    name: 'Case 5 — repeated allow-list (sc-fc-ac → SC FC AC)',
    input: {
      kid: { name: 'Mateo', club: 'City SC', jersey: 7, source: 'Trace' },
      game: { date: '2026-06-03', opponent: 'sc-fc-ac', scoreFor: 5, scoreAgainst: 0, result: 'W' },
    },
    expected: {
      title: 'Mateo · vs SC FC AC · 5–0 W · 2026-06-03',
      description:
        'Match Day · 2026-06-03\nMateo (#7, City SC) vs SC FC AC\nFinal: 5–0\n\nFilmed via Trace. Edited with golazo.',
    },
  },
  {
    name: 'Case 6 — non-allow-list part (real-madrid-cf → Real Madrid Cf)',
    input: {
      kid: { name: 'Leo', club: 'FC Eagles', jersey: 10, source: 'Veo' },
      game: { date: '2026-06-04', opponent: 'real-madrid-cf', scoreFor: 2, scoreAgainst: 3, result: 'L' },
    },
    expected: {
      title: 'Leo · vs Real Madrid Cf · 2–3 L · 2026-06-04',
      description:
        'Match Day · 2026-06-04\nLeo (#10, FC Eagles) vs Real Madrid Cf\nFinal: 2–3\n\nFilmed via Veo. Edited with golazo.',
    },
  },
  {
    name: 'Case 7 — single-character opponent (a → A)',
    input: {
      kid: { name: 'Leo', club: 'FC Eagles', jersey: 10, source: 'Veo' },
      game: { date: '2026-06-05', opponent: 'a', scoreFor: 1, scoreAgainst: 0, result: 'W' },
    },
    expected: {
      title: 'Leo · vs A · 1–0 W · 2026-06-05',
      description:
        'Match Day · 2026-06-05\nLeo (#10, FC Eagles) vs A\nFinal: 1–0\n\nFilmed via Veo. Edited with golazo.',
    },
  },
  {
    name: 'Case 8 — large jersey (jersey 99)',
    input: {
      kid: { name: 'Leo', club: 'FC Eagles', jersey: 99, source: 'Veo' },
      game: { date: '2026-06-06', opponent: 'united', scoreFor: 0, scoreAgainst: 0, result: 'D' },
    },
    expected: {
      title: 'Leo · vs United · 0–0 D · 2026-06-06',
      description:
        'Match Day · 2026-06-06\nLeo (#99, FC Eagles) vs United\nFinal: 0–0\n\nFilmed via Veo. Edited with golazo.',
    },
  },
  {
    name: "Case 9 — kid name with apostrophe (O'Leo — no escaping)",
    input: {
      kid: { name: "O'Leo", club: 'FC Eagles', jersey: 10, source: 'Veo' },
      game: { date: '2026-06-07', opponent: 'united', scoreFor: 1, scoreAgainst: 0, result: 'W' },
    },
    expected: {
      title: "O'Leo · vs United · 1–0 W · 2026-06-07",
      description:
        "Match Day · 2026-06-07\nO'Leo (#10, FC Eagles) vs United\nFinal: 1–0\n\nFilmed via Veo. Edited with golazo.",
    },
  },
  {
    name: 'Case 10 — multi-word club (FC Bayern München)',
    input: {
      kid: { name: 'Leo', club: 'FC Bayern München', jersey: 10, source: 'Veo' },
      game: { date: '2026-06-08', opponent: 'united', scoreFor: 3, scoreAgainst: 1, result: 'W' },
    },
    expected: {
      title: 'Leo · vs United · 3–1 W · 2026-06-08',
      description:
        'Match Day · 2026-06-08\nLeo (#10, FC Bayern München) vs United\nFinal: 3–1\n\nFilmed via Veo. Edited with golazo.',
    },
  },
] as const;
