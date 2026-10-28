import { proxiedImageUrl } from '~/lib/image-url';
import { RECAP_FORMAT_VERSION } from '~/server/services/recap-generation/config';
import type { GeneratedSlide, RecapEvent, RecapEventGraph, RecapSourceSnapshot } from '~/server/services/recap-generation/types';
import { listEpisodeChanges, normalizeCharacterKey } from '~/server/services/recap-generation/utils';
import type { RecapPlannedSlide, RecapSlideCharacter, RecapStory, RecapStoryChange } from '~/types/recap-story.types';

// A chapter tells its decisive moments one per slide and groups the others by two,
// so their text stays large; a bilan and the season end are split the same way.
const MAX_MOMENTS_PER_GROUP = 2;
const MAX_LINES_PER_CHANGES_SLIDE = 5;
const MAX_CHARACTERS_PER_ENDING_SLIDE = 4;
const STAGE_WIDTH = 390;
const STAGE_HEIGHT = 844;
const TITLE_FONT_FAMILY = 'Fredoka, Inter, sans-serif';
const BODY_FONT_FAMILY = 'Inter, sans-serif';

type Palette = {
  gradient: [string, string];
  overlay: string;
  titleBackground: string;
  bodyBackground: string;
  titleText: string;
  bodyText: string;
  badgeBackground: string;
  badgeText: string;
  tagBackground: string;
  tagText: string;
};

type TextGroupOptions = {
  id: string;
  text: string;
  x?: number;
  y: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  textColor: string;
  backgroundFill: string;
  paddingX?: number;
  paddingY?: number;
  maxWidth: number;
  align?: 'left' | 'center' | 'right';
  centerHorizontally?: boolean;
  cornerRadius?: number;
  draggable?: boolean;
};

type TextGroupResult = {
  node: Record<string, unknown>;
  totalHeight: number;
  width: number;
};

/**
 * The slides of a chapters story, in reading order: the cover, then for each
 * episode its card, its decisive moments one per slide, its other moments in
 * groups of three and its bilan, then the end of the season. Generation and
 * the player both read this plan, so they always agree.
 */
