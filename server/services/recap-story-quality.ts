import type { RecapEvent, RecapEventGraph } from '~/server/services/recap-generation';
import type { RecapStory } from '~/types/recap-story.types';

export type StoryText = {
  key: string;
  text: string;
  // Empty for the cover, which summarizes the whole season.
  eventIds: string[];
};

export type VaguePhrase = {
  key: string;
  phrase: string;
};

export type StorySpecificity = {
  checkedTexts: number;
  characterMentionRatio: number;
  vaguePhrases: VaguePhrase[];
};

export type StoryClaimVerification = {
  checkedTexts: number;
  correctedTexts: number;
  removedMoments: number;
  // Corrections whose text could not be replaced: the claim stays unsupported.
  unresolvedTexts: number;
  corrections: Array<{ key: string; unsupportedClaims: string[] }>;
};

// Formulas that sound like a recap but say nothing about what happens.
const VAGUE_PHRASE_PATTERNS: Array<[string, RegExp]> = [
  ['tout bascule', /\btout bascule\b/i],
  ['les tensions montent', /\bles tensions (montent|s['’]intensifient|s['’]exacerbent)\b/i],
  ['rien ne sera plus comme avant', /\brien ne sera (plus )?(jamais )?comme avant\b/i],
  ['d’autres surprises', /\bd['’]autres surprises\b/i],
  ['une découverte sinistre', /\bune découverte (sinistre|choquante|troublante|inattendue)\b/i],
  ['un secret menace', /\bun (lourd )?secret (menace|bouleverse|refait surface)\b/i],
  ['une décision difficile', /\bune décision (difficile|cruciale|lourde de conséquences)\b/i],
  ['faire face à son passé', /\bfai(re|t|sant) face à (son|ses|leur|leurs) (passé|démons)\b/i],
  ['les choses se compliquent', /\bles choses se (compliquent|corsent|gâtent)\b/i],
  ['un tournant décisif', /\bun tournant (décisif|inattendu|majeur)\b/i],
];
const NAME_PARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'van', 'von', 'der', 'den', 'al', 'el', 'ser', 'lord', 'lady']);

export const storyVerificationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['corrections'],
  properties: {
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'unsupportedClaims', 'correctedText'],
        properties: {
          key: { type: 'string' },
          unsupportedClaims: { type: 'array', items: { type: 'string' } },
          correctedText: { type: 'string' },
        },
      },
    },
  },
} as const;

/** Every reader-facing text of a story, with the scenes it claims to rely on. */
export function listStoryTexts(story: RecapStory): StoryText[] {
  return [
    { key: 'cover-logline', text: story.cover.logline, eventIds: [] },
    ...story.beats.flatMap((beat, index) => [
      { key: `beat-${index + 1}-headline`, text: beat.headline, eventIds: beat.eventIds },
      { key: `beat-${index + 1}-narration`, text: beat.narration, eventIds: beat.eventIds },
    ]),
    ...(story.episodes || []).flatMap(episode => [
      {
        key: `episode-${episode.episodeNumber}-headline`,
        text: episode.headline,
        eventIds: episode.moments.flatMap(moment => moment.eventIds),
      },
      ...episode.moments.map((moment, index) => ({
        key: `episode-${episode.episodeNumber}-moment-${index + 1}`,
        text: moment.text,
        eventIds: moment.eventIds,
      })),
    ]),
  ];
}

export function findVaguePhrases(story: RecapStory): VaguePhrase[] {
  return listStoryTexts(story).flatMap(({ key, text }) => VAGUE_PHRASE_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([phrase]) => ({ key, phrase })));
}

/** A precise text names at least one character of the scenes it cites. */
export function measureStorySpecificity(story: RecapStory, eventGraph: RecapEventGraph): StorySpecificity {
  const eventById = new Map(eventGraph.events.map(event => [event.id, event]));
  const aliasesByName = new Map((eventGraph.characterAliases || []).map(character => [character.name, character.aliases]));
  const texts = listStoryTexts(story).filter(text => /-(narration|moment-\d+)$/.test(text.key));
  const mentioning = texts.filter((text) => {
    const words = new Set(tokenize(text.text));
    return text.eventIds
      .flatMap(id => eventById.get(id)?.characters || [])
      .flatMap(name => [name, ...(aliasesByName.get(name) || [])])
      .some(name => tokenize(name).some(token => token.length >= 3 && !NAME_PARTICLES.has(token) && words.has(token)));
  });

  return {
    checkedTexts: texts.length,
    characterMentionRatio: texts.length ? Math.round((mentioning.length / texts.length) * 100) / 100 : 1,
    vaguePhrases: findVaguePhrases(story),
  };
}

