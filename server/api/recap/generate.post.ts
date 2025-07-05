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
  let slides;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-nano-2025-04-14',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;

    if (!content) {
      throw new Error('OpenAI returned an empty content.');
    }
    slides = JSON.parse(content).slides;

    // --- Layout Sanitization ---
    // We override the AI's coordinates to ensure everything is visible.
    let currentY = 150; // Initial Y position
    const verticalSpacing = 40; // Space between groups
    const canvasWidth = 1920;

    // recapGroups = rawGroups.map((group: any) => {
    //   const newGroup = { ...group }; // Create a shallow copy
    //
    //   // Override position
    //   const groupWidth = newGroup.attrs.rect.width || (canvasWidth - 200);
    //   newGroup.attrs.x = (canvasWidth - groupWidth) / 2; // Center horizontally
    //   newGroup.attrs.y = currentY;
    //
    //   // Update Y for the next element
    //   const groupHeight = newGroup.attrs.rect.height || 100; // Use AI height or a fallback
    //   currentY += groupHeight + verticalSpacing;
    //
    //   return newGroup;
    // });

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

  const slidesToInsert = slides.map((slide: any) => ({
    canvas_data: slide.canvas,
    recap_id: recap.id,
    order: slide.order,
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
# ROLE
Tu es un assistant expert en génération de JSON pour des canevas Konva.js.

# TÂCHE
Ta mission est de résumer une saison de série TV en 5 à 8 moments clés. Chaque moment clé doit être formaté comme une "slide" dans un objet JSON Konva \`Stage\` distinct. Tu dois retourner un tableau d'objets, où chaque objet contient un numéro d'ordre et le JSON du canevas.

# FORMAT DE SORTIE ATTENDU
Tu dois produire UNIQUEMENT un tableau JSON valide, sans aucun texte avant ou après. La structure doit être :
\`{ "slides": [{ "order": 1, "canvas": { ...JSON Konva... } }, { "order": 2, "canvas": { ...JSON Konva... } }] }\`

# INSTRUCTIONS DÉTAILLÉES
1.  **Slide 1 (Titre)** : La première slide doit contenir le nom de la série et le numéro de la saison.
2.  **Slides suivantes (Moments clés)** : Chaque slide suivante doit décrire un seul événement majeur de la saison, de manière concise.
3.  **Contenu du Texte** : Remplis l'attribut \`text\` des objets \`Text\` avec le contenu approprié. Utilise \`\\n\` pour les sauts de ligne si nécessaire.
4.  **Ajustement des Dimensions** : Adapte les valeurs \`width\` et \`height\` des objets \`Rect\` pour qu'elles correspondent à la taille du texte. Ajuste les coordonnées \`x\` et \`y\` pour centrer les éléments de manière esthétique.
5.  **Structure JSON** : Respecte scrupuleusement la structure de l'exemple ci-dessous pour chaque slide. Seuls les contenus textuels et les attributs de géométrie (\`x\`, \`y\`, \`width\`, \`height\`) doivent changer.

# EXEMPLE DE JSON POUR UNE SEULE SLIDE
{
    "order": 1,
    "canvas": {
        "attrs": { "width": 368, "height": 796 },
        "children": [
            {
                "attrs": {},
                "className": "Layer",
                "children": [
                    {
                        "attrs": {
                            "x": 95, "y": 143,
                            "draggable": true
                        },
                        "className": "Group",
                        "children": [
                            { "attrs": { "fill": "#fff", "width": 222, "height": 52, "cornerRadius": 10 }, "className": "Rect" },
                            { "attrs": { "fill": "#000", "text": "Breaking Bad", "padding": 10, "fontSize": 32, "fontFamily": "\\"Fredoka One\\", cursive" }, "className": "Text" }
                        ]
                    },
                    {
                        "attrs": {
                            "x": 38, "y": 346,
                            "draggable": true
                        },
                        "className": "Group",
                        "children": [
                            { "attrs": { "fill": "#fff", "width": 328, "height": 180, "cornerRadius": 10 }, "className": "Rect" },
                            { "attrs": { "fill": "#000", "text": "Walt apprend qu'il\\na un cancer et\\ns'associe avec Jesse.", "padding": 10, "fontSize": 32, "fontFamily": "\\"Fredoka One\\", cursive" }, "className": "Text" }
                        ]
                    }
                ]
            }
        ],
        "className": "Stage"
    }
}

# DEMANDE UTILISATEUR
    The recap is for "${showName}", Season ${season.number}.
    Use this information:
    - Season Summary: ${season.summary?.replace(/<[^>]*>?/gm, '')}
    - Episodes: ${episodeSummaries}
  `;
}
