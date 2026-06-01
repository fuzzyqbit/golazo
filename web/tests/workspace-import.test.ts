/**
 * Cross-workspace type-import smoke test (WEB-01 SC#4).
 *
 * Imports `manifestSchema` from `@golazo/cli/dist/prepare/manifest.js`
 * (resolved via the npm workspace symlink at node_modules/@golazo/cli -> repo root)
 * and proves the cross-package type contract works — no copying, no duplication.
 *
 * If src/prepare/manifest.ts changes break this test's assertions, the failure
 * is immediate and loud — the desired behaviour for a shared-types contract.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { describe, it, expect, beforeAll } from 'vitest';

// Resolved at import time via workspace symlink:
// node_modules/@golazo/cli -> <repo-root>
// <repo-root>/dist/prepare/manifest.js is the compiled artifact.
import { manifestSchema } from '@golazo/cli/dist/prepare/manifest.js';

beforeAll(() => {
  // Defensive pre-flight: ensure dist/prepare/manifest.js is compiled.
  // On a clean clone, dist/ may be absent; running build here prevents a
  // confusing "Cannot find module" error unrelated to the test logic.
  const distManifestPath = fileURLToPath(
    new URL('../node_modules/@golazo/cli/dist/prepare/manifest.js', import.meta.url),
  );
  if (!existsSync(distManifestPath)) {
    const repoRoot = fileURLToPath(
      new URL('../node_modules/@golazo/cli/', import.meta.url),
    );
    execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });
  }
});

describe('cross-workspace @golazo/cli manifest schema import', () => {
  /**
   * Case 1: manifestSchema is importable and has the correct zod shape.
   * Failure mode: workspace symlink broken OR schema renamed/relocated upstream.
   */
  it('manifestSchema is importable from @golazo/cli and has zod schema shape', () => {
    // Arrange — imported at module level above
    // Act + Assert
    expect(typeof manifestSchema.safeParse).toBe('function');
    expect(typeof manifestSchema.parse).toBe('function');
  });

  /**
   * Case 2: A known-good v1.0 manifest fixture parses successfully.
   *
   * The fixture file tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/.golazo/manifest.json
   * does not yet exist at this point in development (the .golazo/ dir is absent
   * from the fixture), so we use an inline minimal valid manifest built to
   * match the live schema.
   *
   * When the fixture manifest IS committed in a future plan, replace this
   * inline object with:
   *   const raw = readFileSync(
   *     fileURLToPath(new URL(
   *       '../../tests/fixtures/golazo/leo/2026-05-13_vs_united_3-1/.golazo/manifest.json',
   *       import.meta.url
   *     )), 'utf8');
   *   const validManifest = JSON.parse(raw);
   *
   * Failure mode: schema and fixture have drifted (catches Phase 6+ schema
   * changes that forgot to update the fixture).
   */
  it('parses a valid v1.0 manifest fixture with success:true', () => {
    // Arrange — a known-good minimal manifest matching the live schema
    const validManifest = {
      version: 1 as const,
      kid: 'leo',
      game: {
        date: '2026-05-13',
        opponent: 'united',
        scoreFor: 3,
        scoreAgainst: 1,
        result: 'W' as const,
      },
      clips: [
        {
          file: '01-clip.mp4',
          durationSec: 4.5,
          sha256: 'a'.repeat(64),
        },
      ],
      totalDurationSec: 4.5,
      manifestHash: 'sha256:' + 'b'.repeat(64),
    };

    // Act
    const result = manifestSchema.safeParse(validManifest);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kid).toBe('leo');
      expect(result.data.manifestHash).toMatch(/^sha256:/);
    }
  });

  /**
   * Case 3: A deliberately malformed manifest fails parsing with useful errors.
   * Failure mode: schema accidentally became too permissive.
   */
  it('returns success:false for a malformed manifest missing required fields', () => {
    // Arrange — missing clips, totalDurationSec, manifestHash
    const malformedManifest = {
      version: 1,
      kid: 'leo',
      game: {
        date: '2026-05-13',
        opponent: 'united',
        scoreFor: 3,
        scoreAgainst: 1,
        result: 'W',
      },
    };

    // Act
    const result = manifestSchema.safeParse(malformedManifest);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      // At least one issue should point to a missing required field
      const issuePaths = result.error.issues.map((issue) =>
        issue.path.map((segment) => String(segment)).join('.'),
      );
      const mentionsRequiredField = issuePaths.some(
        (path) =>
          path.includes('clips') ||
          path.includes('totalDurationSec') ||
          path.includes('manifestHash'),
      );
      expect(mentionsRequiredField).toBe(true);
    }
  });
});