export function planStorySlides(
  story: RecapStory,
  eventGraph: RecapEventGraph,
  snapshot: RecapSourceSnapshot,
): RecapPlannedSlide[] {
  const eventById = new Map(eventGraph.events.map(event => [event.id, event]));
  const eventsOf = (eventIds: string[]) => eventIds.flatMap(id => eventById.get(id) ?? []);
  const episodes = story.episodes || [];
  const portraitOf = createPortraitResolver(snapshot, eventGraph);
  const character = (name: string): RecapSlideCharacter => ({ ...toSlideCharacter(name), imageUrl: portraitOf(name) });
  const characters = (events: RecapEvent[], limit: number) => [...new Set(events.flatMap(event => event.characters))]
    .slice(0, limit)
    .map(character);
  const changeItem = (change: RecapStoryChange) => ({ character: change.character ? character(change.character) : null, text: change.text });
  // Backdrops take over once an episode has shown all its stills, and dress the end of the season.
  const backdrops = snapshot.show.backdrops ?? [];
  let backdropCursor = 0;
  const nextBackdrop = () => (backdrops.length ? backdrops[backdropCursor++ % backdrops.length]! : null);

  const slides: Array<Omit<RecapPlannedSlide, 'imageFocus'>> = [{
    content: { kind: 'cover', ...story.cover, episodeCount: snapshot.episodes.length },
    eventIds: [],
    imageUrl: null,
  }];

  episodes.forEach((episode, index) => {
    const { episodeNumber } = episode;
    const sourceEpisode = snapshot.episodes.find(item => item.number === episodeNumber);
    // Each slide of the chapter gets its own still; Trakt's episode image is usually one of them.
    const stills = sourceEpisode?.stills?.length
      ? sourceEpisode.stills
      : [sourceEpisode?.image].filter((url): url is string => Boolean(url));
    let stillCursor = 0;
    const nextImage = () => (stillCursor < stills.length
      ? stills[stillCursor++]!
      : nextBackdrop() ?? sourceEpisode?.image ?? null);
    const momentEvents = episode.moments.map(moment => eventsOf(moment.eventIds));
    const isDecisive = momentEvents.map(events => events.some(event => event.importance === 'critical'));
    const locations = [...new Set(momentEvents.flat().flatMap(event => event.location ?? []))].slice(0, 4);
    const chapterStart = slides.length;
    slides.push({
      content: {
        kind: 'chapter',
        episodeNumber,
        episodeTitle: sourceEpisode?.title ?? '',
        headline: episode.headline,
        locations,
        decisiveCount: isDecisive.filter(Boolean).length,
        otherCount: isDecisive.filter(decisive => !decisive).length,
      },
      eventIds: [],
      imageUrl: nextImage(),
    });

    let group: number[] = [];
    const flushGroup = () => {
      if (!group.length) return;
      const items = group.map(momentIndex => ({
        text: episode.moments[momentIndex]!.text,
        location: momentEvents[momentIndex]![0]?.location ?? null,
        characters: characters(momentEvents[momentIndex]!, 3),
      }));
      const places = new Set(items.map(item => item.location).filter(Boolean));
      slides.push({
        content: {
          kind: 'moment-group',
          episodeNumber,
          heading: slides.length === chapterStart + 1
            ? 'Au début de l’épisode'
            : places.size > 1 ? 'Pendant ce temps' : 'Ensuite',
          items,
        },
        eventIds: [...new Set(group.flatMap(momentIndex => episode.moments[momentIndex]!.eventIds))],
        imageUrl: nextImage(),
      });
      group = [];
    };
    episode.moments.forEach((moment, momentIndex) => {
      if (!isDecisive[momentIndex]) {
        group.push(momentIndex);
        if (group.length === MAX_MOMENTS_PER_GROUP) flushGroup();
        return;
      }
      flushGroup();
      const events = momentEvents[momentIndex]!;
      slides.push({
        content: {
          kind: 'moment',
          episodeNumber,
          text: moment.text,
          location: events[0]?.location ?? null,
          detail: events.find(event => event.detail)?.detail ?? null,
          characters: characters(events, 4),
        },
        eventIds: moment.eventIds,
        imageUrl: nextImage(),
      });
    });
    flushGroup();

    const changes = episode.changes;
    if (changes && listEpisodeChanges(episode).length) {
      const nextEpisode = episodes[index + 1];
      // Deaths first, then situations, five lines a slide; the questions close the last slide
      // (a question takes about a line and a half), or get their own when it is full.
      const lines = [
        ...changes.deaths.map(change => ({ change, death: true })),
        ...changes.situations.map(change => ({ change, death: false })),
      ];
      const pages: Array<typeof lines> = [];
      for (let start = 0; start < lines.length; start += MAX_LINES_PER_CHANGES_SLIDE) {
        pages.push(lines.slice(start, start + MAX_LINES_PER_CHANGES_SLIDE));
      }
      const lastPage = pages[pages.length - 1];
      if (!lastPage || (changes.questions.length && lastPage.length + changes.questions.length * 1.5 > MAX_LINES_PER_CHANGES_SLIDE + 1)) {
        pages.push([]);
      }
      pages.forEach((page, pageIndex) => {
        const isLast = pageIndex === pages.length - 1;
        const questions = isLast ? changes.questions : [];
        slides.push({
          content: {
            kind: 'changes',
            episodeNumber,
            deaths: page.filter(line => line.death).map(line => changeItem(line.change)),
            situations: page.filter(line => !line.death).map(line => changeItem(line.change)),
            questions: questions.map(question => question.text),
            nextEpisode: isLast && nextEpisode
              ? {
                  number: nextEpisode.episodeNumber,
                  title: snapshot.episodes.find(item => item.number === nextEpisode.episodeNumber)?.title ?? '',
                }
              : null,
          },
          eventIds: [...page.map(line => line.change), ...questions].flatMap(change => change.eventIds),
          imageUrl: nextImage(),
        });
      });
    }
  });

  const ending = story.ending;
  for (let start = 0; start < (ending?.characters.length ?? 0); start += MAX_CHARACTERS_PER_ENDING_SLIDE) {
    const lines = ending!.characters.slice(start, start + MAX_CHARACTERS_PER_ENDING_SLIDE);
    slides.push({
      content: { kind: 'ending-status', characters: lines.map(changeItem) },
      eventIds: lines.flatMap(line => line.eventIds),
      imageUrl: nextBackdrop(),
    });
  }
  // A season can lose a dozen characters: they get their own slide.
  const seenDeaths = new Set<string>();
  const deaths = episodes.flatMap(episode => (episode.changes?.deaths ?? []).flatMap((death) => {
    const name = death.character || '';
    if (!name || seenDeaths.has(name)) return [];
    seenDeaths.add(name);
    return [{ name, episodeNumber: episode.episodeNumber, eventIds: death.eventIds }];
  }));
  if (ending && deaths.length) {
    slides.push({
      content: {
        kind: 'ending-deaths',
        deaths: deaths.map(death => ({ character: character(death.name), episodeNumber: death.episodeNumber })),
      },
      eventIds: deaths.flatMap(death => death.eventIds),
      imageUrl: nextBackdrop(),
    });
  }
  if (ending?.questions.length) {
    slides.push({
      content: {
        kind: 'ending-questions',
        questions: ending.questions.map(question => ({
          text: question.text,
          episodeNumbers: [...new Set(eventsOf(question.eventIds).flatMap(event => event.episodeNumbers))].sort((a, b) => a - b),
        })),
      },
      eventIds: ending.questions.flatMap(question => question.eventIds),
      imageUrl: nextBackdrop(),
    });
  }
  return slides.map(slide => ({ ...slide, imageFocus: slide.imageUrl ? snapshot.imageFocus?.[slide.imageUrl] ?? null : null }));
}

