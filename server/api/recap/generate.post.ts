import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const { showId, seasonId } = await readBody(event);

  if (!showId || !seasonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing showId or seasonId' });
  }

  // 1. Get Show and Season details from our database
  const { data: showData, error: showError } = await supabase
    .from('show')
    .select('name')
    .eq('id', showId)
    .single();

  if (showError || !showData) {
    console.error('Failed to find show in DB:', showError);
    throw createError({ statusCode: 404, statusMessage: 'Show not found in database.' });
  }
  const showName = showData.name;

  const { data: seasonData, error: seasonError } = await supabase
    .from('season')
    .select('tv_maze_id')
    .eq('id', seasonId)
    .single();

  if (seasonError || !seasonData || !seasonData.tv_maze_id) {
    console.error('Failed to find season in DB or season is missing tv_maze_id:', seasonError);
    throw createError({ statusCode: 404, statusMessage: 'Season not found in database or is missing TVMaze ID.' });
  }
  const tvMazeSeasonId = seasonData.tv_maze_id;

  // 2. Fetch season details from TVMaze
  let seasonDetails: any;
  try {
    seasonDetails = await $fetch(`https://api.tvmaze.com/seasons/${tvMazeSeasonId}?embed=episodes`);
  } catch (e) {
    console.error('Failed to fetch season details from TVMaze:', e);
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch season data.' });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // 3. Generate recap with OpenAI
  const prompt = createPrompt(seasonDetails, showName);
  let recapGroups;

  try {
    const response = await openai.chat.completions.create({
      model: 'o4-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('OpenAI returned an empty content.');
    }
    const rawGroups = JSON.parse(content).groups;

    // --- Layout Sanitization ---
    // We override the AI's coordinates to ensure everything is visible.
    let currentY = 150; // Initial Y position
    const verticalSpacing = 40; // Space between groups
    const canvasWidth = 1920;

    recapGroups = rawGroups.map((group: any) => {
      const newGroup = { ...group }; // Create a shallow copy

      // Override position
      const groupWidth = newGroup.attrs.rect.width || (canvasWidth - 200);
      newGroup.attrs.x = (canvasWidth - groupWidth) / 2; // Center horizontally
      newGroup.attrs.y = currentY;

      // Update Y for the next element
      const groupHeight = newGroup.attrs.rect.height || 100; // Use AI height or a fallback
      currentY += groupHeight + verticalSpacing;

      return newGroup;
    });

  } catch (e) {
    console.error('Failed to generate or process recap with OpenAI:', e);
    throw createError({ statusCode: 500, statusMessage: 'Failed to generate recap with AI.' });
  }

  // 4. Save to database
  const { data: recap, error: recapError } = await supabase
    .from('recap')
    .insert({
      show_id: showId,
      season_id: seasonId,
      user_id: user.id,
      status: 'published', // Set status to published directly
    })
    .select()
    .single();

  if (recapError) {
    console.error('Failed to create recap in DB:', recapError);
    throw createError({ statusCode: 500, statusMessage: 'Failed to save recap.' });
  }

  const slidesToInsert = recapGroups.map((group: any, index: number) => ({
    canvas_data: group,
    recap_id: recap.id,
    order: index,
  }));

  const { error: slidesError } = await supabase.from('slide').insert(slidesToInsert);

  if (slidesError) {
    console.error('Failed to save slides in DB:', slidesError);
    await supabase.from('recap').delete().eq('id', recap.id);
    throw createError({ statusCode: 500, statusMessage: 'Failed to save recap slides.' });
  }

  return { recapId: recap.id };
});

