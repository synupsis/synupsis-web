import { serverSupabaseClient } from '#supabase/server';
import type { Database } from '~/types/database.types';
import OpenAI from 'openai';
import axios from 'axios';
import { defaultRecapPromptTemplate } from '~/lib/prompts/defaultPrompt';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const { showId, seasonId } = await readBody(event);

  if (!showId || !seasonId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing showId or seasonId' });
  }

  // Check if the default prompt should be enforced
  const {
    data: defaultPromptSetting,
    error: defaultPromptSettingError,
  } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'use_default_prompt')
    .single();

  if (defaultPromptSettingError && defaultPromptSettingError.code !== 'PGRST116') {
    console.error('Error fetching default prompt setting:', defaultPromptSettingError);
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch prompt settings.' });
  }

  const useDefaultPrompt = defaultPromptSetting?.value?.enabled === true;

  // Fetch active prompt
  let activePromptRecord: { id: string; content: string } | null = null;
  if (!useDefaultPrompt) {
    const { data: activePrompt, error: promptError } = await supabase
      .from('prompts')
      .select('id, content')
      .eq('is_active', true)
      .single();

    if (promptError && promptError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching active prompt:', promptError);
      // Not throwing an error, will use fallback in createPrompt
    } else {
      activePromptRecord = activePrompt;
    }
  }

  // Fetch show's trakt_id and season's number
  const { data: showDataFromDb, error: showErrorFromDb } = await supabase
    .from('show')
    .select('name, trakt_id') // Assuming trakt_id exists
    .eq('id', showId)
    .single();

  if (showErrorFromDb || !showDataFromDb || !showDataFromDb.trakt_id) {
    console.error('Failed to find show in DB or show is missing trakt_id:', showErrorFromDb);
    throw createError({ statusCode: 404, statusMessage: 'Show not found in database or is missing Trakt ID.' });
  }
  const showName = showDataFromDb.name;
  const traktShowId = showDataFromDb.trakt_id;

  const { data: seasonDataFromDb, error: seasonErrorFromDb } = await supabase
    .from('season')
    .select('number') // Assuming 'number' column exists for season number
    .eq('id', seasonId)
    .single();

  if (seasonErrorFromDb || !seasonDataFromDb || !seasonDataFromDb.number) {
    console.error('Failed to find season in DB or season is missing number:', seasonErrorFromDb);
    throw createError({ statusCode: 404, statusMessage: 'Season not found in database or is missing season number.' });
  }
  const seasonNumber = seasonDataFromDb.number;

  // 2. Fetch season details from Trakt
  let seasonDetails: any;
  try {
    const clientId = process.env.TRAKT_CLIENT_ID;
    const traktUrl = `https://api.trakt.tv/shows/${traktShowId}/seasons/${seasonNumber}?extended=full,episodes`;
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId
    };
    const response = await axios.get(traktUrl, { headers });
    const traktSeason = response.data;

    console.log('Trakt Response:', traktSeason);

    // Map Trakt response to expected structure for createPrompt
    seasonDetails = {
      number: seasonNumber,
      summary: traktSeason?.overview,
      _embedded: {
        episodes: traktSeason.map((ep: any) => ({
          number: ep.number,
          name: ep.title,
          summary: ep.overview,
        })),
      },
    };
  } catch (e) {
    console.error('Failed to fetch season details from Trakt:', e);
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch season data from Trakt.' });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // 3. Generate recap with OpenAI
  const promptTemplate = useDefaultPrompt ? defaultRecapPromptTemplate : activePromptRecord?.content;
  const prompt = createPrompt(seasonDetails, showName, promptTemplate);
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
      prompt_id: useDefaultPrompt ? null : activePromptRecord?.id || null, // Save the ID of the active prompt
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

function createPrompt(season: any, showName: string, promptTemplate?: string): string {
  const episodeSummaries = season._embedded.episodes
    .map((ep: any) => `Episode ${ep.number}: ${ep.name} - ${ep.summary?.replace(/<[^>]*>?/gm, '') || 'Résumé indisponible'}`)
    .join('\n');
  const seasonSummary = season.summary?.replace(/<[^>]*>?/gm, '') || 'Résumé indisponible';
  const template = promptTemplate ?? defaultRecapPromptTemplate;

  return template
    .replace(/{{showName}}/g, showName)
    .replace(/{{seasonNumber}}/g, season.number)
    .replace(/{{seasonSummary}}/g, seasonSummary)
    .replace(/{{episodeSummaries}}/g, episodeSummaries);
}
