/**
 * EmptyState — Server Component.
 *
 * Rendered by page.tsx when the indexed cache contains no episodes.
 * This is NOT the filtered-empty state (that lives inline in EpisodeList) —
 * this is the "no episodes at all" state for a fresh or empty GOLAZO_ROOT.
 *
 * UI-04: must render the scanned root path so the operator can confirm
 * the correct directory is being watched. Integration test case 5 pins this.
 *
 * Server-rendered: no 'use client' directive. No interactivity needed.
 */

import styles from './EmptyState.module.css';

interface EmptyStateProps {
  /** Absolute path to the golazo storage root that was scanned (from runtime.rootPath). */
  rootPath: string;
}

export function EmptyState({ rootPath }: EmptyStateProps): React.JSX.Element {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>No episodes found</h2>
      <p className={styles.rootPath}>
        Scanned: <code>{rootPath}</code>
      </p>
      <p className={styles.hint}>
        Drop a folder under this path and re-run <code>golazo prepare</code>.
      </p>
    </section>
  );
}
