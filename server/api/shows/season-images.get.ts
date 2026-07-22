import { serverSupabaseClient } from '#supabase/server';
import type { H3Event } from 'h3';
import axios from 'axios';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async (event: H3Event) => {
  const supabase = await serverSupabaseClient<Database>(event);
  const { seasonId: rawSeasonId } = getQuery(event);
  const seasonId = typeof rawSeasonId === 'string' ? rawSeasonId : null;

  if (!seasonId) {
    return {
      statusCode: 400,
      body: {
        message: 'Season ID is required'
      }
    };
  }

  // Fetch season details from our DB to get show_id and season number
  const { data: seasonData, error: seasonError } = await supabase
    .from('season')
    .select('show_id, number')
    .eq('id', seasonId)
    .single();

  if (seasonError || !seasonData) {
    console.error('Failed to fetch season from DB:', seasonError);
    return {
      statusCode: 404,
      body: {
        message: 'Season not found in database'
      }
    };
  }

  // Fetch show details from our DB to get trakt_id
  const { data: showData, error: showError } = await supabase
    .from('show')
    .select('trakt_id')
    .eq('id', seasonData.show_id)
    .single();

  if (showError || !showData || !showData.trakt_id) {
    console.error('Failed to fetch show from DB or show is missing trakt_id:', showError);
    return {
      statusCode: 404,
      body: {
        message: 'Show not found in database or is missing Trakt ID'
      }
    };
  }

  try {
    const clientId = process.env.TRAKT_CLIENT_ID;
    if (!clientId) {
      throw new Error('TRAKT_CLIENT_ID is not configured.');
    }
    const traktUrl = `https://api.trakt.tv/shows/${showData.trakt_id}/seasons/${seasonData.number}?extended=full`;
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId
    };

    const { data: traktEpisodes } = await axios.get(traktUrl, { headers, timeout: 15_000 });

    const images = traktEpisodes.flatMap((episode: any) => {
      const screenshotUrls = episode?.images?.screenshot;
      if (Array.isArray(screenshotUrls)) {
        return screenshotUrls.map((url: string) => {
          if (!url) {
            return null;
          }
          // The URL from Trakt might not have a protocol
          const medium = url.startsWith('http') ? url : `https://${url}`;
          // Create the 'original' (full) URL by replacing size identifier.
          const original = medium.replace('/medium/', '/full/');
          return { original, medium, episode: episode.number };
        }).filter(Boolean); // Filter out any null entries
      }
      return []; // Return empty array if no screenshots
    });

    return {
      statusCode: 200,
      body: images
    };
  } catch (e) {
    console.error('Failed to fetch images from Trakt:', e);
    return {
      statusCode: 500,
      body: {
        message: 'Failed to fetch images from Trakt',
        error: e
      }
    };
  }
});
