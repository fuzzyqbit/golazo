/**
 * Unit tests for the WarningBag accumulator.
 *
 * These 3 cases confirm the simple mutable-value-object contract
 * (D-20: never persisted; Plan 04 treats instances as transient).
 */
import { describe, it, expect } from 'vitest';
import { createWarningBag } from './warningBag';

describe('createWarningBag', () => {
  /**
   * Case 1: returns the correct initial shape — three empty arrays.
   */
  it('returns an object with three empty arrays', () => {
    // Arrange + Act
    const bag = createWarningBag();

    // Assert
    expect(bag).toEqual(
      expect.objectContaining({
        brokenFolders: [],
        invalidManifests: [],
        invalidPublishRecords: [],
      }),
    );
    expect(bag.brokenFolders).toHaveLength(0);
    expect(bag.invalidManifests).toHaveLength(0);
    expect(bag.invalidPublishRecords).toHaveLength(0);
  });

  /**
   * Case 2: the bag's arrays are mutable in-place.
   * WarningBag is a plain value object — the scanner pushes into the arrays
   * directly rather than returning new bag copies.
   */
  it('allows pushing to brokenFolders in-place', () => {
    // Arrange
    const bag = createWarningBag();

    // Act
    bag.brokenFolders.push({ absPath: '/some/path', reason: 'bad name' });

    // Assert
    expect(bag.brokenFolders).toHaveLength(1);
    expect(bag.brokenFolders[0]).toEqual({ absPath: '/some/path', reason: 'bad name' });
  });

  /**
   * Case 3: two independently-created bags do not share state.
   * Confirms there is no module-level singleton.
   */
  it('two independently created bags do not share state', () => {
    // Arrange
    const bag1 = createWarningBag();
    const bag2 = createWarningBag();

    // Act — mutate bag1
    bag1.invalidManifests.push({ absPath: '/a/path', reason: 'invalid' });

    // Assert — bag2 is unaffected
    expect(bag2.invalidManifests).toHaveLength(0);
    expect(bag1.invalidManifests).toHaveLength(1);
  });
});