const PORTRAIT_NAME_PARTICLES = new Set(['les', 'des', 'del', 'van', 'von', 'der', 'den', 'ser', 'lord', 'lady', 'the']);

/**
 * Finds a character's TVmaze portrait under any of its names (Ned = Eddard
 * Stark): every significant word of one of its names must appear in exactly
 * one portrait's name.
 */
function createPortraitResolver(snapshot: RecapSourceSnapshot, eventGraph: RecapEventGraph) {
  const words = (name: string) => normalizeCharacterKey(name)
    .split(' ')
    .filter(word => word.length >= 3 && !PORTRAIT_NAME_PARTICLES.has(word));
  const portraits = (snapshot.characterPortraits ?? []).map(portrait => ({ ...portrait, words: new Set(words(portrait.name)) }));
  const namesByKey = new Map<string, string[]>();
  (eventGraph.characterAliases ?? []).forEach((group) => {
    const names = [group.name, ...group.aliases];
    names.forEach(name => namesByKey.set(normalizeCharacterKey(name), names));
  });
  return (name: string): string | null => {
    for (const candidate of namesByKey.get(normalizeCharacterKey(name)) ?? [name]) {
      const candidateWords = words(candidate);
      if (!candidateWords.length) continue;
      const matches = portraits.filter(portrait => candidateWords.every(word => portrait.words.has(word)));
      if (matches.length === 1) return matches[0]!.imageUrl;
    }
    return null;
  };
}

