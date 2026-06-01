/**
 * page.tsx — Server Component for the episode detail view (/episodes/[manifestHash]).
 *
 * Architecture:
 *   1. Awaits params (Next.js 16 contract — Promise-typed)
 *   2. Decodes URL-encoded manifestHash (sha256:<64hex> contains ':' which may be encoded)
 *   3. Queries the sqlite cache via queryEpisodeByHash — calls notFound() on null
 *   4. Reads on-disk manifest via readManifestFromRow — maps ManifestReadError → notFound()
 *   5. Reads on-disk publish record via readPublishFromRow — null on missing/invalid (graceful)
 *   6. Loads channel config via loadChannel (skipTokenCheck: true — no OAuth needed for UI)
 *   7. Builds TemplateInput + calls renderTitle / renderDescription (zero template duplication)
 *   8. Renders <EpisodeDetail> with all typed props
 *
 * No 'use client' directive — fully server-rendered.
 * PLAY-01: canonical permalink + notFound() on unknown hash.
 * PLAY-02: title + description + manifest + publish surface.
 */

import { notFound } from 'next/navigation';

import { getDiscoveryRuntime } from '@/lib/discoveryRuntime';
import { queryEpisodeByHash } from '@/lib/cache';
import { readManifestFromRow, ManifestReadError } from '@/lib/ui/manifestRead';
import { readPublishFromRow } from '@/lib/ui/publishRead';
import { loadChannel } from '@golazo/cli/dist/config/channels.js';
import { renderTitle, renderDescription } from '@golazo/cli/dist/publish/templates.js';
import type { TemplateInput } from '@golazo/cli/dist/publish/templates.js';
import { EpisodeDetail } from '@/components/EpisodeDetail';
import { resolveChannelsPath } from '@/lib/ui/channelAccents';

import styles from './page.module.css';

interface EpisodeDetailPageProps {
  params: Promise<{ manifestHash: string }>;
}

export default async function EpisodeDetailPage({
  params,
}: EpisodeDetailPageProps): Promise<React.JSX.Element> {
  // Step 1: Await params (Next.js 16 contract)
  const { manifestHash: rawManifestHash } = await params;

  // Step 2: Decode URL-encoded manifestHash
  // sha256:<64hex> contains ':' which may be percent-encoded as %3A in URLs.
  const manifestHash = decodeURIComponent(rawManifestHash);

  // Step 3: Look up the row in the cache
  const runtime = await getDiscoveryRuntime();
  const row = queryEpisodeByHash(runtime.cache, manifestHash);
  if (!row) {
    notFound();
  }

  // Step 4: Read on-disk manifest (ManifestReadError → notFound)
  let manifest: ReturnType<typeof readManifestFromRow>;
  try {
    manifest = readManifestFromRow(row);
  } catch (err) {
    if (err instanceof ManifestReadError) {
      notFound();
    }
    throw err;
  }

  // Step 5: Read on-disk publish record (null on missing/invalid — graceful)
  const publish = readPublishFromRow(row);

  // Step 6: Load channel config (skipTokenCheck: true — UI never reads OAuth token)
  // Use resolveChannelsPath() to respect GOLAZO_CHANNELS_PATH env var (same as channelAccents.ts)
  const channelsPath = resolveChannelsPath();
  const channel = loadChannel(row.kid, { path: channelsPath, skipTokenCheck: true });

  // Step 7: Build TemplateInput + render title/description via Phase 3 templates
  const templateInput: TemplateInput = {
    kid: {
      name: channel.name,
      club: channel.club,
      jersey: channel.jersey,
      source: channel.source,
    },
    game: {
      date: row.date,
      opponent: row.opponent,
      scoreFor: row.scoreFor,
      scoreAgainst: row.scoreAgainst,
      result: row.result,
    },
  };

  const title = renderTitle(templateInput);
  const description = renderDescription(templateInput);

  // Step 8: Render the detail component
  return (
    <main className={styles.main}>
      <EpisodeDetail
        row={row}
        manifest={manifest}
        publish={publish}
        title={title}
        description={description}
        accent={channel.accent}
      />
    </main>
  );
}
