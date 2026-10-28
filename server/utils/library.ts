import type { H3Event } from 'h3';
import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { LibraryEntry } from '~/types/library.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';

// Library routes are keyed by Trakt id, the only id the show page knows before it loads.
export async function resolveLibraryShow(event: H3Event) {
  const user = await requireAuthenticatedUser(event);
  const traktId = Number(event.context.params?.traktId);
  if (!Number.isInteger(traktId) || traktId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid show.' });
  }
  const client = await serverSupabaseClient<Database>(event);
  const { data: show, error } = await client.from('show').select('id').eq('trakt_id', traktId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load this show.' });
  if (!show) throw createError({ statusCode: 404, statusMessage: 'Show not found.' });
  return { client, userId: user.sub, showId: show.id };
}

export function toLibraryEntry(row: Pick<Database['public']['Tables']['library_entry']['Row'], 'slug' | 'season' | 'episode' | 'spoiler_shield_enabled' | 'updated_at'>): LibraryEntry {
  return {
    slug: row.slug,
    season: row.season,
    episode: row.episode,
    spoilerShieldEnabled: row.spoiler_shield_enabled,
    updatedAt: row.updated_at,
  };
}
