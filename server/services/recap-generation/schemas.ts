// A bilan or season-end line: a full sentence naming its character (empty for a question).
const storyChangeJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['character', 'text', 'eventIds'],
  properties: {
    character: { type: 'string' },
    text: { type: 'string' },
    eventIds: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const recapStoryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cover', 'episodes', 'ending'],
  properties: {
    cover: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'subtitle', 'logline'],
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        logline: { type: 'string' },
      },
    },
    episodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['episodeNumber', 'headline', 'moments', 'changes'],
        properties: {
          episodeNumber: { type: 'integer' },
          headline: { type: 'string' },
          moments: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'eventIds'],
              properties: {
                text: { type: 'string' },
                eventIds: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          changes: {
            type: 'object',
            additionalProperties: false,
            required: ['deaths', 'situations', 'questions'],
            properties: {
              deaths: { type: 'array', items: storyChangeJsonSchema },
              situations: { type: 'array', items: storyChangeJsonSchema },
              questions: { type: 'array', items: storyChangeJsonSchema },
            },
          },
        },
      },
    },
    ending: {
      type: 'object',
      additionalProperties: false,
      required: ['characters', 'questions'],
      properties: {
        characters: { type: 'array', items: storyChangeJsonSchema },
        questions: { type: 'array', items: storyChangeJsonSchema },
      },
    },
  },
} as const;

const sceneQuoteJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['evidenceId', 'text'],
  properties: {
    evidenceId: { type: 'string' },
    text: { type: 'string' },
  },
} as const;

const episodeSceneRequiredFields = [
  'title',
  'action',
  'location',
  'detail',
  'detailQuote',
  'characters',
  'importance',
  'quote',
  'evidenceIds',
  'contradictionEvidenceIds',
] as const;

const episodeSceneProperties = {
  title: { type: 'string' },
  action: { type: 'string' },
  location: { type: ['string', 'null'] },
  detail: { type: ['string', 'null'] },
  detailQuote: { anyOf: [sceneQuoteJsonSchema, { type: 'null' }] },
  characters: { type: 'array', items: { type: 'string' } },
  importance: { type: 'string', enum: ['supporting', 'major', 'critical'] },
  quote: sceneQuoteJsonSchema,
  evidenceIds: { type: 'array', items: { type: 'string' } },
  contradictionEvidenceIds: { type: 'array', items: { type: 'string' } },
} as const;

export const recapEpisodeScenesJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scenes'],
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: episodeSceneRequiredFields,
        properties: episodeSceneProperties,
      },
    },
  },
} as const;

export const recapSceneCriticJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['gaps'],
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['episodeNumber', 'moment'],
        properties: {
          episodeNumber: { type: 'integer' },
          moment: { type: 'string' },
        },
      },
    },
  },
} as const;

export const recapSceneRecoveryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scenes'],
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [...episodeSceneRequiredFields, 'gapNumber', 'afterSceneIndex'],
        properties: {
          ...episodeSceneProperties,
          gapNumber: { type: 'integer' },
          afterSceneIndex: { type: 'integer' },
        },
      },
    },
  },
} as const;

export const recapSceneLinksJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characters', 'scenes'],
  properties: {
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'aliases'],
        properties: {
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'arc', 'causedByEventIds', 'consequenceEventIds'],
        properties: {
          id: { type: 'string' },
          arc: { type: 'string' },
          causedByEventIds: { type: 'array', items: { type: 'string' } },
          consequenceEventIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;
