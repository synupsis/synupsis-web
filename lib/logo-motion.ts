// The arrow cutouts of the logo, traced from assets/svg/logo_white.svg in its
// 342 viewBox, and the motion that sends them round. Each cutout splits into
// its two chevrons: they run out the way they point, a twin of each comes back
// in from the other side, and the back chevron follows its front one a beat
// later so the pair never moves as one block.

export type LogoChevron = {
  /** Outline, reaching a hair past the seams it shares so no line shows at rest. */
  path: string;
  /** Centre the chevron stretches around while it travels. */
  origin: [number, number];
  direction: 1 | -1;
  /** The back chevron of a pair, which follows the front one a beat later. */
  trailing: boolean;
};

export const LOGO_CHEVRONS: LogoChevron[] = [
  {
    // Rewind, front
    path: 'M170 77 C167.77 74.77 168.22 69.23 167.93 66.08 C167.45 61.71 166.75 58.59 164 55 C159.84 52.32 156.9 51.44 152 52 C148.58 53.42 145.4 55.23 142.19 57.06 C141.24 57.59 140.3 58.12 139.32 58.67 C136.21 60.43 133.1 62.21 130 64 C128.88 64.64 127.75 65.28 126.6 65.94 C123.18 67.9 119.77 69.88 116.38 71.87 C115.3 72.49 114.23 73.11 113.13 73.75 C105.75 78.11 105.75 78.11 101 85 C100.53 88.83 100.63 91.16 102.19 94.69 C106.66 100.39 113.09 103.43 119.31 106.87 C127.48 111.44 135.61 116.08 143.69 120.81 C152.43 125.93 161.2 130.99 170 136 L171 136.58 L171 77.08 Z',
    origin: [136, 94],
    direction: -1,
    trailing: false,
  },
  {
    // Rewind, back
    path: 'M235.84 132.48 C235.84 131.73 235.83 130.98 235.83 130.2 C235.82 128.57 235.81 126.94 235.8 125.32 C235.79 122.73 235.77 120.15 235.75 117.57 C235.69 110.23 235.63 102.9 235.6 95.56 C235.58 91.07 235.54 86.58 235.5 82.08 C235.48 80.37 235.47 78.67 235.47 76.96 C235.47 74.56 235.44 72.17 235.42 69.78 C235.42 69.08 235.42 68.37 235.43 67.65 C235.35 63.05 234.42 59.91 232 56 C228.94 53.35 226.78 52.15 222.81 51.37 C219.1 51.98 217.2 52.82 213.98 54.63 C213.01 55.18 212.04 55.72 211.04 56.28 C210.04 56.85 209.03 57.42 208 58 C207.05 58.53 206.09 59.07 205.11 59.61 C202.22 61.24 199.33 62.87 196.44 64.5 C195.47 65.04 194.51 65.59 193.52 66.14 C192.56 66.68 191.61 67.22 190.62 67.78 C189.69 68.31 188.75 68.84 187.78 69.38 C184.21 71.46 180.74 73.67 177.27 75.92 C174.64 77.17 172.88 77.28 170 77 L170 98.17 L235.86 136.18 Z',
    origin: [203, 94],
    direction: -1,
    trailing: true,
  },
  {
    // Forward, front
    path: 'M166 265 C168.21 267.21 167.34 274.14 167.43 277.17 C168.07 281.47 169.28 283.64 172 287 C175.88 289.73 178.8 290.4 183.5 289.72 C189.24 288.07 194.33 284.61 199.44 281.56 C200.69 280.83 201.94 280.09 203.19 279.36 C205.06 278.26 206.92 277.17 208.78 276.06 C212.31 273.97 215.87 271.95 219.47 270 C220.25 269.57 221.03 269.13 221.84 268.69 C223.22 267.93 224.62 267.18 226.03 266.45 C230.98 263.66 233.29 260.3 235 255 C235.26 252.44 235.26 252.44 234.56 250.25 C234.4 249.53 234.24 248.82 234.07 248.08 C231.81 243.67 226.99 241.28 222.81 238.89 C221.8 238.31 220.78 237.73 219.74 237.13 C218.11 236.2 218.11 236.2 216.44 235.25 C215.29 234.59 214.15 233.94 212.97 233.26 C209.93 231.52 206.88 229.78 203.84 228.05 C199.1 225.35 194.37 222.64 189.63 219.94 C188.46 219.27 187.28 218.6 186.1 217.93 L165 205.72 L165 264.83 Z',
    origin: [200, 248],
    direction: 1,
    trailing: false,
  },
  {
    // Forward, back
    path: 'M100 204 C100.1 206.52 100.15 209.02 100.16 211.54 C100.16 212.28 100.17 213.03 100.17 213.79 C100.18 215.39 100.19 217 100.2 218.61 C100.21 221.15 100.23 223.69 100.25 226.24 C100.31 233.47 100.37 240.69 100.4 247.92 C100.42 252.35 100.46 256.78 100.5 261.21 C100.52 262.89 100.53 264.57 100.53 266.26 C100.53 268.62 100.56 270.97 100.58 273.33 C100.58 274.02 100.58 274.71 100.57 275.42 C100.65 279.99 101.59 283.13 104 287 C107.47 289.37 110.6 290.51 114.83 290.43 C119.91 289.43 124.34 286.29 128.75 283.69 C129.85 283.06 130.94 282.43 132.08 281.78 C137.31 278.77 142.5 275.71 147.69 272.62 C148.55 272.11 149.41 271.6 150.29 271.08 C151.89 270.13 153.49 269.17 155.07 268.2 C161.69 264.26 161.69 264.26 166 265 L166 243.24 Z',
    origin: [133, 247],
    direction: 1,
    trailing: true,
  },
];

