<template>
  <div class="min-h-screen w-full bg-background text-foreground">
    <AppHeader class="border-b border-border" />
    <main class="mx-auto max-w-2xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
      <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">{{ t('About Synupsis') }}</h1>
      <p class="mt-3 text-lg text-muted-foreground">
        {{ t('Never lose the thread of your favorite shows.') }}
      </p>
      <div class="mt-10 space-y-6 text-base leading-relaxed text-foreground/90 sm:text-lg">
        <p>
          {{ t('In an age of binge-watching and ever-expanding universes, it\'s easy to forget the crucial plot points of a series, especially when a new season comes out months (or even years!) later. Synupsis was born from a simple idea: what if you could get a quick, clear, and engaging recap of any season of any show, right when you need it?') }}
        </p>
        <p>
          {{ t('Our mission is to provide high-quality recaps, built on verified sources and improved by the community\'s suggestions, that help you dive back into your favorite stories without missing a beat. Whether you\'re preparing for a new season premiere or just need a refresher, Synupsis is your personal guide to the world of television.') }}
        </p>
        <p class="font-semibold">
          {{ t('Welcome to the community. Welcome to Synupsis.') }}
        </p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
</script>
