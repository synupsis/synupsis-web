<template>
  <div class="w-full min-h-screen bg-background text-foreground">
    <header class="flex w-full justify-between items-center py-6 px-8 border-b">
      <Logo display-text />
      <UserAuthStatus />
    </header>
    <main class="p-8">
      <div class="max-w-4xl mx-auto text-center">
        <h1 class="text-5xl font-extrabold tracking-tighter mb-4">About Synupsis</h1>
        <p class="text-xl text-muted-foreground">
          Never lose the thread of your favorite shows.
        </p>
      </div>
      <div class="max-w-2xl mx-auto mt-12 space-y-6 text-lg">
        <p>
          In an age of binge-watching and ever-expanding universes, it's easy to forget the crucial plot points of a series, especially when a new season comes out months (or even years!) later. Synupsis was born from a simple idea: what if you could get a quick, clear, and engaging recap of any season of any show, right when you need it?
        </p>
        <p>
          Our mission is to provide high-quality, community-driven recaps that help you dive back into your favorite stories without missing a beat. Whether you're preparing for a new season premiere or just need a refresher, Synupsis is your personal guide to the world of television.
        </p>
        <p class="font-semibold text-center pt-8">
          Welcome to the community. Welcome to Synupsis.
        </p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import UserAuthStatus from '~/components/UserAuthStatus.vue';
</script>