/** Where the chevrons sit, painted white while they are away. The S channel under them stays. */
export const LOGO_CHEVRON_HOMES = [
  '95,40 240,40 240,137.39 170,96.97 170,140 95,140',
  '166,198 250,198 250,300 95,300 95,203.63 166,244.44',
];

/**
 * The two arms of the S channel, from the edge of the square up to the arrows.
 * Painted white before the arrows set off, so the square closes up around
 * them, and cleared again once they are home; transparent at rest.
 */
export const LOGO_CHANNEL_COVERS = [
  '168,90 240,90 240,140 300,160 342,170 342,252 300,235 250,195 165,145',
  '168.2,252 96.2,252 96.2,202 36.2,182 0,172 0,90 36.2,107 86.2,147 171.2,197',
];

type LogoMotionSettings = {
  /** viewBox units a chevron travels: far enough that it leaves the mark as its twin enters it. */
  lap: number;
  /** Extra length at full speed. */
  stretch: number;
  /** Shares of the lap over which the leaving chevron fades out, and its twin fades in. */
  fadeOut: [number, number];
  fadeIn: [number, number];
  /** Blur of the melt at its height, in viewBox units. */
  meltBlur: number;
  /** Contrast that turns the blurred mask back into clean, gooey edges. */
  meltSharpness: number;
  meltInMs: number;
  meltOutMs: number;
  /** The channel closes this long before the arrows set off, and reopens as long after they settle. */
  closeMs: number;
  openMs: number;
  springHz: number;
  springDamping: number;
  glideMs: number;
  trailingDelayMs: number;
};

const LOGO_MOTION_DEFAULTS: LogoMotionSettings = {
  lap: 340,
  stretch: 0.3,
  fadeOut: [0.08, 0.5],
  fadeIn: [0.42, 0.85],
  meltBlur: 9,
  meltSharpness: 14,
  meltInMs: 140,
  meltOutMs: 200,
  closeMs: 220,
  openMs: 260,
  springHz: 3.4,
  springDamping: 0.6,
  glideMs: 480,
  trailingDelayMs: 70,
};

const FRAME_MS = 16;

type LapFrame = { ms: number; progress: number; velocity: number };

