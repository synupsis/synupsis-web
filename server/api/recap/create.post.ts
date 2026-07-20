import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async event => {
  const supabase = await serverSupabaseClient<Database>(event);
  const user = await serverSupabaseUser(event);
  const body = await readBody(event);

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  if (!body.seasonId || !body.showId || !Array.isArray(body.slides)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: seasonId, showId, and slides are required.'
    });
  }

  const { seasonId, showId, slides } = body;

  try {
    // 1. Upsert the recap entry to set its status to 'published'
    const { data: recap, error: recapError } = await supabase
      .from('recap')
      .upsert(
        {
          show_id: showId,
          season_id: seasonId,
          user_id: user.sub,
          status: 'published'
        },
        { onConflict: 'show_id, season_id, user_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (recapError) {
      console.error('Error upserting recap for publishing:', recapError);
      throw createError({ statusCode: 500, statusMessage: recapError.message });
    }

    // 2. Delete old slides for this recap
    const { error: deleteError } = await supabase.from('slide').delete().eq('recap_id', recap.id);
    if (deleteError) {
      console.error('Error deleting old slides during publish:', deleteError);
    }

    // 3. Create the new slides
    const slidesToInsert = slides.map((slide: { canvas?: string }, index: number) => ({
      recap_id: recap.id,
      canvas_data: JSON.parse(slide.canvas || '{}'),
      order: index
    }));

    const { data: createdSlides, error: slidesError } = await supabase
      .from('slide')
      .insert(slidesToInsert)
      .select();

    if (slidesError) {
      console.error('Error creating slides during publish:', slidesError);
      throw createError({ statusCode: 500, statusMessage: slidesError.message });
    }

    return { ...recap, slides: createdSlides };
  } catch (error: unknown) {
    console.error('Failed to publish recap:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'An internal server error occurred while publishing the recap.'
    });
  }
});
