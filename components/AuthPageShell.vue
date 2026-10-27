<template>
  <div class="relative isolate flex flex-col bg-background text-foreground">
    <div aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.12),_transparent_65%)]" />
    <AppHeader class="border-b border-border/60">
      <template #account>
        <NuxtLink
          :to="alternateTo"
          class="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-violet-400/40 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {{ alternateLabel }}
        </NuxtLink>
      </template>
    </AppHeader>
    <main class="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
      <section aria-labelledby="auth-heading" class="w-full max-w-md rounded-2xl border border-border bg-background/80 p-6 shadow-xl shadow-black/10 backdrop-blur-sm sm:p-8">
        <h1 id="auth-heading" class="mb-8 text-3xl font-semibold tracking-tight">{{ title }}</h1>
        <slot />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  alternateLabel: string;
  alternateTo: string;
}>();
</script>
