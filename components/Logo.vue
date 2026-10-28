<template>
  <RouterLink v-slot="{ href, navigate, isExactActive }" to="/" custom>
    <a
      :href="href"
      :aria-label="t('Synupsis home')"
      :aria-current="isExactActive ? 'page' : undefined"
      v-bind="$attrs"
      :class="[
        'logo inline-flex shrink-0 items-center rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-background',
        logoClasses.container,
      ]"
      @pointerenter="onPointerEnter"
      @click="onActivate($event, navigate)"
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
        <template #fallback>
          <img src="/svg/logo_white.svg" :alt="displayText ? '' : 'Synupsis'" :class="logoClasses.icon" />
          <img v-if="displayText" :src="logoTextUrl" alt="Synupsis" :class="logoClasses.wordmark" />
        </template>
      </ClientOnly>
    </a>
  </RouterLink>
</template>

<script setup lang="ts">
const { t } = useI18n();
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { isNavigationFailure, NavigationFailureType, RouterLink, type UseLinkReturn } from 'vue-router';
import {
  createLogoMotion,
  LOGO_CHANNEL_COVERS,
  LOGO_CHEVRON_HOMES,
  LOGO_CHEVRONS,
  type LogoMotion,
} from '~/lib/logo-motion';
import logoWhiteSvg from '~/assets/svg/logo_white.svg?raw';
import logoTextUrl from '~/assets/svg/logo_text.svg';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  displayText?: boolean;
  size?: 'sm' | 'md' | 'base' | 'xl';
  playOnHomeArrival?: boolean;
}>(), {
  displayText: false,
  size: 'base',
  playOnHomeArrival: false,
});

const router = useRouter();
const homeAnimation = useState<{ generation: number; pending: number | null }>('logo-home-animation', () => ({
  generation: 0,
  pending: null,
}));

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
let disposed = false;
let animationGeneration = 0;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType === 'mouse') void playArrows();
}

async function onActivate(event: MouseEvent, navigate: UseLinkReturn['navigate']) {
  const link = event.currentTarget as HTMLAnchorElement | null;
  const target = link?.getAttribute('target');
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    || (target && target.toLowerCase() !== '_self') || link?.hasAttribute('download')) return;

  const generation = ++homeAnimation.value.generation;
  homeAnimation.value.pending = null;
  try {
    // Navigate immediately. This instance may unmount before the promise settles;
    // the homepage header owns the animation, so a tap still gets a complete run.
    const failure = await navigate(event);
    if (generation !== homeAnimation.value.generation || router.currentRoute.value.path !== '/'
      || (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) || prefersReducedMotion()) return;
    homeAnimation.value.pending = generation;
  } catch {
    // Failed navigation must not leave an animation waiting for a later visit.
    if (generation === homeAnimation.value.generation) homeAnimation.value.pending = null;
  }
}

// The explicit homepage flag excludes the old page's header and the persistent
// footer. Waiting for mark also covers ClientOnly hydration and slow navigation.
watch([mark, () => homeAnimation.value.pending], () => {
  if (!props.playOnHomeArrival || !mark.value || homeAnimation.value.pending === null || disposed) return;
  homeAnimation.value.pending = null;
  void playArrows();
}, { flush: 'post' });

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
  if (disposed || !mark.value || arrowsPlaying.value || prefersReducedMotion()) return;
  const generation = ++animationGeneration;
  arrowsPlaying.value = true;
  await nextTick();
  if (disposed || generation !== animationGeneration || !mark.value) return;

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

  const finish = () => {
    if (disposed || generation !== animationGeneration) return;
    if (meltFrame !== undefined) cancelAnimationFrame(meltFrame);
    meltFrame = undefined;
    arrowsPlaying.value = false;
    arrowAnimations.forEach(animation => animation.cancel());
    arrowAnimations = [];
  };
  void Promise.all(arrowAnimations.map(animation => animation.finished)).then(finish, finish);
}

onBeforeUnmount(() => {
  disposed = true;
  animationGeneration += 1;
  if (meltFrame !== undefined) cancelAnimationFrame(meltFrame);
  arrowAnimations.forEach(animation => animation.cancel());
  if (props.playOnHomeArrival && router.currentRoute.value.path !== '/') homeAnimation.value.pending = null;
});

const clipId = `logo-${useId()}`;

const sizeClasses = {
  sm: {
    container: 'gap-2',
    icon: 'size-8',
    wordmark: 'h-4 w-auto',
  },
  md: {
    container: 'gap-2.5 sm:gap-3',
    icon: 'size-9 sm:size-10',
    wordmark: 'h-6 w-auto min-[360px]:h-7 sm:h-8',
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
