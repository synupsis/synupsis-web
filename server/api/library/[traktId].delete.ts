import { resolveLibraryShow } from '~/server/utils/library';

export default defineEventHandler(async (event) => {
  const { client, userId, showId } = await resolveLibraryShow(event);
  const { error } = await client.from('library_entry').delete().eq('user_id', userId).eq('show_id', showId);
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not update your library.' });
  return { entry: null };
});