export function createStoryVerificationPrompt(story: RecapStory, eventGraph: RecapEventGraph): string {
  const scenes = eventGraph.events.map(formatSceneForVerification).join('\n');
  const texts = listStoryTexts(story).map(text => [
    `<<${text.key}>> scènes citées : ${text.eventIds.length ? text.eventIds.join(', ') : 'toutes les scènes'}`,
    text.text,
  ].join('\n')).join('\n\n');

  return `
# RÔLE
Tu vérifies un recap de série avant publication. Chaque texte doit être entièrement soutenu par les scènes qu'il cite.

# SCÈNES VÉRIFIÉES
${scenes}

# TEXTES DU RECAP
${texts}

# CONSIGNES
- Pour chaque texte, contrôle chaque affirmation : personnage, action, lieu, cause, conséquence, chiffre, date. Elle doit figurer dans les scènes citées par ce texte (dans toutes les scènes pour la couverture).
- Un texte qui contient une affirmation non soutenue, ou une formule creuse (« tout bascule », « les tensions montent », « rien ne sera plus comme avant »…), doit être corrigé.
- correctedText réécrit le texte en français en ne gardant que ce que les scènes citées soutiennent, en restant aussi précis que possible et sans dépasser la longueur d'origine. Ne rajoute aucun fait absent des scènes.
- unsupportedClaims liste les affirmations retirées ou les formules creuses remplacées.
- Si plus rien d'exact ne peut être dit pour un moment d'épisode, laisse correctedText vide : le moment sera supprimé.
- Ne liste que les textes à corriger, avec leur clé exacte. Une liste vide signifie que tout est soutenu.
- N'utilise aucune connaissance extérieure.

# SORTIE
Respecte exactement le schéma structuré fourni par l'API.
`.trim();
}

export function applyStoryCorrections(
  story: RecapStory,
  responseText: string,
): { story: RecapStory; verification: StoryClaimVerification } {
  const raw = JSON.parse(responseText);
  const corrected: RecapStory = structuredClone(story);
  const removedMoments = new Set<string>();
  const verification: StoryClaimVerification = {
    checkedTexts: listStoryTexts(story).length,
    correctedTexts: 0,
    removedMoments: 0,
    unresolvedTexts: 0,
    corrections: [],
  };

  (Array.isArray(raw?.corrections) ? raw.corrections : []).forEach((correction: any) => {
    const key = typeof correction?.key === 'string' ? correction.key.trim() : '';
    const text = typeof correction?.correctedText === 'string' ? correction.correctedText.replace(/\s+/g, ' ').trim() : '';
    const unsupportedClaims = (Array.isArray(correction?.unsupportedClaims) ? correction.unsupportedClaims : [])
      .filter((claim: unknown): claim is string => typeof claim === 'string' && Boolean(claim.trim()))
      .map((claim: string) => claim.trim());
    const outcome = applyCorrection(corrected, key, text, removedMoments);
    if (outcome === 'unknown') return;
    verification.corrections.push({ key, unsupportedClaims });
    if (outcome === 'replaced') verification.correctedTexts += 1;
    if (outcome === 'unresolved') verification.unresolvedTexts += 1;
  });

  corrected.episodes = (corrected.episodes || [])
    .map(episode => ({
      ...episode,
      moments: episode.moments.filter((_, index) => !removedMoments.has(`${episode.episodeNumber}:${index + 1}`)),
    }))
    .filter(episode => episode.moments.length > 0);
  verification.removedMoments = removedMoments.size;
  return { story: corrected, verification };
}

function applyCorrection(
  story: RecapStory,
  key: string,
  text: string,
  removedMoments: Set<string>,
): 'replaced' | 'removed' | 'unresolved' | 'unknown' {
  if (key === 'cover-logline') {
    if (!text) return 'unresolved';
    story.cover.logline = text;
    return 'replaced';
  }

  const beatMatch = key.match(/^beat-(\d+)-(headline|narration)$/);
  if (beatMatch) {
    const beat = story.beats[Number(beatMatch[1]) - 1];
    if (!beat) return 'unknown';
    if (!text) return 'unresolved';
    beat[beatMatch[2] as 'headline' | 'narration'] = text;
    return 'replaced';
  }

  const episodeMatch = key.match(/^episode-(\d+)-(headline|moment-(\d+))$/);
  const episode = episodeMatch
    ? (story.episodes || []).find(item => item.episodeNumber === Number(episodeMatch[1]))
    : undefined;
  if (!episodeMatch || !episode) return 'unknown';
  if (episodeMatch[2] === 'headline') {
    if (!text) return 'unresolved';
    episode.headline = text;
    return 'replaced';
  }
  const momentIndex = Number(episodeMatch[3]);
  const moment = episode.moments[momentIndex - 1];
  if (!moment) return 'unknown';
  if (!text) {
    removedMoments.add(`${episode.episodeNumber}:${momentIndex}`);
    return 'removed';
  }
  moment.text = text;
  return 'replaced';
}

function formatSceneForVerification(event: RecapEvent): string {
  return [
    `[${event.id}] Épisode ${event.episodeNumbers.join(', ')} · ${event.title} — ${event.description}`,
    event.location ? `Lieu : ${event.location}` : null,
    event.detail ? `Détail : ${event.detail}` : null,
    event.characters.length ? `Personnages : ${event.characters.join(', ')}` : null,
  ].filter(Boolean).join(' · ');
}

function tokenize(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
