<template>
  <router-link
    to="/"
    :class="[
      'logo inline-flex shrink-0 items-center transition-opacity hover:opacity-80',
      logoClasses.container,
    ]"
    @mouseenter="playArrows"
  >
    <ClientOnly>
      <svg
        ref="mark"
        viewBox="0 0 342 342"
        :role="displayText ? undefined : 'img'"
        :aria-hidden="displayText ? 'true' : undefined"
        :aria-label="displayText ? undefined : 'Synupsis'"
        :class="['logo-mark', logoClasses.icon]"
      >
        <defs>
          <filter
            :id="`${clipId}-melt`"
            filterUnits="userSpaceOnUse"
            x="-20"
            y="-20"
            width="382"
            height="382"
            color-interpolation-filters="sRGB"
          >
            <feGaussianBlur ref="meltBlur" stdDeviation="0" />
            <feComponentTransfer>
              <feFuncR ref="meltCurveR" type="linear" slope="1" intercept="0" />
              <feFuncG ref="meltCurveG" type="linear" slope="1" intercept="0" />
              <feFuncB ref="meltCurveB" type="linear" slope="1" intercept="0" />
            </feComponentTransfer>
          </filter>
          <mask
            :id="`${clipId}-mask`"
            maskUnits="userSpaceOnUse"
            x="-20"
            y="-20"
            width="382"
            height="382"
          >
            <g :filter="arrowsPlaying ? `url(#${clipId}-melt)` : undefined">
              <rect x="-20" y="-20" width="382" height="382" fill="#000000" />
              <path :d="logoPath.d" :transform="logoPath.transform" fill="#FFFFFF" />
              <template v-if="arrowsPlaying">
                <!-- Fill the arrows' spots, then punch each chevron back in wherever it travels. -->
                <polygon v-for="home in LOGO_CHEVRON_HOMES" :key="home" :points="home" fill="#FFFFFF" />
                <polygon
                  v-for="cover in LOGO_CHANNEL_COVERS"
                  :key="cover"
                  :points="cover"
                  data-channel-cover
                  fill="#FFFFFF"
                  opacity="0"
                />
                <template v-for="(chevron, index) in LOGO_CHEVRONS" :key="index">
                  <path
                    v-for="copy in CHEVRON_COPIES"
                    :key="copy"
                    :d="chevron.path"
                    :data-chevron="index"
                    :data-copy="copy"
                    class="logo-chevron"
                    fill="#000000"
                  />
                </template>
              </template>
            </g>
          </mask>
        </defs>
        <rect width="342" height="342" fill="#FFFFFF" :mask="`url(#${clipId}-mask)`" />
      </svg>
      <img
        v-if="displayText"
        :src="logoTextUrl"
        alt="Synupsis"
        :class="logoClasses.wordmark"
      />
    </ClientOnly>
  </router-link>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue';
import {
  createLogoMotion,
  LOGO_CHANNEL_COVERS,
  LOGO_CHEVRON_HOMES,
  LOGO_CHEVRONS,
  type LogoMotion,
} from '~/lib/logo-motion';
import logoWhiteSvg from '~/assets/svg/logo_white.svg?raw';
import logoTextUrl from '~/assets/svg/logo_text.svg';

const logoPath = {
  d: logoWhiteSvg.match(/\sd="([^"]*)"/)?.[1] ?? '',
  transform: logoWhiteSvg.match(/transform="([^"]*)"/)?.[1],
};

const CHEVRON_COPIES = ['leaving', 'arriving'] as const;

const mark = ref<SVGSVGElement>();
const meltBlur = ref<SVGFEGaussianBlurElement>();
const meltCurveR = ref<SVGFEFuncRElement>();
const meltCurveG = ref<SVGFEFuncGElement>();
const meltCurveB = ref<SVGFEFuncBElement>();
const arrowsPlaying = ref(false);
let arrowAnimations: Animation[] = [];
let meltFrame: number | undefined;

// Filter attributes cannot be animated as CSS, so the melt follows the arrows frame by frame.
function followMelt(motion: LogoMotion, startedAt: number) {
  const { blur, slope, intercept } = motion.meltAt(performance.now() - startedAt);
  meltBlur.value?.setAttribute('stdDeviation', blur.toFixed(2));
  for (const curve of [meltCurveR.value, meltCurveG.value, meltCurveB.value]) {
    curve?.setAttribute('slope', slope.toFixed(3));
    curve?.setAttribute('intercept', intercept.toFixed(3));
  }
  if (arrowsPlaying.value) meltFrame = requestAnimationFrame(() => followMelt(motion, startedAt));
}

async function playArrows() {
  if (arrowsPlaying.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  arrowsPlaying.value = true;
  await nextTick();

  const motion = createLogoMotion();
  const chevronElements = mark.value?.querySelectorAll<SVGPathElement>('[data-chevron]') ?? [];
  arrowAnimations = [...chevronElements].map((element) => {
    const chevron = LOGO_CHEVRONS[Number(element.dataset.chevron)]!;
    const copy = element.dataset.copy as typeof CHEVRON_COPIES[number];
    return element.animate(motion.keyframesOf(chevron, copy), {
      duration: motion.lapMs,
      delay: motion.delayOf(chevron),
      fill: 'both',
    });
  });
  const channelCovers = mark.value?.querySelectorAll<SVGPolygonElement>('[data-channel-cover]') ?? [];
  arrowAnimations.push(...[...channelCovers].map(cover => cover.animate(motion.channelCoverKeyframes, {
    duration: motion.runMs,
    fill: 'both',
  })));
  followMelt(motion, performance.now());

  Promise.all(arrowAnimations.map(animation => animation.finished)).then(
    () => { arrowsPlaying.value = false; },
    () => {},
  );
}

onBeforeUnmount(() => {
  if (meltFrame !== undefined) cancelAnimationFrame(meltFrame);
  arrowAnimations.forEach(animation => animation.cancel());
});

const props = withDefaults(defineProps<{
  displayText?: boolean;
  size?: 'sm' | 'base' | 'xl';
}>(), {
  displayText: false,
  size: 'base',
});

const clipId = `logo-${useId()}`;

const sizeClasses = {
  sm: {
    container: 'gap-2',
    icon: 'size-8',
    wordmark: 'h-4 w-auto',
  },
  base: {
    container: 'gap-3',
    icon: 'size-12',
    wordmark: 'h-9 w-auto',
  },
  xl: {
    container: 'gap-4',
    icon: 'size-16',
    wordmark: 'h-9 w-auto',
  },
} as const;

const logoClasses = computed(() => sizeClasses[props.size]);
</script>

<style scoped>
.logo-mark {
  overflow: visible;
}

/* The keyframes carry each chevron's own stretch origin. */
.logo-chevron {
  transform-origin: 0 0;
}
</style>
