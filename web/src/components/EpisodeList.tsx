'use client';

/**
 * EpisodeList — Client Component (owns URL-driven interactivity).
 *
 * This component is the ONLY 'use client' boundary in Phase 7 Plan 03.
 * All other components (EpisodeRow, EmptyState, page.tsx) are server-rendered.
 *
 * Architecture (server_client_split from plan 07-03):
 *   - Receives pre-sorted/filtered rows from the Server Component via props
 *   - Does NOT call getDiscoveryRuntime() or applyListParams() — server does that
 *   - Owns the sort dropdown + kid chip filter UI
 *   - On change, calls router.replace(`/?${serializeListParams(next)}`) which
 *     triggers a server re-render with the new URL params (no client-side re-sort)
 *   - { scroll: false } prevents scroll jumps on filter/sort changes
 *
 * Props are all JSON-serializable (EpisodeIndex fields are primitives + nulls).
 */

import { useRouter } from 'next/navigation';
import type { EpisodeIndex } from '@/lib/episodeIndex';
import type { ChannelAccentMap } from '@/lib/ui/channelAccents';
import {
  type ListParams,
  type KidFilter,
  SORT_KEYS,
  KID_FILTERS,
  serializeListParams,
} from '@/lib/ui/listParams';
import { EpisodeRow } from './EpisodeRow';

// ---------------------------------------------------------------------------
// Pure client-safe accent lookup (mirrors accentFor from channelAccents.ts,
// inlined here to avoid transitive node:fs import from the server helper)
// ---------------------------------------------------------------------------
const ACCENT_DEFAULT = '#ffce5a'; // COLORS.accentDefault — mirrored literal

function accentForClient(map: ChannelAccentMap, kidKey: string): string {
  return (map[kidKey]) ?? ACCENT_DEFAULT;
}
import styles from './EpisodeList.module.css';

// ---------------------------------------------------------------------------
// Sort option labels
// ---------------------------------------------------------------------------

const SORT_OPTION_LABELS: Record<string, string> = {
  'date.desc': 'Date (newest first)',
  'date.asc': 'Date (oldest first)',
  'opponent.asc': 'Opponent (A–Z)',
  'opponent.desc': 'Opponent (Z–A)',
  'result.asc': 'Result (W first)',
  'result.desc': 'Result (L first)',
  'kid.asc': 'Kid (A–Z)',
  'kid.desc': 'Kid (Z–A)',
};

const KID_CHIP_LABELS: Record<KidFilter, string> = {
  all: 'All',
  leo: 'Leo',
  mateo: 'Mateo',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EpisodeListProps {
  rows: EpisodeIndex[];
  accents: ChannelAccentMap;
  params: ListParams;
  totalCount: number;
}

export function EpisodeList({ rows, accents, params, totalCount }: EpisodeListProps): React.JSX.Element {
  const router = useRouter();

  function onParamsChange(next: ListParams): void {
    const qs = serializeListParams(next);
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  }

  function onKidChange(kid: KidFilter): void {
    onParamsChange({ ...params, kid });
  }

  function onSortChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const [key, dir] = e.target.value.split('.') as [ListParams['sort']['key'], ListParams['sort']['dir']];
    onParamsChange({ ...params, sort: { key, dir } });
  }

  const currentSortValue = `${params.sort.key}.${params.sort.dir}`;

  return (
    <div className={styles.container}>
      {/* Controls: kid chips + sort dropdown */}
      <div className={styles.controls}>
        <div className={styles.kidChips}>
          {KID_FILTERS.map((kid) => (
            <button
              key={kid}
              type="button"
              className={`${styles.chipBtn} ${params.kid === kid ? styles.chipActive : ''}`}
              onClick={() => onKidChange(kid)}
              aria-pressed={params.kid === kid}
            >
              {KID_CHIP_LABELS[kid]}
            </button>
          ))}
        </div>

        <select
          className={styles.sortSelect}
          value={currentSortValue}
          onChange={onSortChange}
          aria-label="Sort episodes"
        >
          {SORT_KEYS.flatMap((key) =>
            (['asc', 'desc'] as const).map((dir) => {
              const val = `${key}.${dir}`;
              return (
                <option key={val} value={val}>
                  {SORT_OPTION_LABELS[val] ?? val}
                </option>
              );
            }),
          )}
        </select>

        <span className={styles.countLabel}>
          {rows.length === totalCount
            ? `${totalCount} episode${totalCount === 1 ? '' : 's'}`
            : `${rows.length} of ${totalCount} episodes`}
        </span>
      </div>

      {/* Row list or filtered-empty message */}
      {rows.length === 0 && totalCount > 0 ? (
        <p className={styles.filterEmpty}>
          No episodes match this filter — clear the kid filter or change sort.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.manifestHash}>
              <EpisodeRow row={row} accent={accentForClient(accents, row.kid)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
