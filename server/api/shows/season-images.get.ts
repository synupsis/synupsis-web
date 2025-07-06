import { serverSupabaseClient } from '#supabase/server';
import { CompatibilityEvent } from 'h3';
import axios from 'axios';

export default defineEventHandler(async (event: CompatibilityEvent) => {
  const supabase = await serverSupabaseClient(event);
  const { seasonId } = getQuery(event);

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
    const traktUrl = `https://api.trakt.tv/shows/${showData.trakt_id}/seasons/${seasonData.number}?extended=images`;
    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId
    };

    const { data: traktSeason } = await axios.get(traktUrl, { headers });

    // Trakt API returns images directly on the season object
    const images = [];
    if (traktSeason.images && traktSeason.images.poster && traktSeason.images.poster.full) {
      images.push(traktSeason.images.poster.full);
    }
    if (traktSeason.images && traktSeason.images.fanart && traktSeason.images.fanart.full) {
      images.push(traktSeason.images.fanart.full);
    }

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
