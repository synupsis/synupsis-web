import { corsHeaders } from '../_shared/cors.ts';
import axiod from 'https://deno.land/x/axiod/mod.ts';
import type { Database, Season, Show } from '~/types/database.types';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';
import type { TvMazeShow } from '~/types/tv-maze.types.ts';

Deno.serve(async (req: Request) => {

  const supabase = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { slug } = await req.json();
    const TVMazeId = slug.split('-').pop();

    let show: Show;

    const { data: existingShow } = await supabase
      .from('show')
      .select()
      .eq('tv_maze_id', TVMazeId)
      .maybeSingle();

    if (existingShow) {

      const { data: seasons, error: getSeasonsError }: Array<Season> = await supabase
        .from('season')
        .select()
        .eq('show_id', existingShow.id);

      if (getSeasonsError) {
        console.error(getSeasonsError);
        throw new Error(getSeasonsError.message);
      }

      show = {
        ...existingShow,
        seasons
      };
    } else {
      const { data: TVMazeShow }: {
        data: TvMazeShow
      } = await axiod.get(`https://api.tvmaze.com/shows/${TVMazeId}?embed=seasons`);

      const { id: ShowTVMazeId, name: showName, genres, image, summary, _embedded }: TvMazeShow = TVMazeShow;

      const { data: createdShow, error: createShowError } = await supabase
        .from('show')
        .insert([
          { tv_maze_id: ShowTVMazeId, name: showName, language: 'en', genres, image: image.original, summary }
        ])
        .select()
        .maybeSingle();

      if (createShowError) {
        console.error(createShowError);
        throw new Error(createShowError.message);
      }

      const createdShowSeasons = _embedded.seasons.map(season => ({
        tv_maze_id: season.id,
        name: season.name,
        number: season.number,
        show_id: createdShow.id
      }));

      const { data: createdSeasons, error: createSeasonsError } = await supabase
        .from('season')
        .insert(createdShowSeasons)
        .select();

      if (createSeasonsError) {
        console.error(createSeasonsError);
        throw new Error(createSeasonsError.message);
      }

      show = {
        ...createdShow,
        seasons: createdSeasons
      };

    }


    const data = {
      show
    };

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    if (error instanceof Error) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

  }
});
