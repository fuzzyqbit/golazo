/**
 * not-found.tsx — Custom 404 page for unknown manifestHash routes.
 *
 * Rendered automatically by Next.js App Router when notFound() fires inside
 * the /episodes/[manifestHash] route segment. Provides a typographic 404 page
 * consistent with the Phase 7 browse surface design.
 *
 * No 'use client' directive — server-rendered.
 */

import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound(): React.JSX.Element {
  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Episode not found</h1>
      <p className={styles.message}>
        The episode you&rsquo;re looking for doesn&rsquo;t exist or has been removed from the
        index.
      </p>
      <Link href="/" className={styles.backLink}>
        ← All episodes
      </Link>
    </main>
  );
}