function createPrompt(season: any, showName: string): string {
  const episodeSummaries = season._embedded.episodes.map((ep: any) => `Episode ${ep.number}: ${ep.name} - ${ep.summary?.replace(/<[^>]*>?/gm, '')}`).join('\n');

  return `
    Generate a JSON object for a TV show season recap. The object must have a single key "groups", which is an array of Konva.js "Group" objects.

    The recap is for "${showName}", Season ${season.number}.
    Use this information:
    - Season Summary: ${season.summary?.replace(/<[^>]*>?/gm, '')}
    - Episodes: ${episodeSummaries}

    The canvas is 1920x1080.

    **Instructions:**
    1.  The final output MUST be a single valid JSON object with the "groups" key. Do not add any text outside the JSON structure.
    2.  Create 7 to 12 "Group" objects in the "groups" array.
    3.  Each "Group" object represents a draggable text block.
    4.  The first group should be the show's title. Make it large (fontSize ~72).
    5.  The second group should be the season number. Place it below the title.
    6.  The following groups should summarize the season's key plot points chronologically.
    7.  The last group should be a concluding phrase (e.g., "The story continues...").
    8.  Distribute the groups vertically using the 'y' coordinate. Start around y=100 and increment for each group. Keep x-coordinates consistent for alignment.
    9.  For each group, you MUST generate a unique ID for 'id' and 'name' like "group-1751736576500". You can use a timestamp-like number.
    10. The 'text' content inside each group should be concise.
    11. The 'width' and 'height' of the inner 'Rect' must be calculated to fit the text content, including padding. This is important.

    **This is an example of a valid JSON structure for one slide that you must follow:**
    {
        "attrs": {
          "width": 368,
          "height": 796.3897435897436,
          "scaleX": 0.9435897435897436,
          "scaleY": 0.9435897435897436
        },
        "children": [
          {
            "attrs": {},
            "children": [
              {
                "attrs": {
                  "x": 95.82714516007997,
                  "y": 143.77777777777777,
                  "id": "group-1751742011974",
                  "name": "group-1751742011974",
                  "rect": {
                    "fill": "#fff",
                    "width": 222.14390563964844,
                    "height": 52,
                    "cornerRadius": 10
                  },
                  "text": {
                    "fill": "#000",
                    "text": "Breaking Bad",
                    "padding": 10,
                    "fontSize": 32,
                    "fontFamily": "\\"Fredoka One\\", cursive"
                  },
                  "draggable": true
                },
                "children": [
                  {
                    "attrs": {
                      "fill": "#fff",
                      "width": 222.14390563964844,
                      "height": 52,
                      "cornerRadius": 10
                    },
                    "className": "Rect"
                  },
                  {
                    "attrs": {
                      "fill": "#000",
                      "text": "Breaking Bad",
                      "padding": 10,
                      "fontSize": 32,
                      "fontFamily": "\\"Fredoka One\\", cursive"
                    },
                    "className": "Text"
                  }
                ],
                "className": "Group"
              },
              {
                "attrs": {
                  "x": 122.5662734573049,
                  "y": 236.41342309420142,
                  "id": "group-1751742039209",
                  "name": "group-1751742039209",
                  "rect": {
                    "fill": "#fff",
                    "width": 157.69593811035156,
                    "height": 52,
                    "cornerRadius": 10
                  },
                  "text": {
                    "fill": "#000",
                    "text": "SAISON 1",
                    "padding": 10,
                    "fontSize": 32,
                    "fontFamily": "\\"Fredoka One\\", cursive"
                  },
                  "draggable": true
                },
                "children": [
                  {
                    "attrs": {
                      "fill": "#fff",
                      "width": 157.69593811035156,
                      "height": 52,
                      "cornerRadius": 10
                    },
                    "className": "Rect"
                  },
                  {
                    "attrs": {
                      "fill": "#000",
                      "text": "SAISON 1",
                      "padding": 10,
                      "fontSize": 32,
                      "fontFamily": "\\"Fredoka One\\", cursive"
                    },
                    "className": "Text"
                  }
                ],
                "className": "Group"
              },
              {
                "attrs": {
                  "x": 38.34239130434783,
                  "y": 346.59940081756315,
                  "id": "group-1751742335439",
                  "name": "group-1751742335439",
                  "rect": {
                    "fill": "#fff",
                    "width": 328.28790283203125,
                    "height": 180,
                    "cornerRadius": 10
                  },
                  "text": {
                    "fill": "#000",
                    "text": "Walt apprend qu'il\\na un cancer et\\ns'associe avec Jesse\\npour produire\\nde la meth.",
                    "padding": 10,
                    "fontSize": 32,
                    "fontFamily": "\\"Fredoka One\\", cursive"
                  },
                  "draggable": true
                },
                "children": [
                  {
                    "attrs": {
                      "fill": "#fff",
                      "width": 328.28790283203125,
                      "height": 180,
                      "cornerRadius": 10
                    },
                    "className": "Rect"
                  },
                  {
                    "attrs": {
                      "fill": "#000",
                      "text": "Walt apprend qu'il\\na un cancer et\\ns'associe avec Jesse\\npour produire\\nde la meth.",
                      "padding": 10,
                      "fontSize": 32,
                      "fontFamily": "\\"Fredoka One\\", cursive"
                    },
                    "className": "Text"
                  }
                ],
                "className": "Group"
              },
              {
                "attrs": {
                  "x": 35.16304347826087,
                  "y": 346.59940081756315
                },
                "className": "Transformer"
              }
            ],
            "className": "Layer"
          }
        ],
        "className": "Stage"
      }
  `;
}