/** Initials of the first and last capitalized words: "Eddard Stark" → "ES". */
function toSlideCharacter(name: string): RecapSlideCharacter {
  const words = name.replace(/[«»"“”()]/g, ' ').split(/\s+/).filter(word => /^\p{Lu}/u.test(word));
  const initials = words.length > 1
    ? `${words[0]![0]}${words[words.length - 1]![0]}`
    : (words[0] ?? name).slice(0, 2);
  return { name, initials: initials.toLocaleUpperCase(), imageUrl: null };
}

export function buildRecapSlides(
  story: RecapStory,
  snapshot: RecapSourceSnapshot,
  eventGraph: RecapEventGraph,
): GeneratedSlide[] {
  const palette = determinePalette(snapshot.show.genres);
  const coverImage = snapshot.season.image
    || snapshot.show.image
    || snapshot.episodes.find((episode) => episode.image)?.image
    || null;

  return planStorySlides(story, eventGraph, snapshot).map((slide, index) => {
    const order = index + 1;
    if (slide.content.kind === 'cover') {
      return { order, canvas: createCoverCanvas(story, palette, coverImage, snapshot) };
    }
    return {
      order,
      canvas: createPlannedSlideCanvas({ order, slide, palette, backgroundImage: slide.imageUrl || coverImage }),
    };
  });
}

function createCoverCanvas(
  story: RecapStory,
  palette: Palette,
  coverImage: string | null,
  snapshot: RecapSourceSnapshot,
) {
  const children: Record<string, unknown>[] = createBackgroundNodes(coverImage, palette, 1);
  let currentY = 112;
  const titleFontSize = story.cover.title.length > 45 ? 36 : story.cover.title.length > 30 ? 40 : 44;
  const subtitleFontSize = story.cover.subtitle.length > 70 ? 23 : story.cover.subtitle.length > 45 ? 25 : 27;
  const loglineFontSize = story.cover.logline.length > 150 ? 18 : story.cover.logline.length > 100 ? 19 : 21;

  const title = createTextGroup({
    id: 'group-slide-1-title',
    text: story.cover.title || snapshot.show.name,
    y: currentY,
    fontSize: titleFontSize,
    lineHeight: 1.05,
    fontFamily: TITLE_FONT_FAMILY,
    textColor: palette.titleText,
    backgroundFill: palette.titleBackground,
    paddingX: 26,
    paddingY: 22,
    maxWidth: 320,
    align: 'center',
    centerHorizontally: true,
    cornerRadius: 24,
  });
  children.push(title.node);
  currentY += title.totalHeight + 28;

  const subtitle = createTextGroup({
    id: 'group-slide-1-subtitle',
    text: story.cover.subtitle,
    y: currentY,
    fontSize: subtitleFontSize,
    lineHeight: 1.18,
    fontFamily: BODY_FONT_FAMILY,
    textColor: palette.bodyText,
    backgroundFill: palette.bodyBackground,
    paddingX: 24,
    paddingY: 18,
    maxWidth: 320,
    align: 'center',
    centerHorizontally: true,
    cornerRadius: 22,
  });
  children.push(subtitle.node);
  currentY += subtitle.totalHeight + 24;

  const logline = createTextGroup({
    id: 'group-slide-1-logline',
    text: story.cover.logline,
    y: currentY,
    fontSize: loglineFontSize,
    lineHeight: 1.3,
    fontFamily: BODY_FONT_FAMILY,
    textColor: palette.bodyText,
    backgroundFill: palette.bodyBackground,
    paddingX: 24,
    paddingY: 20,
    maxWidth: 320,
    align: 'center',
    centerHorizontally: true,
    cornerRadius: 20,
  });
  children.push(logline.node);

  return createStage(children, 8_000);
}

/**
 * The editable canvas of a planned slide: a badge, a title and the slide's
 * text. The player renders the slide's semantic content instead.
 */
function createPlannedSlideCanvas(input: {
  order: number;
  slide: RecapPlannedSlide;
  palette: Palette;
  backgroundImage: string | null;
}) {
  const { label, title, body } = describePlannedSlide(input.slide.content);
  const children: Record<string, unknown>[] = createBackgroundNodes(input.backgroundImage, input.palette, input.order);
  let currentY = 112;

  const badge = createPillGroup({
    id: `group-slide-${input.order}-badge`,
    text: label,
    y: currentY,
    palette: input.palette,
    alignRight: false,
  });
  children.push(badge.node);
  currentY += badge.totalHeight + 22;

  const headline = createTextGroup({
    id: `group-slide-${input.order}-headline`,
    text: title,
    y: currentY,
    fontSize: title.length > 120 ? 24 : 28,
    lineHeight: 1.14,
    fontFamily: TITLE_FONT_FAMILY,
    textColor: input.palette.titleText,
    backgroundFill: input.palette.titleBackground,
    paddingX: 24,
    paddingY: 18,
    maxWidth: 306,
    cornerRadius: 22,
  });
  children.push(headline.node);
  currentY += headline.totalHeight + 18;

  if (body) {
    const text = createTextGroup({
      id: `group-slide-${input.order}-body`,
      text: body,
      y: currentY,
      fontSize: body.length > 500 ? 15 : 17,
      lineHeight: 1.36,
      fontFamily: BODY_FONT_FAMILY,
      textColor: input.palette.bodyText,
      backgroundFill: input.palette.bodyBackground,
      paddingX: 22,
      paddingY: 18,
      maxWidth: 306,
      cornerRadius: 20,
    });
    children.push(text.node);
  }

  // A chapter card is read at a glance; text slides take the time of their words.
  const wordCount = `${title} ${body}`.split(/\s+/).filter(Boolean).length;
  const durationMs = input.slide.content.kind === 'chapter'
    ? 5_000
    : Math.min(20_000, Math.max(6_000, Math.round((wordCount / 3.2 + 2.5) * 1_000)));
  return createStage(children, durationMs);
}

function describePlannedSlide(content: RecapPlannedSlide['content']): { label: string; title: string; body: string } {
  const lines = (items: Array<{ text: string }>) => items.map(item => `• ${item.text}`).join('\n');
  switch (content.kind) {
    case 'chapter':
      return {
        label: `Épisode ${content.episodeNumber}${content.episodeTitle ? ` · ${content.episodeTitle}` : ''}`,
        title: content.headline,
        body: content.locations.join(' · '),
      };
    case 'moment':
      return { label: `Épisode ${content.episodeNumber} · Décisif`, title: content.text, body: content.detail ?? '' };
    case 'moment-group':
      return { label: `Épisode ${content.episodeNumber}`, title: content.heading, body: lines(content.items) };
    case 'changes':
      return {
        label: `Épisode ${content.episodeNumber} · Bilan`,
        title: 'Ce qui a changé',
        body: lines([...content.deaths, ...content.situations, ...content.questions.map(text => ({ text }))]),
      };
    case 'ending-status':
      return { label: 'Fin de saison', title: 'Où en est-on', body: lines(content.characters) };
    case 'ending-deaths':
      return {
        label: 'Fin de saison',
        title: 'Morts cette saison',
        body: content.deaths.map(death => `• ${death.character.name} · épisode ${death.episodeNumber}`).join('\n'),
      };
    case 'ending-questions':
      return { label: 'Fin de saison', title: 'Questions ouvertes', body: lines(content.questions) };
    default:
      return { label: '', title: '', body: '' };
  }
}

function createStage(children: Record<string, unknown>[], durationMs: number) {
  return {
    className: 'Stage',
    attrs: {
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      scaleX: 1,
      scaleY: 1,
      durationMs,
      formatVersion: RECAP_FORMAT_VERSION,
    },
    children: [{ className: 'Layer', children }],
  };
}

function createBackgroundNodes(imageSrc: string | null, palette: Palette, order: number) {
  const nodes: Record<string, unknown>[] = [{
    className: 'Rect',
    attrs: {
      id: `background-gradient-slide-${order}`,
      x: 0,
      y: 0,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: 0, y: STAGE_HEIGHT },
      fillLinearGradientColorStops: [0, palette.gradient[0], 1, palette.gradient[1]],
      listening: false,
    },
  }];
  if (imageSrc) {
    nodes.push({
      className: 'Image',
      attrs: {
        id: `background-slide-${order}`,
        name: `background-slide-${order}`,
        x: 0,
        y: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        src: toDisplayImageUrl(imageSrc),
        fit: 'cover',
        focalX: 0.5,
        focalY: 0.45,
        listening: false,
      },
    });
  }

  nodes.push({
    className: 'Rect',
    attrs: {
      id: `background-overlay-slide-${order}`,
      x: 0,
      y: 0,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      fill: palette.overlay,
      listening: false,
    },
  });
  return nodes;
}

function createTextGroup(options: TextGroupOptions): TextGroupResult {
  const paddingX = options.paddingX ?? 20;
  const paddingY = options.paddingY ?? 16;
  const metrics = estimateTextMetrics(options.text, options.fontSize, options.lineHeight, options.maxWidth);
  const rectWidth = metrics.width + paddingX * 2;
  const rectHeight = metrics.height + paddingY * 2;
  const x = options.centerHorizontally
    ? Math.max((STAGE_WIDTH - rectWidth) / 2, 24)
    : (options.x ?? 24);

  return {
    totalHeight: rectHeight,
    width: rectWidth,
    node: {
      className: 'Group',
      attrs: {
        id: options.id,
        name: options.id,
        x,
        y: options.y,
        draggable: options.draggable ?? true,
      },
      children: [
        {
          className: 'Rect',
          attrs: {
            width: rectWidth,
            height: rectHeight,
            fill: options.backgroundFill,
            cornerRadius: options.cornerRadius ?? 20,
          },
        },
        {
          className: 'Text',
          attrs: {
            x: paddingX,
            y: paddingY,
            width: metrics.width,
            text: options.text,
            fontSize: options.fontSize,
            lineHeight: options.lineHeight,
            fontFamily: options.fontFamily,
            fill: options.textColor,
            wrap: 'word',
            align: options.align ?? 'left',
          },
        },
      ],
    },
  };
}

function createPillGroup(input: {
  id: string;
  text: string;
  y: number;
  palette: Palette;
  alignRight: boolean;
}): TextGroupResult {
  const fontSize = 17;
  const paddingX = 15;
  const paddingY = 9;
  const metrics = estimateTextMetrics(input.text, fontSize, 1.05, 210);
  const rectWidth = metrics.width + paddingX * 2;
  const rectHeight = metrics.height + paddingY * 2;
  const x = input.alignRight ? STAGE_WIDTH - rectWidth - 24 : 24;

  return {
    totalHeight: rectHeight,
    width: rectWidth,
    node: {
      className: 'Group',
      attrs: { id: input.id, name: input.id, x, y: input.y, draggable: true },
      children: [
        {
          className: 'Rect',
          attrs: {
            width: rectWidth,
            height: rectHeight,
            fill: input.alignRight ? input.palette.tagBackground : input.palette.badgeBackground,
            cornerRadius: rectHeight / 2,
          },
        },
        {
          className: 'Text',
          attrs: {
            x: paddingX,
            y: paddingY,
            width: metrics.width,
            text: input.text,
            fontSize,
            fontFamily: BODY_FONT_FAMILY,
            lineHeight: 1.05,
            fill: input.alignRight ? input.palette.tagText : input.palette.badgeText,
            align: 'center',
          },
        },
      ],
    },
  };
}

function estimateTextMetrics(text: string, fontSize: number, lineHeight: number, maxWidth: number) {
  const averageCharWidth = fontSize * 0.53;
  const maxCharsPerLine = Math.max(6, Math.floor(maxWidth / averageCharWidth));
  let lineCount = 0;
  let longestLineLength = 0;

  // Explicit line breaks (episode moments) start a new wrapped paragraph.
  (text || '').split('\n').forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let currentLineLength = 0;
    lineCount += 1;
    words.forEach((word) => {
      const nextLength = currentLineLength ? currentLineLength + word.length + 1 : word.length;
      if (nextLength > maxCharsPerLine && currentLineLength > 0) {
        longestLineLength = Math.max(longestLineLength, currentLineLength);
        currentLineLength = word.length;
        lineCount += 1;
      } else {
        currentLineLength = nextLength;
      }
    });
    longestLineLength = Math.max(longestLineLength, currentLineLength);
  });

  return {
    width: Math.min(maxWidth, Math.max(longestLineLength * averageCharWidth, fontSize * 2)),
    height: lineCount * fontSize * lineHeight,
  };
}

