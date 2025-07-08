<template>
  <div class="w-full animate-pulse">
    <!-- Header Skeleton -->
    <div class="flex w-full justify-between items-center py-6 px-8">
      <div class="h-8 w-32 bg-muted rounded-md" />
      <div class="h-9 w-24 bg-muted rounded-md" />
    </div>

    <!-- Hero Section Skeleton -->
    <div class="relative w-full h-[60vh] bg-muted">
      <div class="relative h-full flex flex-col justify-end items-start p-8 md:p-12 lg:p-16">
        <div class="max-w-3xl w-full">
          <div class="flex flex-wrap gap-2 mb-4">
            <div class="h-6 w-20 bg-muted-foreground/20 rounded-md" />
            <div class="h-6 w-24 bg-muted-foreground/20 rounded-md" />
          </div>
          <div class="h-16 w-3/4 bg-muted-foreground/20 rounded-md" />
          <div class="flex items-center flex-wrap gap-x-4 gap-y-2 mt-4">
            <div class="h-6 w-28 bg-muted-foreground/20 rounded-md" />
            <div class="h-6 w-24 bg-muted-foreground/20 rounded-md" />
            <div class="h-6 w-20 bg-muted-foreground/20 rounded-md" />
          </div>
          <div class="mt-6 space-y-2">
            <div class="h-4 w-full bg-muted-foreground/20 rounded-md" />
            <div class="h-4 w-full bg-muted-foreground/20 rounded-md" />
            <div class="h-4 w-5/6 bg-muted-foreground/20 rounded-md" />
          </div>
        </div>
      </div>
    </div>

    <!-- Seasons Section Skeleton -->
    <div class="py-16">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="h-10 w-48 bg-muted rounded-md mb-10" />
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-8">
          <div v-for="i in 5" :key="i" class="flex flex-col bg-muted rounded-lg p-4 space-y-4">
            <div class="h-6 w-3/4 bg-muted-foreground/20 rounded-md" />
            <div class="h-4 w-1/2 bg-muted-foreground/20 rounded-md" />
            <div class="flex-grow" />
            <div class="h-10 w-full bg-muted-foreground/20 rounded-md" />
            <div class="h-10 w-full bg-muted-foreground/20 rounded-md" />
          </div>
        </div>
      </div>
    </div>

    <!-- Cast Skeleton -->
    <div class="py-16">
      <div class="mx-auto max-w-7xl px-6 lg:px-8">
        <div class="h-10 w-48 bg-muted rounded-md mb-10" />
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-8">
          <div v-for="i in 6" :key="i" class="flex flex-col items-center text-center">
            <div class="w-32 h-32 bg-muted-foreground/20 rounded-full mb-4" />
            <div class="h-6 w-3/4 bg-muted-foreground/20 rounded-md" />
            <div class="h-4 w-1/2 bg-muted-foreground/20 rounded-md mt-2" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
