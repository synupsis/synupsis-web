import {
  MAX_CRITIC_GAPS_PER_EPISODE,
  MIN_DOCUMENTED_EPISODE_CHARS,
  RECAP_EVENT_PROMPT_VERSION,
  RECAP_LOCALE,
} from '~/server/services/recap-generation/config';
import type {
  RecapCriticGap,
  RecapEvent,
  RecapEventGraph,
  RecapEventImportance,
  RecapEventQualityReport,
  RecapEvidence,
  RecapRejectedScene,
  RecapSceneQuote,
  RecapSourceSnapshot,
} from '~/server/services/recap-generation/types';
import {
  clampText,
  getAllEvidence,
  measureEpisodeSourceLength,
  minimumEpisode,
  normalizeCharacterKey,
  ratio,
  roundScore,
  sanitizeIdentifier,
  sanitizeText,
  toPositiveInteger,
  uniqueIdentifiers,
} from '~/server/services/recap-generation/utils';

const MAX_SEASON_EVENTS = 300;
// A quote shorter than this proves nothing about a scene.
const MIN_QUOTE_WORDS = 4;
// Below this share of verified scenes, the extraction is paraphrasing instead of quoting.
const MIN_QUOTE_VERIFICATION_RATIO = 0.75;

export function parseCriticGaps(responseText: string, snapshot: RecapSourceSnapshot): RecapCriticGap[] {
  const raw = JSON.parse(responseText);
  const episodeNumbers = new Set(snapshot.episodes.map(episode => episode.number));
  const countByEpisode = new Map<number, number>();
  return (Array.isArray(raw?.gaps) ? raw.gaps : []).flatMap((value: any) => {
    const episodeNumber = toPositiveInteger(value?.episodeNumber);
    const moment = clampText(sanitizeText(value?.moment), 240);
    if (!episodeNumber || !episodeNumbers.has(episodeNumber) || !moment) return [];
    const count = countByEpisode.get(episodeNumber) ?? 0;
    if (count >= MAX_CRITIC_GAPS_PER_EPISODE) return [];
    countByEpisode.set(episodeNumber, count + 1);
    return [{ episodeNumber, moment }];
  });
}

/**
 * Inserts the recovered scenes that pass quote verification at their place in
 * the episode; suggested moments without a verified scene are kept for review.
 */
export function applyRecoveredScenes(
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
  outputs: Map<number, string | null>,
): RecapEventGraph {
  const gaps = eventGraph.critic?.gaps ?? [];
  const context: SceneVerificationContext = { evidenceById: getEvidenceById(snapshot), rejectedScenes: [], rejectedDetails: [] };
  const recoveredGaps = new Set<RecapCriticGap>();
  const recovered: RecapEvent[] = [];
  let proposedScenes = 0;

  outputs.forEach((text, episodeNumber) => {
    const episodeGaps = gaps.filter(gap => gap.episodeNumber === episodeNumber);
    (parseEpisodeScenes(text) ?? []).forEach((scene: any, index: number) => {
      const gap = episodeGaps[(toPositiveInteger(scene?.gapNumber) ?? 0) - 1];
      if (!gap || recoveredGaps.has(gap)) return;
      proposedScenes += 1;
      const id = `event-e${String(episodeNumber).padStart(2, '0')}-r${String(index + 1).padStart(2, '0')}`;
      const event = normalizeRawScene({ ...scene, episodeNumber, description: scene?.action, sceneIndex: null }, id, context);
      if (!event) return;
      recoveredGaps.add(gap);
      // Placed right after the scene it follows, before renumbering.
      const afterSceneIndex = Number.isInteger(scene?.afterSceneIndex) ? Math.max(0, scene.afterSceneIndex) : Number.MAX_SAFE_INTEGER;
      recovered.push({ ...event, sceneIndex: afterSceneIndex + 0.5 });
    });
  });

  const nextSceneIndexByEpisode = new Map<number, number>();
  const events = [...eventGraph.events, ...recovered]
    .sort((first, second) => minimumEpisode(first) - minimumEpisode(second) || first.sceneIndex - second.sceneIndex)
    .map((event) => {
      const episodeNumber = minimumEpisode(event);
      const sceneIndex = (nextSceneIndexByEpisode.get(episodeNumber) ?? 0) + 1;
      nextSceneIndexByEpisode.set(episodeNumber, sceneIndex);
      return { ...event, sceneIndex };
    });

  return {
    ...eventGraph,
    events: sanitizeCausalLinks(events),
    verification: {
      ...eventGraph.verification,
      proposedScenes: eventGraph.verification.proposedScenes + proposedScenes,
      verifiedScenes: eventGraph.verification.verifiedScenes + recovered.length,
      rejectedScenes: [...eventGraph.verification.rejectedScenes, ...context.rejectedScenes],
      verifiedDetails: events.filter(event => event.detail).length,
      rejectedDetails: [...eventGraph.verification.rejectedDetails, ...context.rejectedDetails],
    },
    critic: {
      status: 'completed',
      gaps,
      recoveredScenes: recovered.length,
      unsupportedGaps: gaps.filter(gap => !recoveredGaps.has(gap)),
    },
  };
}

