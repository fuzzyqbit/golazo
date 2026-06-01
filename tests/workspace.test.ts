/**
 * Workspace host contract pin — tests/workspace.test.ts
 *
 * Asserts that root package.json satisfies the v1.0 invariants that MUST
 * survive the rename from `golazo` → `@golazo/cli` and the addition of
 * `workspaces: ["web"]`. These assertions are the Phase 1 contract pin:
 * any future plan that silently breaks the CLI bin path, script names,
 * or workspace structure will cause this suite to fail immediately.
 *
 * 9 assertion groups (mirroring plan 05-01 behavior spec):
 *   1. Root package name === '@golazo/cli'
 *   2. workspaces array includes 'web'
 *   3. bin.golazo === './dist/cli/index.js'
 *   4. type === 'module'
 *   5. private === true
 *   6. packageManager === 'npm@10.9.0'
 *   7. engines.node === '>=22'
 *   8. All v1.0 scripts present with exact v1.0 values
 *   9. No unexpected top-level keys in package.json
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Load package.json once at module top
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__filename, '..', '..');

const pkg = JSON.parse(
  readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
) as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Assertion 1: Root package name
// ---------------------------------------------------------------------------

describe('workspace host: package name', () => {
  it('root package name is @golazo/cli', () => {
    expect(pkg['name']).toBe('@golazo/cli');
  });
});

// ---------------------------------------------------------------------------
// Assertion 2: workspaces declaration
// ---------------------------------------------------------------------------

describe('workspace host: workspaces', () => {
  it('workspaces is an array containing "web"', () => {
    expect(Array.isArray(pkg['workspaces'])).toBe(true);
    expect(pkg['workspaces']).toContain('web');
  });
});

// ---------------------------------------------------------------------------
// Assertion 3: bin entry — the executable name MUST NOT change with rename
// ---------------------------------------------------------------------------

describe('workspace host: bin entry', () => {
  it('bin.golazo points to ./dist/cli/index.js', () => {
    const bin = pkg['bin'] as Record<string, string> | undefined;
    expect(bin?.['golazo']).toBe('./dist/cli/index.js');
  });
});

// ---------------------------------------------------------------------------
// Assertion 4: type
// ---------------------------------------------------------------------------

describe('workspace host: module type', () => {
  it('type is "module"', () => {
    expect(pkg['type']).toBe('module');
  });
});

// ---------------------------------------------------------------------------
// Assertion 5: private
// ---------------------------------------------------------------------------

describe('workspace host: private flag', () => {
  it('private is true', () => {
    expect(pkg['private']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Assertion 6: packageManager pin
// ---------------------------------------------------------------------------

describe('workspace host: packageManager pin', () => {
  it('packageManager is npm@10.9.0', () => {
    expect(pkg['packageManager']).toBe('npm@10.9.0');
  });
});

// ---------------------------------------------------------------------------
// Assertion 7: engines
// ---------------------------------------------------------------------------

describe('workspace host: engines', () => {
  it('engines.node is >=22', () => {
    const engines = pkg['engines'] as Record<string, string> | undefined;
    expect(engines?.['node']).toBe('>=22');
  });
});

// ---------------------------------------------------------------------------
// Assertion 8: v1.0 scripts — exact values, table-driven
// ---------------------------------------------------------------------------

describe('workspace host: v1.0 scripts', () => {
  const V1_SCRIPTS: Array<[string, string]> = [
    ['build', 'tsc -p .'],
    ['dev', 'tsx src/cli/index.ts'],
    ['test', 'vitest run'],
    ['test:watch', 'vitest'],
    ['test:coverage', 'vitest run --coverage'],
    ['lint', 'eslint . --ext .ts'],
    ['format', 'prettier --write .'],
    ['typecheck', 'tsc --noEmit -p tsconfig.check.json'],
  ];

  const scripts = pkg['scripts'] as Record<string, string> | undefined;

  for (const [name, value] of V1_SCRIPTS) {
    it(`scripts.${name} === '${value}'`, () => {
      expect(typeof scripts?.[name]).toBe('string');
      expect(scripts?.[name]).toBe(value);
    });
  }
});

// ---------------------------------------------------------------------------
// Assertion 9: No unexpected top-level keys
// ---------------------------------------------------------------------------

describe('workspace host: allowed top-level keys', () => {
  it('package.json contains only expected top-level keys', () => {
    const ALLOWED_KEYS = new Set([
      'name',
      'version',
      'private',
      'description',
      'type',
      'engines',
      'packageManager',
      'bin',
      'workspaces',
      'scripts',
      'dependencies',
      'devDependencies',
    ]);

    for (const key of Object.keys(pkg)) {
      expect(ALLOWED_KEYS.has(key), `Unexpected top-level key: "${key}"`).toBe(true);
    }
  });
});
