/**
 * EpisodeRow — Server Component (no 'use client').
 *
 * Presentational row rendering a single EpisodeIndex entry. All fields are
 * primitives or nulls — safe to receive from the Server Component (page.tsx)
 * through EpisodeList's prop drilling.
 *
 * Rendering contract (row_rendering_contract in plan 07-03):
 *   1. Thumb poster — lazy img from thumbUrlFor(row), OR typographic placeholder
 *      when status === 'prepared' (no thumb.png on disk)
 *   2. Kid chip — accent color via inline style (dynamic per-row value)
 *   3. Opponent — prettyOpponent(row.opponent) in display font (Cormorant Italic)
 *   4. Date — row.date in label font, muted
 *   5. Score — `${scoreFor}–${scoreAgainst}` with U+2013 EN DASH (not ASCII hyphen)
 *   6. Status badge — one of three CSS-styled pills: prepared / rendered / published
 *
 * The entire row is wrapped in a Next.js <Link> anchoring to /episodes/<manifestHash>.
 *
 * Inline style is ONLY used for the per-row accent color (dynamic). All static
 * styles live in EpisodeRow.module.css per Plan 05-04 D-14 LOCKED.
 */

import Link from 'next/link';
import type { EpisodeIndex } from '@/lib/episodeIndex';
import { thumbUrlFor } from '@/lib/ui/thumbUrl';
import { prettyOpponent } from '@golazo/cli/dist/render/opponentPretty.js';
import styles from './EpisodeRow.module.css';

interface EpisodeRowProps {
  row: EpisodeIndex;
  /** Accent hex color for the kid chip (from accentFor(accents, row.kid)). */
  accent: string;
}

export function EpisodeRow({ row, accent }: EpisodeRowProps): React.JSX.Element {
  const hasThumbnail = row.status !== 'prepared';

  return (
    <Link href={`/episodes/${row.manifestHash}`} className={styles.row}>
      {/* 1. Thumb poster */}
      <div className={styles.thumbWrapper}>
        {hasThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrlFor(row)}
            alt=""
            loading="lazy"
            className={styles.thumb}
          />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            {row.opponent.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* 2. Kid chip — accent via inline style (per-row dynamic value) */}
      <span
        className={styles.kidChip}
        style={{ color: accent, borderColor: accent }}
      >
        {row.kid.toUpperCase()}
      </span>

      {/* 3. Opponent — display font */}
      <span className={styles.opponent}>{prettyOpponent(row.opponent)}</span>

      {/* 4. Date — label font, muted */}
      <span className={styles.date}>{row.date}</span>

      {/* 5. Score — U+2013 EN DASH (Phase 3 template convention) */}
      <span className={styles.score}>
        {row.scoreFor}
        {'–'}
        {row.scoreAgainst}
      </span>

      {/* 6. Status badge */}
      <span className={styles[`status_${row.status}`]}>{row.status}</span>
    </Link>
  );
}
