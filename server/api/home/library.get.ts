import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import type { LibraryListEntry } from '~/types/library.types';
import { requireAuthenticatedUser } from '~/server/utils/require-admin';
import { toLibraryEntry } from '~/server/utils/library';

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event);
  const client = await serverSupabaseClient<Database>(event);
  const { data, error } = await client.from('library_entry')
    .select('slug, season, episode, spoiler_shield_enabled, updated_at, show(name, image)')
    .eq('user_id', user.sub)
    .order('created_at', { ascending: false })
    .order('show_id', { ascending: true })
    .limit(5);
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load your library.' });
  return {
    entries: (data ?? []).map((row): LibraryListEntry => ({
      ...toLibraryEntry(row),
      name: row.show?.name ?? row.slug,
      image: row.show?.image ?? null,
    })),
  };
});