function determinePalette(genres: string[]): Palette {
  const lower = genres.map((genre) => genre.toLowerCase());
  if (lower.includes('comedy')) {
    return {
      gradient: ['#f59e0b', '#7c2d12'], overlay: 'rgba(69, 26, 3, 0.46)',
      titleBackground: 'rgba(255, 255, 255, 0.91)', bodyBackground: 'rgba(255, 255, 255, 0.87)',
      titleText: '#0f172a', bodyText: '#1f2937', badgeBackground: '#38bdf8', badgeText: '#082f49',
      tagBackground: '#fb923c', tagText: '#1c1917',
    };
  }
  if (lower.includes('science-fiction') || lower.includes('sci-fi')) {
    return {
      gradient: ['#312e81', '#020617'], overlay: 'rgba(2, 6, 23, 0.58)',
      titleBackground: 'rgba(30, 41, 59, 0.88)', bodyBackground: 'rgba(15, 23, 42, 0.84)',
      titleText: '#e0f2fe', bodyText: '#dbeafe', badgeBackground: '#5eead4', badgeText: '#022c22',
      tagBackground: '#818cf8', tagText: '#111827',
    };
  }
  if (lower.includes('fantasy')) {
    return {
      gradient: ['#4c1d95', '#1e1b4b'], overlay: 'rgba(30, 27, 75, 0.55)',
      titleBackground: 'rgba(76, 29, 149, 0.88)', bodyBackground: 'rgba(46, 16, 101, 0.84)',
      titleText: '#f5f3ff', bodyText: '#ede9fe', badgeBackground: '#f472b6', badgeText: '#4a044e',
      tagBackground: '#c084fc', tagText: '#3b0764',
    };
  }
  if (lower.includes('thriller') || lower.includes('crime')) {
    return {
      gradient: ['#1f2937', '#020617'], overlay: 'rgba(2, 6, 23, 0.64)',
      titleBackground: 'rgba(15, 23, 42, 0.92)', bodyBackground: 'rgba(15, 23, 42, 0.86)',
      titleText: '#f8fafc', bodyText: '#e2e8f0', badgeBackground: '#f87171', badgeText: '#450a0a',
      tagBackground: '#f8fafc', tagText: '#0f172a',
    };
  }
  return {
    gradient: ['#0f172a', '#020617'], overlay: 'rgba(2, 6, 23, 0.58)',
    titleBackground: 'rgba(15, 23, 42, 0.9)', bodyBackground: 'rgba(15, 23, 42, 0.84)',
    titleText: '#f9fafb', bodyText: '#e5e7eb', badgeBackground: '#60a5fa', badgeText: '#0b1120',
    tagBackground: '#facc15', tagText: '#111827',
  };
}

/**
 * Trakt's image policy requires its images to go through the cached proxy;
 * TMDB and TVmaze images load from their own CDNs.
 */
export function toDisplayImageUrl(url: string): string {
  const hostname = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  return hostname === 'trakt.tv' || hostname.endsWith('.trakt.tv')
    ? proxiedImageUrl(url)
    : url;
}
