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

/** "Épisode par épisode": the key scenes of one episode, after the season's turning points. */
export type RecapStoryEpisode = {
  episodeNumber: number;
  headline: string;
  moments: RecapStoryMoment[];
  evidenceIds: string[];
};

export type RecapStory = {
  locale: string;
  spoilerScope: 'through-season';
  cover: RecapStoryCover;
  beats: RecapStoryBeat[];
  // Absent from recaps generated before format version 7.
  episodes?: RecapStoryEpisode[];
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

export type RecapEpisodeSlideContent = Pick<RecapStoryEpisode, 'episodeNumber' | 'headline'> & {
  kind: 'episode';
  moments: string[];
};

export type RecapStorySlideContent = RecapCoverSlideContent | RecapBeatSlideContent | RecapEpisodeSlideContent;
