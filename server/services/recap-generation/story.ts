import { DEFAULT_RECAP_LOCALE, normalizeRecapLocale } from '~/lib/recap-locales';
import { MAX_MOMENTS_PER_EPISODE } from '~/server/services/recap-generation/config';
import { evaluateRecapEventGraph } from '~/server/services/recap-generation/scene-graph';
import { buildRecapSlides } from '~/server/services/recap-generation/slides';
import { evaluateRecapSourceReadiness } from '~/server/services/recap-generation/sources';
import type {
  GeneratedSlide,
  RecapEvent,
  RecapEventGraph,
  RecapQualityReport,
  RecapSourceSnapshot,
} from '~/server/services/recap-generation/types';
import {
  getAllEvidence,
  listEpisodeChanges,
  minimumEpisode,
  normalizeCharacterKey,
  ratio,
  roundScore,
  sanitizeText,
  toPositiveInteger,
  uniqueIdentifiers,
} from '~/server/services/recap-generation/utils';
import { applyStoryCorrections, measureStorySpecificity, type StoryClaimVerification } from '~/server/services/recap-story-quality';
import type { RecapStory, RecapStoryChange, RecapStoryEpisode, RecapStoryMoment } from '~/types/recap-story.types';

const MAX_MOMENT_CHARS = 240;
// A bilan lists what an episode changed; it does not retell the episode.
const MAX_CHANGE_DEATHS = 4;
const MAX_CHANGE_SITUATIONS = 5;
const MAX_CHANGE_QUESTIONS = 2;
const MAX_CHANGE_CHARS = 200;
const MIN_ENDING_CHARACTERS = 3;
const MAX_ENDING_CHARACTERS = 8;
const MAX_ENDING_QUESTIONS = 4;
// Share of story texts that must name a character of the scenes they cite.
const MIN_CHARACTER_MENTION_RATIO = 0.7;
// Share of critical scenes that must be told in their own episode slide.
const MIN_CRITICAL_EPISODE_COVERAGE = 0.9;

/** Normalizes the writer's draft; it is verified before anything is published. */
export function processRecapDraft(
  responseText: string,
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
): RecapStory {
  if (!responseText) {
    throw new Error('OpenAI returned an empty response.');
  }
  return normalizeRecapStory(JSON.parse(responseText), snapshot, eventGraph);
}

/** Applies the claim verification to a draft, then evaluates and renders the story. */
export function finalizeRecapStory(
  draft: RecapStory,
  verificationText: string,
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
  eventQuality = evaluateRecapEventGraph(eventGraph, snapshot),
): {
  story: RecapStory;
  quality: RecapQualityReport;
  slides: GeneratedSlide[];
} {
  if (!verificationText) {
    throw new Error('OpenAI returned an empty story verification.');
  }
  const { story, verification } = applyStoryCorrections(draft, verificationText);
  const quality = evaluateRecapStory(story, snapshot, eventGraph, eventQuality, verification);
  const slides = buildRecapSlides(story, snapshot, eventGraph);
  return { story, quality, slides };
}

