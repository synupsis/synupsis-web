import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { HomeLibraryEntry } from '~/types/library.types';
import { isRegularSeasonReleased } from '~/lib/season-availability';
import { lastConfirmedAiredEpisode } from '~/lib/watching-progress';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';
import { toLibraryEntry } from '~/server/utils/library';

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const client = await serverSupabaseClient<Database>(event);
  const { data, error } = await client.from('library_entry')
    .select('slug, season, episode, spoiler_shield_enabled, updated_at, show(name, image, trakt_id, seasons:season(number, first_aired))')
    .eq('user_id', user.sub)
    .order('created_at', { ascending: false })
    .order('show_id', { ascending: true })
    .limit(5);
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load your library.' });
  const now = Date.now();
  const entries = await Promise.all((data ?? []).map(async (row): Promise<HomeLibraryEntry> => {
    const latestSeason = (row.show?.seasons ?? [])
      .filter(season => isRegularSeasonReleased(season.number, season.first_aired, now))
      .reduce((latest, season) => Math.max(latest, season.number), 0);
    const traktId = row.show?.trakt_id;
    let isCaughtUp = false;
    if (latestSeason > 0 && row.season === latestSeason && row.episode > 0
      && typeof traktId === 'number' && Number.isInteger(traktId) && traktId > 0) {
      // Reuse the show page's public episode cache, without accepting a stored
      // slug as an arbitrary path or letting it choose a different series.
      const episodeSlug = /^[a-z0-9-]+$/i.test(row.slug) && row.slug.split('-').pop() === String(traktId)
        ? row.slug : String(traktId);
      try {
        const catalog = await event.$fetch<{ seasonNumber: number; episodes: { number: number; firstAired: string | null }[] }>(
          `/api/shows/${episodeSlug}/seasons/${latestSeason}/episodes`,
          { timeout: 2_500, retry: 0 },
        );
        if (catalog.seasonNumber === latestSeason) {
          const lastEpisode = lastConfirmedAiredEpisode(catalog.episodes, now);
          isCaughtUp = lastEpisode !== null && row.episode >= lastEpisode;
        }
      } catch {
        // Unavailable episode metadata must not hide the viewer's library.
      }
    }
    return {
      ...toLibraryEntry(row),
      name: row.show?.name ?? row.slug,
      image: row.show?.image ?? null,
      isCaughtUp,
    };
  }));
  return { entries };
});
