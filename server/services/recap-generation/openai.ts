import OpenAI from 'openai';
import { retrieveStreamedResponse, startStreamedResponse } from '~/server/services/openai-streamed-responses';
import { RECAP_EVENT_PROMPT_VERSION, RECAP_PROMPT_VERSION } from '~/server/services/recap-generation/config';
import {
  recapEpisodeScenesJsonSchema,
  recapSceneCriticJsonSchema,
  recapSceneLinksJsonSchema,
  recapSceneRecoveryJsonSchema,
  recapStoryJsonSchema,
} from '~/server/services/recap-generation/schemas';
import { storyVerificationJsonSchema } from '~/server/services/recap-story-quality';

export function getRecapModel(): string {
  return process.env.OPENAI_RECAP_MODEL || 'gpt-5.6';
}

export function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return new OpenAI({ apiKey });
}

export async function startEpisodeExtraction(input: {
  prompt: string;
  model: string;
  jobId: string;
  episodeNumber: number;
  maxOutputTokens: number;
}): Promise<{ id: string; status: string }> {
  return await startStreamedResponse(createOpenAIClient(), {
    model: input.model,
    instructions: [
      'Tu extrais les scènes précises d’un épisode depuis les seules sources fournies.',
      'Ne rédige pas le recap final et ne complète jamais une information avec ta mémoire.',
      'Chaque scène cite mot pour mot le passage de la source qui la prouve.',
    ].join(' '),
    input: input.prompt,
    max_output_tokens: input.maxOutputTokens,
    metadata: {
      feature: 'synupsis_recap_scenes',
      generation_job_id: input.jobId,
      episode_number: String(input.episodeNumber),
      prompt_version: RECAP_EVENT_PROMPT_VERSION,
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'synupsis_recap_episode_scenes',
        description: 'The quoted, chronological scenes of one episode.',
        strict: true,
        schema: recapEpisodeScenesJsonSchema,
      },
    },
  });
}

export async function startSceneLinking(input: {
  prompt: string;
  model: string;
  jobId: string;
}): Promise<{ id: string; status: string }> {
  return await startStreamedResponse(createOpenAIClient(), {
    model: input.model,
    instructions: [
      'Tu relies des scènes vérifiées : arcs narratifs, causes directes et variantes de noms des personnages.',
      'Tu ne crées, ne modifies et ne supprimes aucun fait.',
    ].join(' '),
    input: input.prompt,
    max_output_tokens: 24_000,
    metadata: {
      feature: 'synupsis_recap_scene_links',
      generation_job_id: input.jobId,
      prompt_version: RECAP_EVENT_PROMPT_VERSION,
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'synupsis_recap_scene_links',
        description: 'Arcs, causal links and character aliases for the scenes of a season.',
        strict: true,
        schema: recapSceneLinksJsonSchema,
      },
    },
  });
}

export async function startRecapGeneration(input: {
  prompt: string;
  model: string;
  jobId: string;
}): Promise<{ id: string; status: string }> {
  return await startStreamedResponse(createOpenAIClient(), {
    model: input.model,
    instructions: [
      'Tu produis un recap factuel en français à partir des seules scènes fournies.',
      'Ne complète jamais une scène avec ta mémoire ou avec des détails absents.',
      'Chaque moment doit citer les identifiants exacts des scènes qui prouvent sa narration.',
      'Le recap peut révéler toute la saison demandée mais jamais les saisons suivantes.',
    ].join(' '),
    input: input.prompt,
    max_output_tokens: 24_000,
    metadata: {
      feature: 'synupsis_recap',
      generation_job_id: input.jobId,
      prompt_version: RECAP_PROMPT_VERSION,
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'synupsis_recap_story',
        description: 'A source-grounded season recap: a cover, the season turning points, then the key moments of each episode.',
        strict: true,
        schema: recapStoryJsonSchema,
      },
    },
  });
}

export async function startSceneCritic(input: {
  prompt: string;
  model: string;
  jobId: string;
}): Promise<{ id: string; status: string }> {
  return await startStreamedResponse(createOpenAIClient(), {
    model: input.model,
    instructions: [
      'Tu signales les moments majeurs absents d’une chronologie de saison, épisode par épisode.',
      'Tu ne signales que des moments dont tu es certain, et tu t’abstiens dans le doute.',
    ].join(' '),
    input: input.prompt,
    max_output_tokens: 16_000,
    metadata: {
      feature: 'synupsis_recap_scene_critic',
      generation_job_id: input.jobId,
      prompt_version: RECAP_EVENT_PROMPT_VERSION,
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'synupsis_recap_scene_critic',
        description: 'Major moments that seem to be missing from each episode of a season timeline.',
        strict: true,
        schema: recapSceneCriticJsonSchema,
      },
    },
  });
}

export async function startSceneRecovery(input: {
  prompt: string;
  model: string;
  jobId: string;
  episodeNumber: number;
}): Promise<{ id: string; status: string }> {
  return await startStreamedResponse(createOpenAIClient(), {
    model: input.model,
    instructions: [
      'Tu cherches des moments signalés dans les seules sources d’un épisode.',
      'Tu ne crées une scène que si un passage la décrit, avec une citation mot pour mot ; sinon tu ne renvoies rien.',
    ].join(' '),
    input: input.prompt,
    max_output_tokens: 12_000,
    metadata: {
      feature: 'synupsis_recap_scene_recovery',
      generation_job_id: input.jobId,
      episode_number: String(input.episodeNumber),
      prompt_version: RECAP_EVENT_PROMPT_VERSION,
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'synupsis_recap_scene_recovery',
        description: 'Quoted scenes for the suggested moments the episode sources describe.',
        strict: true,
        schema: recapSceneRecoveryJsonSchema,
      },
    },
  });
}

export async function startStoryVerification(input: {
  prompt: string;
  model: string;
  jobId: string;
}): Promise<{ id: string; status: string }> {
  return await startStreamedResponse(createOpenAIClient(), {
    model: input.model,
    instructions: [
      'Tu vérifies qu’un recap ne contient que des affirmations soutenues par les scènes qu’il cite.',
      'Tu corriges les textes fautifs sans ajouter de fait, et tu n’utilises jamais ta mémoire.',
    ].join(' '),
    input: input.prompt,
    max_output_tokens: 24_000,
    metadata: {
      feature: 'synupsis_recap_verification',
      generation_job_id: input.jobId,
      prompt_version: RECAP_PROMPT_VERSION,
    },
    text: {
      format: {
        type: 'json_schema',
        name: 'synupsis_recap_story_verification',
        description: 'Corrections for the recap texts that contain unsupported claims or empty phrasing.',
        strict: true,
        schema: storyVerificationJsonSchema,
      },
    },
  });
}

export async function retrieveRecapGeneration(responseId: string) {
  return retrieveStreamedResponse(createOpenAIClient(), responseId);
}
