/**
 * page.tsx — Server Component for the episode list view (/).
 *
 * Architecture (server_client_split from plan 07-03):
 *   1. Awaits searchParams (Next.js 16 contract — Promise-typed)
 *   2. Parses URL params with parseListParams (unknown values → defaults)
 *   3. Initializes the discovery runtime singleton (lazy, shared across requests)
 *   4. Loads channel accent colors from channels.yaml
 *   5. Queries all episodes from the sqlite cache
 *   6. Applies sort + filter via applyListParams
 *   7a. No episodes at all → renders <EmptyState rootPath> (UI-04)
 *   7b. Episodes present → renders <EpisodeList> with typed props
 *
 * This is the ONLY file that calls getDiscoveryRuntime(). EpisodeList (client
 * component) MUST NOT call it — it only reads serialized props from this file.
 *
 * No 'use client' directive — this is a Server Component.
 */

import { getDiscoveryRuntime } from '@/lib/discoveryRuntime';
import { queryAllEpisodes } from '@/lib/cache';
import { getChannelAccents } from '@/lib/ui/channelAccents';
import { parseListParams } from '@/lib/ui/listParams';
import { applyListParams } from '@/lib/ui/listOps';
import { EpisodeList } from '@/components/EpisodeList';
import { EmptyState } from '@/components/EmptyState';
import styles from './page.module.css';

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps): Promise<React.JSX.Element> {
  // Step 1: Await and parse URL params (Next.js 16 — searchParams is a Promise)
  const sp = await searchParams;
  const params = parseListParams(sp);

  // Step 2: Initialize discovery runtime (singleton — fast on subsequent requests)
  const runtime = await getDiscoveryRuntime();

  // Step 3: Load channel accent colors
  const accents = await getChannelAccents();

  // Step 4: Query all episodes + apply sort + filter
  const allRows = queryAllEpisodes(runtime.cache);
  const rows = applyListParams(params, allRows);

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>golazo</h1>

      {allRows.length === 0 ? (
        <EmptyState rootPath={runtime.rootPath} />
      ) : (
        <EpisodeList
          rows={rows}
          accents={accents}
          params={params}
          totalCount={allRows.length}
        />
      )}
    </main>
  );
}
