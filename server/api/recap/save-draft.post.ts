import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import { Database } from '~/types/database.types';

export default defineEventHandler(async event => {
  const client = await serverSupabaseClient<Database>(event);
  const user = await serverSupabaseUser(event);
  const { slides, showId, seasonId } = await readBody(event);

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  if (!slides || !showId || !seasonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' });
  }

  // 1. Upsert the recap to get a stable ID
  const { data: recap, error: recapError } = await client
    .from('recap')
    .upsert(
      {
        show_id: showId,
        season_id: seasonId,
        user_id: user.id,
        status: 'draft'
      },
      { onConflict: 'show_id, season_id, user_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (recapError) {
    console.error('Error upserting recap:', recapError);
    throw createError({ statusCode: 500, statusMessage: 'Could not save recap draft' });
  }

  // 2. Delete old slides for this recap
  const { error: deleteError } = await client.from('slide').delete().eq('recap_id', recap.id);

  if (deleteError) {
    console.error('Error deleting old slides:', deleteError);
    // We can continue, but it's not ideal. The user might see old slides if they fail to save new ones.
  }

  // 3. Insert new slides
  const slideData = slides.map((slide: any, index: number) => ({
    recap_id: recap.id,
    // Parse the canvas JSON string from the client into an object for the JSONB column
    canvas_data: JSON.parse(slide.canvas || '{}'),
    order: index
  }));

  const { error: slideError } = await client.from('slide').insert(slideData);

  if (slideError) {
    console.error('Error inserting new slides:', slideError);
    throw createError({ statusCode: 500, statusMessage: 'Could not save slides' });
  }

  return { status: 'Draft saved successfully', recapId: recap.id };
});