/**
 * Turns per-episode extraction outputs (null when the episode call failed)
 * into one season graph of verified scenes, ordered by episode then scene.
 */
export function assembleSceneGraph(
  snapshot: RecapSourceSnapshot,
  outputs: Map<number, string | null>,
): RecapEventGraph {
  const failedEpisodes: number[] = [];
  const rawEvents = [...outputs.entries()]
    .sort(([first], [second]) => first - second)
    .flatMap(([episodeNumber, text]) => {
      const scenes = parseEpisodeScenes(text);
      if (!scenes) {
        failedEpisodes.push(episodeNumber);
        return [];
      }
      return scenes.map((scene: any, index: number) => ({
        ...scene,
        id: `event-e${String(episodeNumber).padStart(2, '0')}-s${String(index + 1).padStart(2, '0')}`,
        episodeNumber,
        sceneIndex: index + 1,
        description: scene?.action,
      }));
    });

  const eventGraph = normalizeRecapEventGraph({ events: rawEvents }, snapshot);
  return { ...eventGraph, verification: { ...eventGraph.verification, failedEpisodes } };
}

function parseEpisodeScenes(text: string | null): unknown[] | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.scenes) ? parsed.scenes : null;
  } catch {
    return null;
  }
}

/** Applies the season linking pass: arcs, causal links and character aliases, never new facts. */
export function applySceneLinks(eventGraph: RecapEventGraph, responseText: string): RecapEventGraph {
  const raw = JSON.parse(responseText);
  const canonicalNames = new Map<string, string>();
  const characterAliases: Array<{ name: string; aliases: string[] }> = [];
  (Array.isArray(raw?.characters) ? raw.characters : []).forEach((character: any) => {
    const name = clampText(sanitizeText(character?.name), 80);
    if (!name) return;
    const aliases = uniqueTextValues(character?.aliases, 8, 80).filter(alias => alias !== name);
    characterAliases.push({ name, aliases });
    [name, ...aliases].forEach((alias) => {
      const key = normalizeCharacterKey(alias);
      if (key) canonicalNames.set(key, name);
    });
  });
  const linksById = new Map<string, any>(
    (Array.isArray(raw?.scenes) ? raw.scenes : []).map((scene: any) => [sanitizeIdentifier(scene?.id), scene]),
  );

  const events = eventGraph.events.map((event) => {
    const links = linksById.get(event.id);
    return {
      ...event,
      characters: uniqueTextValues(
        event.characters.map(name => canonicalNames.get(normalizeCharacterKey(name)) ?? name),
        12,
        80,
      ),
      arc: clampText(sanitizeText(links?.arc), 100) || event.arc,
      causedByEventIds: uniqueIdentifiers(links?.causedByEventIds, 12),
      consequenceEventIds: uniqueIdentifiers(links?.consequenceEventIds, 12),
    };
  });

  return { ...eventGraph, events: sanitizeCausalLinks(events), linking: 'linked', characterAliases };
}

type SceneVerificationContext = {
  evidenceById: Map<string, RecapEvidence>;
  rejectedScenes: RecapRejectedScene[];
  rejectedDetails: RecapRejectedScene[];
};