export function normalizeRecapStory(
  raw: any,
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
): RecapStory {
  const eventById = new Map(eventGraph.events.map(event => [event.id, event]));
  // The scenes were extracted in the language of the recap.
  const locale = normalizeRecapLocale(eventGraph.locale) ?? DEFAULT_RECAP_LOCALE;
  const seenEpisodeNumbers = new Set<number>();
  const episodes = (Array.isArray(raw?.episodes) ? raw.episodes : [])
    .map((value: any): RecapStoryEpisode | null => {
      const episodeNumber = toPositiveInteger(value?.episodeNumber);
      if (!episodeNumber || seenEpisodeNumbers.has(episodeNumber)) return null;
      seenEpisodeNumbers.add(episodeNumber);
      const moments = (Array.isArray(value?.moments) ? value.moments : [])
        .map((moment: any): RecapStoryMoment => ({
          text: sanitizeText(moment?.text),
          eventIds: uniqueIdentifiers(moment?.eventIds, 6),
        }))
        .filter((moment: RecapStoryMoment) => moment.text)
        .slice(0, MAX_MOMENTS_PER_EPISODE);
      // The chapter card already shows the episode number and title.
      const headline = sanitizeText(value?.headline).replace(/^[ée]pisode\s*\d+\s*[—–:·.-]\s*/i, '');
      if (!headline || !moments.length) return null;
      return {
        episodeNumber,
        headline,
        moments,
        evidenceIds: Array.from(new Set(moments
          .flatMap((moment: RecapStoryMoment) => moment.eventIds)
          .flatMap((id: string) => eventById.get(id)?.evidenceIds || []))),
        changes: normalizeEpisodeChanges(value?.changes),
      };
    })
    .filter((episode: RecapStoryEpisode | null): episode is RecapStoryEpisode => Boolean(episode))
    .sort((first: RecapStoryEpisode, second: RecapStoryEpisode) => first.episodeNumber - second.episodeNumber);

  return {
    locale,
    spoilerScope: 'through-season',
    layout: 'chapters',
    cover: {
      title: sanitizeText(raw?.cover?.title) || snapshot.show.name,
      subtitle: sanitizeText(raw?.cover?.subtitle)
        || (locale === 'en' ? `Season ${snapshot.season.number}` : `Saison ${snapshot.season.number}`),
      logline: sanitizeText(raw?.cover?.logline)
        || (locale === 'en' ? 'The essential moments of this season.' : 'Les moments essentiels de cette saison.'),
    },
    beats: [],
    episodes,
    ending: {
      characters: normalizeStoryChanges(raw?.ending?.characters, MAX_ENDING_CHARACTERS),
      questions: normalizeStoryChanges(raw?.ending?.questions, MAX_ENDING_QUESTIONS),
    },
  };
}

function normalizeStoryChanges(value: unknown, limit: number): RecapStoryChange[] {
  return (Array.isArray(value) ? value : [])
    .map((item: any): RecapStoryChange => ({
      character: sanitizeText(item?.character),
      text: sanitizeText(item?.text),
      eventIds: uniqueIdentifiers(item?.eventIds, 6),
    }))
    .filter(item => item.text)
    .slice(0, limit);
}

// A character who dies in the episode has no other new situation to tell.
function normalizeEpisodeChanges(raw: any): NonNullable<RecapStoryEpisode['changes']> {
  const deaths = normalizeStoryChanges(raw?.deaths, MAX_CHANGE_DEATHS);
  const dead = new Set(deaths.map(death => normalizeCharacterKey(death.character)).filter(Boolean));
  return {
    deaths,
    situations: normalizeStoryChanges(raw?.situations, MAX_CHANGE_SITUATIONS)
      .filter(situation => !dead.has(normalizeCharacterKey(situation.character))),
    questions: normalizeStoryChanges(raw?.questions, MAX_CHANGE_QUESTIONS),
  };
}

