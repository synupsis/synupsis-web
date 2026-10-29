<template>
  <header>
    <div
      :class="[
        'flex w-full items-center justify-between gap-2 px-5 sm:gap-3 sm:px-8',
        compact ? 'h-16' : 'h-20',
        contained ? 'mx-auto max-w-7xl' : '',
      ]"
    >
      <Logo
        display-text
        size="md"
        :class="{ 'max-[420px]:[&>img:last-child]:hidden': installAvailable }"
        :play-on-home-arrival="animateLogoOnArrival"
        :aria-label="t('Synupsis home')"
      />

      <nav :aria-label="t('Account')" class="flex shrink-0 items-center gap-1 sm:gap-2">
        <ClientOnly>
          <PwaInstallButton @availability="installAvailable = $event" />
        </ClientOnly>
        <RecapKeysStatus />
        <slot name="account">
          <UserAuthStatus />
        </slot>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
const { t } = useI18n();
const installAvailable = ref(false);
withDefaults(defineProps<{
  compact?: boolean;
  contained?: boolean;
  animateLogoOnArrival?: boolean;
}>(), {
  compact: false,
  contained: true,
  animateLogoOnArrival: false,
});
</script>
