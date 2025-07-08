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

  // 1. Check for an existing recap to preserve its status
  const { data: existingRecap } = await client
    .from('recap')
    .select('status')
    .eq('season_id', seasonId)
    .eq('user_id', user.id)
    .maybeSingle();

  // 2. Upsert the recap, preserving the existing status or defaulting to 'draft'
  const { data: recap, error: recapError } = await client
    .from('recap')
    .upsert(
      {
        show_id: showId,
        season_id: seasonId,
        user_id: user.id,
        status: existingRecap?.status || 'draft' // Preserve status
      },
      { onConflict: 'show_id, season_id, user_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (recapError) {
    console.error('Error upserting recap:', recapError);
    throw createError({ statusCode: 500, statusMessage: 'Could not save recap draft' });
  }

  // 3. Delete old slides for this recap
  const { error: deleteError } = await client.from('slide').delete().eq('recap_id', recap.id);

  if (deleteError) {
    console.error('Error deleting old slides:', deleteError);
  }

  // 4. Insert new slides
  const slideData = slides.map((slide: any, index: number) => ({
    recap_id: recap.id,
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
