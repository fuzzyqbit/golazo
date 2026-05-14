import { describe, expect, it } from 'vitest';

import { ChannelsConfigError, UnknownKidError } from './errors.js';

describe('ChannelsConfigError', () => {
  it('produces a single-line message containing field, reason, and remediation', () => {
    const err = new ChannelsConfigError({
      field: 'leo.accent',
      reason: 'must match #RRGGBB hex',
      remediation: 'edit channels.yaml and set leo.accent to a hex like #ffce5a',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ChannelsConfigError');
    expect(err.message).toBe(
      'channels.yaml: leo.accent: must match #RRGGBB hex. edit channels.yaml and set leo.accent to a hex like #ffce5a',
    );
    expect(err.message.split('\n')).toHaveLength(1);
    expect(err.field).toBe('leo.accent');
    expect(err.reason).toBe('must match #RRGGBB hex');
    expect(err.remediation).toBe(
      'edit channels.yaml and set leo.accent to a hex like #ffce5a',
    );
    expect(err.source).toBeUndefined();
  });

  it('records optional source on the instance and serialises via toJSON()', () => {
    const err = new ChannelsConfigError({
      field: 'mateo.youtube.oauth_token',
      reason: 'oauth token file does not exist at /tmp/missing.token.json',
      remediation: "run 'golazo auth mateo' to create it",
      source: '/tmp/missing.token.json',
    });

    expect(err.source).toBe('/tmp/missing.token.json');
    expect(err.toJSON()).toEqual({
      name: 'ChannelsConfigError',
      field: 'mateo.youtube.oauth_token',
      reason: 'oauth token file does not exist at /tmp/missing.token.json',
      remediation: "run 'golazo auth mateo' to create it",
      source: '/tmp/missing.token.json',
    });
  });
});

describe('UnknownKidError', () => {
  it('produces a message listing the requested kid and the valid keys', () => {
    const err = new UnknownKidError({
      kidKey: 'alice',
      validKeys: ['leo', 'mateo'],
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UnknownKidError');
    expect(err.message).toBe(
      "unknown kid 'alice'. Valid keys: leo, mateo. Edit channels.yaml to add 'alice'.",
    );
    expect(err.kidKey).toBe('alice');
    expect(err.validKeys).toEqual(['leo', 'mateo']);
  });

  it('handles an empty valid-keys list and exposes toJSON() for structured logs', () => {
    const err = new UnknownKidError({
      kidKey: 'bobby',
      validKeys: [],
    });

    expect(err.message).toBe(
      "unknown kid 'bobby'. Valid keys: . Edit channels.yaml to add 'bobby'.",
    );
    expect(err.toJSON()).toEqual({
      name: 'UnknownKidError',
      kidKey: 'bobby',
      validKeys: [],
    });
  });
});
