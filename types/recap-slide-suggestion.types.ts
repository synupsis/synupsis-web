export type RecapSlideSuggestionKind = 'text' | 'change' | 'add';
export type RecapSlideSuggestionStatus = 'pending' | 'accepted' | 'rejected';

/** The slide as the viewer saw it when suggesting. */
export type RecapSlideContext = {
  kind: string | null;
  episodeNumber: number | null;
  summary: string;
};

export type RecapSlideSuggestion = {
  id: string;
  kind: RecapSlideSuggestionKind;
  slideOrder: number;
  slideContext: RecapSlideContext;
  // A text correction: where the text sits in the slide, as it was, and as proposed.
  fieldPath: string | null;
  currentValue: string | null;
  proposedValue: string | null;
  message: string | null;
  status: RecapSlideSuggestionStatus;
  createdAt: string;
  authorName: string | null;
  likeCount: number;
  liked: boolean;
  isMine: boolean;
};

export type RecapSlideSuggestionInput = {
  kind: RecapSlideSuggestionKind;
  slideOrder: number;
  fieldPath?: string;
  currentValue?: string;
  proposedValue?: string;
  message?: string;
};

export type AdminRecapSlideSuggestion = RecapSlideSuggestion & {
  recap: { id: string; locale: string | null; showName: string; seasonNumber: number | null };
};
