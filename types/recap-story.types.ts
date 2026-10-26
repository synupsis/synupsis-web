export type RecapStoryCover = {
  title: string;
  subtitle: string;
  logline: string;
};

export type RecapStoryBeat = {
  headline: string;
  narration: string;
  tag: string;
  episodeNumbers: number[];
  imageEpisodeNumber: number;
  eventIds: string[];
  evidenceIds: string[];
};

export type RecapStoryMoment = {
  text: string;
  eventIds: string[];
};

/**
 * One fact of a bilan: a full sentence that names its character, so the claim
 * verification reads it whole; character only labels the avatar.
 */
export type RecapStoryChange = {
  character: string;
  text: string;
  eventIds: string[];
};

/** "Ce qui a changé": what an episode leaves behind, told after its moments. */
export type RecapEpisodeChanges = {
  deaths: RecapStoryChange[];
  situations: RecapStoryChange[];
  questions: RecapStoryChange[];
};

/** The key scenes of one episode. */
export type RecapStoryEpisode = {
  episodeNumber: number;
  headline: string;
  moments: RecapStoryMoment[];
  evidenceIds: string[];
  // Format version 10 and later.
  changes?: RecapEpisodeChanges;
  // Format versions 8 and 9: a dense episode is told over two consecutive entries, one slide each.
  part?: number;
  partCount?: number;
};

/** "Où en est-on" and the open questions, at the end of the season. */
export type RecapStoryEnding = {
  characters: RecapStoryChange[];
  questions: RecapStoryChange[];
};

export type RecapStory = {
  locale: string;
  spoilerScope: 'through-season';
  // "chapters" (format version 10): one chapter per episode, then the end of
  // the season, and no season turning points (beats stays empty).
  layout?: 'chapters';
  cover: RecapStoryCover;
  beats: RecapStoryBeat[];
  // Absent from recaps generated before format version 7.
  episodes?: RecapStoryEpisode[];
  ending?: RecapStoryEnding;
};

export type RecapCoverSlideContent = RecapStoryCover & {
  kind: 'cover';
  episodeCount: number;
};

export type RecapBeatSlideContent = Pick<
  RecapStoryBeat,
  'headline' | 'narration' | 'tag' | 'episodeNumbers'
> & {
  kind: 'beat';
};

export type RecapEpisodeSlideContent = Pick<RecapStoryEpisode, 'episodeNumber' | 'headline' | 'part' | 'partCount'> & {
  kind: 'episode';
  moments: string[];
};

export type RecapSlideCharacter = {
  name: string;
  initials: string;
  // TVmaze portrait of the character (or of its actor); the initials stand in without one.
  imageUrl: string | null;
};

/** Opens the chapter of one episode. */
export type RecapChapterSlideContent = {
  kind: 'chapter';
  episodeNumber: number;
  episodeTitle: string;
  headline: string;
  locations: string[];
  decisiveCount: number;
  otherCount: number;
};

/** A decisive moment, told alone. */
export type RecapMomentSlideContent = {
  kind: 'moment';
  episodeNumber: number;
  text: string;
  location: string | null;
  detail: string | null;
  characters: RecapSlideCharacter[];
};

/** Up to three other moments of the episode, in their order. */
export type RecapMomentGroupSlideContent = {
  kind: 'moment-group';
  episodeNumber: number;
  heading: string;
  items: Array<{ text: string; location: string | null; characters: RecapSlideCharacter[] }>;
};

export type RecapChangeItem = {
  character: RecapSlideCharacter | null;
  text: string;
};

/** "Ce qui a changé", at the end of each chapter. */
export type RecapChangesSlideContent = {
  kind: 'changes';
  episodeNumber: number;
  deaths: RecapChangeItem[];
  situations: RecapChangeItem[];
  questions: string[];
  nextEpisode: { number: number; title: string } | null;
};

/** "Où en est-on": where the main characters stand. */
export type RecapEndingStatusSlideContent = {
  kind: 'ending-status';
  characters: RecapChangeItem[];
};

/** Everyone who died during the season, from the episode bilans. */
export type RecapEndingDeathsSlideContent = {
  kind: 'ending-deaths';
  deaths: Array<{ character: RecapSlideCharacter; episodeNumber: number }>;
};

export type RecapEndingQuestionsSlideContent = {
  kind: 'ending-questions';
  questions: Array<{ text: string; episodeNumbers: number[] }>;
};

export type RecapStorySlideContent =
  | RecapCoverSlideContent
  | RecapBeatSlideContent
  | RecapEpisodeSlideContent
  | RecapChapterSlideContent
  | RecapMomentSlideContent
  | RecapMomentGroupSlideContent
  | RecapChangesSlideContent
  | RecapEndingStatusSlideContent
  | RecapEndingDeathsSlideContent
  | RecapEndingQuestionsSlideContent;

/** One slide of a chapters story, with the scenes it tells (for the sources panel). */
export type RecapPlannedSlide = {
  content: RecapStorySlideContent;
  eventIds: string[];
  // Source URL of the slide's background image; null uses the season cover.
  imageUrl: string | null;
};
