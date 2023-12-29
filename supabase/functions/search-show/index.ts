import { corsHeaders } from '../_shared/cors.ts';
import axiod from 'https://deno.land/x/axiod/mod.ts';
import type { TvMazeShowSearch } from '~/types/tv-maze.types.ts';

Deno.serve(async (req: Request) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    const search = await axiod.get(`https://api.tvmaze.com/search/shows?q=${query}`);

    const searchData: Array<TvMazeShowSearch> = search.data;

    const shows = searchData.map((item) => ({
      id: item.show.id,
      name: item.show.name,
      premiered: item.show.premiered ? new Date(item.show.premiered) : null,
      ended: item.show.ended ? new Date(item.show.ended) : null
    })).filter((item) => item.premiered);

    const data = {
      shows
    };

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    if (error instanceof Error) {
      return new Response(JSON.stringify({ error: error?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }
  }
});
