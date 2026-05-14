/**
 * Type contract for `channels.yaml`. Every downstream module that needs
 * per-kid branding or YouTube channel routing imports these types and
 * receives a fully-validated, camelCased `ChannelConfig` from
 * `loadChannel(kidKey)` in `./channels.ts`. The yaml-side snake_case keys
 * (`channel_id`, `oauth_token`) are converted at load time.
 */

/** Top-level key under `channels.yaml`. Common values are `leo` and `mateo`. */
export type KidKey = string;

/** Per-kid branding + YouTube channel binding, fully validated and resolved. */
export interface ChannelConfig {
  /** Populated by the loader from the top-level yaml key. */
  kid: KidKey;
  /** Display name shown in title cards and descriptions. */
  name: string;
  /** Club name shown in chapter cards and descriptions. */
  club: string;
  /** Integer 1..99 — validated by zod. */
  jersey: number;
  /** Hex color matching `/^#[0-9a-fA-F]{6}$/`, used as the accent color. */
  accent: string;
  /** Free-form footage source label (e.g. `Veo`, `Trace`). */
  source: string;
  /** YouTube channel binding (camelCased from yaml `channel_id` / `oauth_token`). */
  youtube: {
    /** YouTube channel id (e.g. `UC...`). */
    channelId: string;
    /** Absolute path to the per-kid OAuth token file, after `~/` expansion. */
    oauthTokenPath: string;
  };
}

/** Record of kid keys to their fully-validated `ChannelConfig`. */
export type ChannelsFile = Record<KidKey, ChannelConfig>;
