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

export type RecapStory = {
  locale: string;
  spoilerScope: 'through-season';
  cover: RecapStoryCover;
  beats: RecapStoryBeat[];
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

export type RecapStorySlideContent = RecapCoverSlideContent | RecapBeatSlideContent;