// Turns a raw scene into a verified event; sceneIndex is 0 when the raw scene has none.
function normalizeRawScene(value: any, id: string, context: SceneVerificationContext): RecapEvent | null {
  // Events are scenes of a single episode, so the season timeline can
  // reveal each one as soon as its episode has been watched.
  const episodeNumber = toPositiveInteger(value?.episodeNumber);
  const importance: RecapEventImportance = ['supporting', 'major', 'critical'].includes(value?.importance)
    ? value.importance
    : 'supporting';
  const title = clampText(sanitizeText(value?.title), 96);
  const description = clampText(sanitizeText(value?.description ?? value?.action), 700);
  if (!episodeNumber || !title || !description) {
    context.rejectedScenes.push({ episodeNumber: episodeNumber ?? 0, title: title || '—', reason: 'invalid_scene' });
    return null;
  }

  // A scene must quote its own episode's source verbatim: this is the
  // server-side guard against invented scenes.
  const sourceQuote = verifySceneQuote(value?.sourceQuote ?? value?.quote, episodeNumber, context.evidenceById);
  if ('reason' in sourceQuote) {
    context.rejectedScenes.push({ episodeNumber, title, reason: sourceQuote.reason });
    return null;
  }
  // The highlight detail is the most specific claim of a scene: it needs
  // its own verbatim quote, otherwise it is removed and the scene kept.
  const proposedDetail = toNullableText(value?.detail, 300);
  const detailCheck = proposedDetail
    ? verifySceneQuote(value?.detailQuote, episodeNumber, context.evidenceById)
    : null;
  const detailQuote = detailCheck && !('reason' in detailCheck) ? detailCheck : null;
  if (detailCheck && 'reason' in detailCheck) {
    context.rejectedDetails.push({ episodeNumber, title, reason: detailCheck.reason });
  }

  const event: RecapEvent = {
    id,
    title,
    description,
    episodeNumbers: [episodeNumber],
    sceneIndex: toPositiveInteger(value?.sceneIndex) ?? 0,
    location: toNullableText(value?.location, 120),
    detail: detailQuote ? proposedDetail : null,
    detailQuote,
    sourceQuote,
    characters: uniqueTextValues(value?.characters, 12, 80),
    arc: clampText(sanitizeText(value?.arc), 100),
    importance,
    evidenceIds: uniqueIdentifiers([
      sourceQuote.evidenceId,
      detailQuote?.evidenceId,
      ...(Array.isArray(value?.evidenceIds) ? value.evidenceIds : []),
    ], 16),
    causedByEventIds: uniqueIdentifiers(value?.causedByEventIds, 12),
    consequenceEventIds: uniqueIdentifiers(value?.consequenceEventIds, 12),
    contradictionEvidenceIds: uniqueIdentifiers(value?.contradictionEvidenceIds, 8),
    confidence: 0,
  };
  return { ...event, confidence: calculateEventConfidence(event, context.evidenceById) };
}

export function normalizeRecapEventGraph(raw: any, snapshot: RecapSourceSnapshot): RecapEventGraph {
  const context: SceneVerificationContext = {
    evidenceById: getEvidenceById(snapshot),
    rejectedScenes: [],
    rejectedDetails: [],
  };
  const { rejectedScenes, rejectedDetails } = context;
  const seenIds = new Set<string>();
  const lastSceneIndexByEpisode = new Map<number, number>();
  const rawEvents = Array.isArray(raw?.events) ? raw.events : [];
  const events = rawEvents
    .map((value: any, index: number): RecapEvent | null => {
      const requestedId = sanitizeIdentifier(value?.id);
      const id = requestedId || `event-${String(index + 1).padStart(3, '0')}`;
      if (seenIds.has(id)) return null;
      seenIds.add(id);
      const event = normalizeRawScene(value, id, context);
      if (!event) return null;
      const episodeNumber = event.episodeNumbers[0] as number;
      const sceneIndex = event.sceneIndex || (lastSceneIndexByEpisode.get(episodeNumber) ?? 0) + 1;
      lastSceneIndexByEpisode.set(episodeNumber, Math.max(sceneIndex, lastSceneIndexByEpisode.get(episodeNumber) ?? 0));
      return { ...event, sceneIndex };
    })
    .filter((event: RecapEvent | null): event is RecapEvent => Boolean(event))
    .slice(0, MAX_SEASON_EVENTS);

  if (events.length < 3) {
    throw new Error('The extracted event graph does not contain enough valid events.');
  }

  return {
    locale: RECAP_LOCALE,
    version: RECAP_EVENT_PROMPT_VERSION,
    events: sanitizeCausalLinks(events),
    verification: {
      proposedScenes: rawEvents.length,
      verifiedScenes: events.length,
      rejectedScenes,
      verifiedDetails: events.filter((event: RecapEvent) => event.detail).length,
      rejectedDetails,
      failedEpisodes: [],
    },
    linking: 'pending',
  };
}

