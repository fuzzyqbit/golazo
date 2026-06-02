'use client';

/**
 * VideoPlayer — Client island wrapping the native HTML5 <video> element.
 *
 * Intentionally minimal: Phase 8 spec (PLAY-03) calls for pure HTML5 player.
 * The browser handles Range requests natively when the route advertises
 * Accept-Ranges (Plan 08-01 already does this). No custom controls, no event
 * handlers in v2.0 — browser chrome is sufficient.
 *
 * Props are string-only to avoid any node:* / @golazo/cli transitive imports
 * crossing the server→client boundary.
 */

import styles from './VideoPlayer.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VideoPlayerProps {
  src: string;
  poster: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VideoPlayer({ src, poster }: VideoPlayerProps): React.JSX.Element {
  return (
    <div className={styles.container}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        controls
        preload="metadata"
        poster={poster}
        src={src}
        className={styles.video}
      />
    </div>
  );
}