export function evaluateRecapStory(
  story: RecapStory,
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
  eventQuality = evaluateRecapEventGraph(eventGraph, snapshot),
  claimVerification: StoryClaimVerification | null = null,
): RecapQualityReport {
  const issues: string[] = [];
  const allEpisodeNumbers = new Set(snapshot.episodes.map((episode) => episode.number));
  const allEvidence = getAllEvidence(snapshot);
  const eventById = new Map(eventGraph.events.map(event => [event.id, event]));
  const episodesWithSources = snapshot.episodes.filter(episode => episode.evidence.length > 0).length;
  const sourceReadiness = evaluateRecapSourceReadiness(snapshot);
  const providerIds = new Set(allEvidence.map(evidence => evidence.providerId));
  // The timeline keeps every event; the story only has to carry the season's turning points.
  const criticalEvents = eventGraph.events.filter(event => event.importance === 'critical');
  const majorEvents = eventGraph.events.filter(event => event.importance !== 'supporting');
  const coverageTargetEvents = criticalEvents.length
    ? criticalEvents
    : majorEvents.length ? majorEvents : eventGraph.events;
  const storyEpisodes = story.episodes || [];
  const moments = storyEpisodes.flatMap(episode => episode.moments.map(moment => ({ episode, moment })));
  const referencedEventIds = new Set(moments.flatMap(({ moment }) => moment.eventIds));
  const endingLines = [...(story.ending?.characters || []), ...(story.ending?.questions || [])];
  // A moment or a bilan line cites scenes of its own episode; the end of the season may cite any scene.
  const citedTexts = [
    ...moments.map(({ episode, moment }) => ({ eventIds: moment.eventIds, episodeNumber: episode.episodeNumber as number | null })),
    ...storyEpisodes.flatMap(episode => listEpisodeChanges(episode).map(change => ({
      eventIds: change.eventIds,
      episodeNumber: episode.episodeNumber as number | null,
    }))),
    ...endingLines.map(line => ({ eventIds: line.eventIds, episodeNumber: null as number | null })),
  ];
  const referenceCount = citedTexts.reduce((count, text) => count + text.eventIds.length, 0);
  const validReferenceCount = citedTexts.reduce((count, text) => count + text.eventIds.filter((id) => {
    const event = eventById.get(id);
    return Boolean(event && (text.episodeNumber === null || event.episodeNumbers.includes(text.episodeNumber)));
  }).length, 0);
  const textsWithEvidence = citedTexts.filter(text => text.eventIds.some(id => eventById.has(id))).length;
  // Every episode of the timeline gets its own chapter.
  const episodesWithScenes = new Set(eventGraph.events.flatMap(event => event.episodeNumbers));
  const recappedEpisodes = new Set(storyEpisodes.map(episode => episode.episodeNumber));
  const episodeRecapCoverage = ratio(
    [...episodesWithScenes].filter(number => recappedEpisodes.has(number)).length,
    episodesWithScenes.size,
  );
  // A turning point must be told in its own chapter.
  const momentEventIdsByEpisode = new Map<number, Set<string>>();
  storyEpisodes.forEach((episode) => {
    const eventIds = momentEventIdsByEpisode.get(episode.episodeNumber) ?? new Set<string>();
    episode.moments.forEach(moment => moment.eventIds.forEach(id => eventIds.add(id)));
    momentEventIdsByEpisode.set(episode.episodeNumber, eventIds);
  });
  const isToldInItsEpisode = (event: RecapEvent) => Boolean(momentEventIdsByEpisode.get(minimumEpisode(event))?.has(event.id));
  const importantEpisodeCoverage = majorEvents.length
    ? ratio(majorEvents.filter(isToldInItsEpisode).length, majorEvents.length)
    : 1;
  const criticalEpisodeCoverage = criticalEvents.length
    ? ratio(criticalEvents.filter(isToldInItsEpisode).length, criticalEvents.length)
    : 1;
  const specificity = measureStorySpecificity(story, eventGraph);
  const endingCharacterCount = story.ending?.characters.length ?? 0;

  const sourceCoverage = ratio(episodesWithSources, snapshot.episodes.length);
  const episodeCoverage = ratio([...recappedEpisodes].filter(number => allEpisodeNumbers.has(number)).length, snapshot.episodes.length);
  const referenceValidity = ratio(validReferenceCount, referenceCount);
  const evidenceCoverage = ratio(textsWithEvidence, citedTexts.length);
  const sourceRichness = sourceReadiness.richness;
  const eventCoverage = ratio(
    coverageTargetEvents.filter(event => referencedEventIds.has(event.id)).length,
    coverageTargetEvents.length,
  );
  const eventReferenceValidity = eventQuality.referenceValidity;
  const eventEvidenceCoverage = eventQuality.evidenceCoverage;
  const causalIntegrity = eventQuality.causalIntegrity;
  const rightsCompliance = snapshot.rights.ready ? 1 : 0;
  const endingScore = Math.min(1, endingCharacterCount / MIN_ENDING_CHARACTERS);

  if (sourceCoverage < 0.5) issues.push('insufficient_source_coverage');
  if (!sourceReadiness.ready) issues.push('thin_source_material');
  if (episodeCoverage < 0.45) issues.push('low_episode_coverage');
  if (referenceValidity < 1) issues.push('invalid_story_references');
  if (evidenceCoverage < 1) issues.push('uncited_story_texts');
  if (eventCoverage < 0.6) issues.push('low_event_coverage');
  if (
    story.cover.title.length > 90
    || story.cover.subtitle.length > 140
    || story.cover.logline.length > 360
    || storyEpisodes.some(episode => (
      episode.headline.length > 90
      || episode.moments.length > MAX_MOMENTS_PER_EPISODE
      || episode.moments.some(moment => moment.text.length > MAX_MOMENT_CHARS)
      || listEpisodeChanges(episode).some(change => change.text.length > MAX_CHANGE_CHARS)
    ))
    || endingLines.some(line => line.text.length > MAX_CHANGE_CHARS)
  ) issues.push('story_copy_too_long');
  if (episodeRecapCoverage < 0.9) issues.push('missing_episode_recaps');
  if (criticalEpisodeCoverage < MIN_CRITICAL_EPISODE_COVERAGE) issues.push('critical_scenes_missing_from_episodes');
  if (endingCharacterCount < MIN_ENDING_CHARACTERS) issues.push('missing_season_ending');
  if (specificity.vaguePhrases.length) issues.push('vague_story_copy');
  if (specificity.characterMentionRatio < MIN_CHARACTER_MENTION_RATIO) issues.push('unspecific_story_copy');
  if (claimVerification?.unresolvedTexts) issues.push('unsupported_story_claims');
  if (!eventQuality.publishable) issues.push(...eventQuality.issues.map(issue => `event_graph:${issue}`));
  if (!snapshot.rights.ready) issues.push('source_rights_not_cleared');

  const score = roundScore(
    sourceCoverage * 0.1
      + sourceRichness * 0.08
      + episodeCoverage * 0.1
      + referenceValidity * 0.15
      + evidenceCoverage * 0.1
      + eventCoverage * 0.07
      + episodeRecapCoverage * 0.05
      + specificity.characterMentionRatio * 0.05
      + eventReferenceValidity * 0.1
      + eventEvidenceCoverage * 0.1
      + causalIntegrity * 0.05
      + rightsCompliance * 0.03
      + endingScore * 0.02,
  );

  return {
    score,
    publishable: issues.length === 0 && score >= 0.68,
    sourceCoverage: roundScore(sourceCoverage),
    episodeCoverage: roundScore(episodeCoverage),
    referenceValidity: roundScore(referenceValidity),
    evidenceCoverage: roundScore(evidenceCoverage),
    sourceRichness: roundScore(sourceRichness),
    sourceDiversity: providerIds.size,
    eventCoverage: roundScore(eventCoverage),
    eventReferenceValidity: roundScore(eventReferenceValidity),
    eventEvidenceCoverage: roundScore(eventEvidenceCoverage),
    causalIntegrity: roundScore(causalIntegrity),
    rightsCompliance,
    episodeRecapCoverage: roundScore(episodeRecapCoverage),
    criticalEpisodeCoverage: roundScore(criticalEpisodeCoverage),
    importantEpisodeCoverage: roundScore(importantEpisodeCoverage),
    characterMentionRatio: specificity.characterMentionRatio,
    vaguePhrases: specificity.vaguePhrases,
    claimVerification,
    issues: Array.from(new Set(issues)),
  };
}