// Causal links are interpretive hints. The timeline reveals events episode by
// episode, so a cause only shown in a later episode (time travel, flashbacks)
// would spoil it: such links are dropped instead of blocking.
function sanitizeCausalLinks(events: RecapEvent[]): RecapEvent[] {
  const episodeById = new Map<string, number>(events.map(event => [event.id, minimumEpisode(event)]));
  return events.map((event) => {
    const episode = minimumEpisode(event);
    return {
      ...event,
      causedByEventIds: event.causedByEventIds.filter(id => (
        id !== event.id && (episodeById.get(id) ?? Number.POSITIVE_INFINITY) <= episode
      )),
      consequenceEventIds: event.consequenceEventIds.filter(id => (
        id !== event.id && (episodeById.get(id) ?? Number.NEGATIVE_INFINITY) >= episode
      )),
    };
  });
}

function verifySceneQuote(
  value: any,
  episodeNumber: number,
  evidenceById: Map<string, RecapEvidence>,
): RecapSceneQuote | { reason: RecapRejectedScene['reason'] } {
  const text = sanitizeText(value?.text);
  const evidenceId = sanitizeIdentifier(value?.evidenceId);
  if (!text || !evidenceId) return { reason: 'missing_quote' };
  const normalizedQuote = normalizeQuoteText(text);
  if (normalizedQuote.split(' ').length < MIN_QUOTE_WORDS) return { reason: 'quote_too_short' };
  const evidence = evidenceById.get(evidenceId);
  if (!evidence) return { reason: 'unknown_evidence' };
  if (evidence.episodeNumber !== episodeNumber) return { reason: 'foreign_evidence' };
  if (!` ${normalizeQuoteText(evidence.text)} `.includes(` ${normalizedQuote} `)) return { reason: 'quote_not_found' };
  return { evidenceId, text };
}

