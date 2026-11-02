<template>
  <div class="min-h-screen w-full bg-background text-foreground">
    <AppHeader class="border-b border-border" />
    <main class="mx-auto max-w-2xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
      <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">{{ content.title }}</h1>
      <p class="mt-3 text-sm text-muted-foreground">{{ t('Last updated {date}', { date: updatedAt }) }}</p>
      <p class="mt-6 text-lg leading-relaxed text-muted-foreground">{{ content.intro }}</p>

      <div class="mt-12 divide-y divide-border border-t border-border">
        <section v-for="section in content.sections" :key="section.title" class="py-8">
          <h2 class="text-lg font-semibold">{{ section.title }}</h2>
          <p v-for="paragraph in section.paragraphs" :key="paragraph" class="mt-2 leading-relaxed text-muted-foreground">{{ paragraph }}</p>
          <ul v-if="section.items?.length" class="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted-foreground marker:text-muted-foreground/60">
            <li v-for="item in section.items" :key="item">{{ item }}</li>
          </ul>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { legalUpdatedAt, type LocalizedLegalDocument } from '~/lib/legal/document';

const props = defineProps<{ document: LocalizedLegalDocument }>();
const { t, locale } = useI18n();

const content = computed(() => props.document[locale.value]);
const updatedAt = computed(() => new Date(`${legalUpdatedAt}T12:00:00Z`).toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' }));

useHead(() => ({ title: `${content.value.title} — Synupsis` }));
</script>