// A spring chasing a target that glides one lap and stops dead: the chevron
// gathers speed smoothly, overshoots its spot a touch and settles into it.
function simulateLap({ springHz, springDamping, glideMs }: LogoMotionSettings): LapFrame[] {
  const omega = 2 * Math.PI * springHz;
  const frames: LapFrame[] = [];
  let progress = 0;
  let velocity = 0;
  for (let ms = 0; ms < 10_000; ms++) {
    if (ms % FRAME_MS === 0) frames.push({ ms, progress, velocity });
    const glide = Math.min(ms / glideMs, 1);
    if (glide === 1 && Math.abs(1 - progress) < 0.001 && Math.abs(velocity) < 0.01) break;
    const target = glide * glide * (2 - glide);
    velocity += (omega ** 2 * (target - progress) - 2 * springDamping * omega * velocity) / 1000;
    progress += velocity / 1000;
  }
  return [...frames, { ms: frames.at(-1)!.ms + FRAME_MS, progress: 1, velocity: 0 }];
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(Math.max((value - from) / (to - from), 0), 1);
  return t * t * (3 - 2 * t);
}

export type LogoMotion = {
  /** How long one chevron takes to go round, from leaving home to settling back. */
  lapMs: number;
  delayOf: (chevron: LogoChevron) => number;
  keyframesOf: (chevron: LogoChevron, copy: 'leaving' | 'arriving') => Keyframe[];
  /** From the channel closing to it opening again. */
  runMs: number;
  channelCoverKeyframes: Keyframe[];
  meltAt: (elapsedMs: number) => { blur: number; slope: number; intercept: number };
};

export function createLogoMotion(settings: LogoMotionSettings = LOGO_MOTION_DEFAULTS): LogoMotion {
  const frames = simulateLap(settings);
  const topVelocity = Math.max(...frames.map(frame => Math.abs(frame.velocity)));
  const lapMs = frames.at(-1)!.ms;
  const arrowsMs = lapMs + settings.trailingDelayMs;
  const runMs = settings.closeMs + arrowsMs + settings.openMs;

  const presenceOf = (copy: 'leaving' | 'arriving', progress: number) => (copy === 'leaving'
    ? 1 - smoothstep(settings.fadeOut[0], settings.fadeOut[1], progress)
    : smoothstep(settings.fadeIn[0], settings.fadeIn[1], progress));

  // Two beats: the square closes up around the arrows, they go round, then it opens again.
  const channelCoverKeyframes: Keyframe[] = [];
  for (let ms = 0; ms <= runMs; ms += FRAME_MS) {
    const closed = smoothstep(0, settings.closeMs, ms) * (1 - smoothstep(runMs - settings.openMs, runMs, ms));
    channelCoverKeyframes.push({ offset: ms / runMs, opacity: closed.toFixed(3) });
  }
  channelCoverKeyframes.push({ offset: 1, opacity: 0 });

  return {
    lapMs,
    runMs,
    channelCoverKeyframes,
    delayOf: chevron => settings.closeMs + (chevron.trailing ? settings.trailingDelayMs : 0),

    // One copy of a chevron: the one leaving home, or its twin arriving from a
    // lap behind. Both stretch along their path with speed and fade away from
    // home; the melt turns that fade into the chevron shrinking into the S, or
    // welling up out of it.
    keyframesOf: (chevron, copy) => {
      const [originX, originY] = chevron.origin;
      const start = copy === 'leaving' ? 0 : -1;
      return frames.map(({ ms, progress, velocity }) => {
        const shift = chevron.direction * settings.lap * (start + progress);
        const stretch = 1 + settings.stretch * Math.abs(velocity) / topVelocity;
        const presence = presenceOf(copy, progress);
        return {
          offset: ms / lapMs,
          transform: `translate(${(shift + originX).toFixed(2)}px, ${originY}px) `
            + `scale(${stretch.toFixed(3)}, ${(1 / Math.sqrt(stretch)).toFixed(3)}) `
            + `translate(${-originX}px, ${-originY}px)`,
          opacity: presence.toFixed(3),
        };
      });
    },

    // How liquid the mark is. The mask goes through a blur and a steep contrast
    // curve, so the holes flow into each other like goo and a fading chevron
    // melts into the white instead of turning grey. It eases in as the arrows
    // set off and out as they settle, leaving the mark exactly as drawn.
    meltAt: (elapsedMs) => {
      const amount = smoothstep(0, settings.meltInMs, elapsedMs)
        * (1 - smoothstep(runMs - settings.meltOutMs, runMs, elapsedMs));
      const slope = 1 + (settings.meltSharpness - 1) * amount;
      return { blur: settings.meltBlur * amount, slope, intercept: (1 - slope) / 2 };
    },
  };
}
