import { resolveLibraryShow, toLibraryEntry } from '~/server/utils/library';

export default defineEventHandler(async (event) => {
  const { client, userId, showId } = await resolveLibraryShow(event);
  const { data, error } = await client.from('library_entry')
    .select('slug, season, episode, spoiler_shield_enabled, updated_at')
    .eq('user_id', userId)
    .eq('show_id', showId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load your library.' });
  return { entry: data ? toLibraryEntry(data) : null };
});
