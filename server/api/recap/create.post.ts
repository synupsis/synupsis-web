import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async event => {
  const supabase = await serverSupabaseClient<Database>(event);
  const body = await readBody(event);

  // Basic validation
  if (!body.seasonId || !body.showId || !Array.isArray(body.slides)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: seasonId, showId, and slides are required.'
    });
  }

  const { seasonId, showId, slides } = body;

  try {
    // 1. Create the recap entry
    const { data: recap, error: recapError } = await supabase
      .from('recap')
      .insert({ season_id: seasonId, show_id: showId })
      .select()
      .single();

    if (recapError) {
      console.error('Error creating recap:', recapError);
      throw createError({ statusCode: 500, statusMessage: recapError.message });
    }

    // 2. Create the associated slides
    const slidesToInsert = slides.map((slide, index) => ({
      recap_id: recap.id,
      canvas: slide.canvas,
      order: index
    }));

    const { data: createdSlides, error: slidesError } = await supabase
      .from('slide')
      .insert(slidesToInsert)
      .select();

    if (slidesError) {
      console.error('Error creating slides:', slidesError);
      // Optional: Clean up the created recap if slide creation fails
      await supabase.from('recap').delete().eq('id', recap.id);
      throw createError({ statusCode: 500, statusMessage: slidesError.message });
    }

    return { ...recap, slides: createdSlides };
  } catch (error: unknown) {
    // Log the error for debugging, but return a generic message to the client
    console.error('Failed to create recap and slides:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'An internal server error occurred while creating the recap.'
    });
  }
});