// Case, punctuation and typographic quotes vary between a source and its
// copy; the words and their order must not.
function normalizeQuoteText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function evaluateRecapEventGraph(
  eventGraph: RecapEventGraph,
  snapshot: RecapSourceSnapshot,
): RecapEventQualityReport {
  const issues: string[] = [];
  const episodeNumbers = new Set(snapshot.episodes.map(episode => episode.number));
  const evidenceById = getEvidenceById(snapshot);
  const eventById = new Map(eventGraph.events.map(event => [event.id, event]));
  let referenceCount = 0;
  let validReferenceCount = 0;
  let linkCount = 0;
  let validLinkCount = 0;
  let eventsWithEvidence = 0;
  const coveredEpisodes = new Set<number>();

  eventGraph.events.forEach((event) => {
    const validEpisodes = event.episodeNumbers.filter(number => episodeNumbers.has(number));
    const validEvidence = event.evidenceIds.filter((id) => {
      const evidence = evidenceById.get(id);
      return evidence && (evidence.episodeNumber == null || event.episodeNumbers.includes(evidence.episodeNumber));
    });
    const contradictionEvidence = event.contradictionEvidenceIds.filter((id) => {
      const evidence = evidenceById.get(id);
      return evidence && (evidence.episodeNumber == null || event.episodeNumbers.includes(evidence.episodeNumber));
    });
    const validCauses = event.causedByEventIds.filter((id) => {
      const cause = eventById.get(id);
      return cause && id !== event.id && minimumEpisode(cause) <= minimumEpisode(event);
    });
    const validConsequences = event.consequenceEventIds.filter((id) => {
      const consequence = eventById.get(id);
      return consequence && id !== event.id && minimumEpisode(consequence) >= minimumEpisode(event);
    });
    const links = [...event.causedByEventIds, ...event.consequenceEventIds];
    referenceCount += event.episodeNumbers.length + event.evidenceIds.length + event.contradictionEvidenceIds.length;
    validReferenceCount += validEpisodes.length + validEvidence.length + contradictionEvidence.length;
    linkCount += links.length;
    validLinkCount += validCauses.length + validConsequences.length;
    if (validEvidence.length) eventsWithEvidence += 1;
    validEpisodes.forEach(number => coveredEpisodes.add(number));
  });

  const referenceValidity = ratio(validReferenceCount, referenceCount);
  const evidenceCoverage = ratio(eventsWithEvidence, eventGraph.events.length);
  const episodeCoverage = ratio(coveredEpisodes.size, episodeNumbers.size);
  // Every episode with a real plot summary must appear in the timeline.
  const documentedEpisodeNumbers = snapshot.episodes
    .filter(episode => measureEpisodeSourceLength(episode) >= MIN_DOCUMENTED_EPISODE_CHARS)
    .map(episode => episode.number);
  const documentedEpisodeCoverage = documentedEpisodeNumbers.length
    ? ratio(documentedEpisodeNumbers.filter(number => coveredEpisodes.has(number)).length, documentedEpisodeNumbers.length)
    : episodeCoverage;
  const causalIntegrity = linkCount ? ratio(validLinkCount, linkCount) : 1;
  const { proposedScenes, verifiedScenes } = eventGraph.verification;
  const quoteVerification = proposedScenes ? ratio(verifiedScenes, proposedScenes) : 1;
  const eventCountScore = Math.min(1, eventGraph.events.length / Math.max(5, snapshot.episodes.length));

  if (referenceValidity < 1) issues.push('invalid_event_references');
  if (evidenceCoverage < 1) issues.push('uncited_events');
  if (documentedEpisodeCoverage < 0.8) issues.push('low_event_episode_coverage');
  if (quoteVerification < MIN_QUOTE_VERIFICATION_RATIO) issues.push('unverified_scene_quotes');
  if (causalIntegrity < 1) issues.push('invalid_causal_links');
  if (eventGraph.events.length < Math.min(5, snapshot.episodes.length)) issues.push('too_few_events');

  const score = roundScore(
    referenceValidity * 0.25
      + evidenceCoverage * 0.25
      + episodeCoverage * 0.2
      + quoteVerification * 0.1
      + causalIntegrity * 0.1
      + eventCountScore * 0.1,
  );
  return {
    score,
    publishable: issues.length === 0 && score >= 0.7,
    referenceValidity: roundScore(referenceValidity),
    evidenceCoverage: roundScore(evidenceCoverage),
    episodeCoverage: roundScore(episodeCoverage),
    documentedEpisodeCoverage: roundScore(documentedEpisodeCoverage),
    quoteVerification: roundScore(quoteVerification),
    causalIntegrity: roundScore(causalIntegrity),
    issues,
  };
}

function getEvidenceById(snapshot: RecapSourceSnapshot): Map<string, RecapEvidence> {
  return new Map(getAllEvidence(snapshot).map(evidence => [evidence.id, evidence]));
}

function calculateEventConfidence(
  event: RecapEvent,
  evidenceById: Map<string, RecapEvidence>,
): number {
  const validEvidence = event.evidenceIds
    .map(id => evidenceById.get(id))
    .filter((evidence): evidence is RecapEvidence => Boolean(
      evidence && (evidence.episodeNumber == null || event.episodeNumbers.includes(evidence.episodeNumber)),
    ));
  const providerCount = new Set(validEvidence.map(evidence => evidence.providerId)).size;
  const bestTrust = validEvidence.reduce((score, evidence) => Math.max(score, {
    reference: 0.08,
    editorial: 0.14,
    official: 0.2,
    'licensed-transcript': 0.18,
  }[evidence.trustTier]), 0);
  const contradictionPenalty = event.contradictionEvidenceIds.length ? 0.15 : 0;
  return roundScore(Math.min(1,
    (validEvidence.length ? 0.45 : 0)
      + Math.min(0.2, Math.max(0, validEvidence.length - 1) * 0.1)
      + Math.min(0.12, Math.max(0, providerCount - 1) * 0.06)
      + bestTrust
      - contradictionPenalty,
  ));
}

function uniqueTextValues(value: unknown, limit: number, maxLength: number): string[] {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map(item => clampText(sanitizeText(item), maxLength))
    .filter(Boolean)))
    .slice(0, limit) as string[];
}

function toNullableText(value: unknown, maxLength: number): string | null {
  return clampText(sanitizeText(value), maxLength) || null;
}
