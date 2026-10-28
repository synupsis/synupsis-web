<template>
  <div class="min-h-screen bg-background text-foreground">
    <AppHeader
      compact
      contained
      class="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-xl"
    />

    <main v-if="showData">
      <section class="relative isolate overflow-hidden sm:min-h-[560px]">
        <!-- Fanarts are landscape with the subject right of centre: on a phone a full-height cover would keep only a sliver, so they become a faded band on top; on a wide screen they slide right, clear of the text column. -->
        <div
          class="absolute inset-x-0 top-0 -z-20 aspect-[4/3] bg-cover bg-[position:70%_center] [mask-image:linear-gradient(to_bottom,black_60%,transparent)] sm:inset-0 sm:aspect-auto sm:bg-top sm:[mask-image:none] md:left-auto md:w-[72%] md:[mask-image:linear-gradient(to_right,transparent,black_35%)]"
          :style="{ backgroundImage: `url(${proxiedImageUrl(showData.image)})` }"
        />
        <div class="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div class="mx-auto flex max-w-7xl flex-col gap-8 px-5 pb-8 pt-48 sm:min-h-[560px] sm:items-start sm:justify-end sm:gap-10 sm:pb-14 sm:pt-24 lg:px-8">
          <div class="min-w-0 max-w-3xl md:max-w-xl">
            <h1 class="text-5xl font-black tracking-tight sm:text-7xl">{{ showData.name }}</h1>
            <div v-if="firstAired" class="mt-4 flex items-center gap-2 text-sm text-white/60">
              <CalendarIcon class="h-4 w-4" />{{ new Date(firstAired).getFullYear() }}
            </div>
            <p v-if="showSummary" class="mt-5 line-clamp-4 max-w-2xl whitespace-pre-line text-base leading-7 text-white/70">{{ showSummary }}</p>
          </div>
          <EpisodeTracker
            v-if="seasonsChronological.length"
            class="w-full sm:max-w-[400px]"
            :slug="String(route.params.slug)"
            :seasons="seasonsChronological.map(season => season.number)"
            :reached-season="reachedSeasonNumber"
            :reached-episode="reachedEpisode"
            :initial-catalog="progressEpisodeCatalog"
            :mode="trackingMode"
            :spoiler-shield-enabled="spoilerShieldEnabled"
            :spoiler-shield-saving="spoilerShieldSaving"
            @toggle-spoiler-shield="toggleSpoilerShield"
            :show-name="showData.name"
            @start="startTracking"
            @mark="markEpisodeSeen"
            @discuss="openEpisodeDiscussion"
            @reset="resetProgress"
            :saved="!!libraryEntry"
            @save="saveToLibrary"
            @unsave="removeFromLibrary"
          />
        </div>
      </section>

      <section id="recaps" class="border-b border-white/10 py-8 sm:py-10">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
            <div>
              <h2 class="text-2xl font-bold">{{ t('Recaps') }}</h2>
            </div>
            <DropdownMenu v-if="recapLocaleOptions.length > 1">
              <DropdownMenuTrigger
                :aria-label="t('Recap language: {language}', { language: recapLocaleNames[selectedRecapLocale] })"
                :title="recapLocaleNames[selectedRecapLocale]"
                class="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-lg leading-none transition-colors hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary/40 data-[state=open]:bg-primary/15"
              >
                <span aria-hidden="true">{{ recapLocaleFlags[selectedRecapLocale] }}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" :side-offset="8" class="w-48 rounded-2xl border-white/10 bg-background/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
                <DropdownMenuLabel class="px-2.5 pb-1.5 pt-1 text-xs font-medium text-white/45">{{ t('Recap language') }}</DropdownMenuLabel>
                <DropdownMenuItem
                  v-for="option in recapLocaleOptions"
                  :key="option"
                  class="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm focus:bg-white/10"
                  :class="option === selectedRecapLocale ? 'text-primary' : 'text-white/85'"
                  @select="selectedRecapLocale = option"
                >
                  <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-base leading-none" aria-hidden="true">{{ recapLocaleFlags[option] }}</span>
                  <span class="min-w-0 flex-1 font-semibold" :lang="option">{{ recapLocaleNames[option] }}</span>
                  <CheckIcon v-if="option === selectedRecapLocale" class="h-4 w-4 shrink-0" aria-hidden="true" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <!-- A scroller clips both axes: its top padding, taken back by a negative margin, leaves room for the ring halo, wider on hover. -->
          <div
            v-if="sortedSeasons.length"
            class="-mx-5 -mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 pt-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:mt-0 sm:flex-wrap sm:gap-x-4 sm:gap-y-5 sm:overflow-visible sm:px-0 sm:pb-0 sm:pt-0"
          >
            <SeasonStory
              v-for="(season, index) in sortedSeasons"
              :key="season.id"
              class="snap-start"
              :season="withRecapsInLocale(season)"
              :is-admin="isAdmin"
              :is-generating="recapGenerationOf(season.id)?.pending ?? false"
              :generation-progress="recapGenerationOf(season.id)?.progress ?? 0"
              :generation-label="recapGenerationOf(season.id)?.label"
              :generation-error="recapGenerationOf(season.id)?.error ?? null"
              :is-latest="index === 0"
              :spoiler-locked="!isRecapUnlocked(season.number)"
              @view="goToRecap"
              @edit="goToRecapEditor(showData.id, season.id, $event)"
              @create="goToRecapEditor(showData.id, season.id)"
              @generate="generateRecap"
            />
          </div>
          <p v-else class="text-sm text-muted-foreground">{{ t('No released seasons are available.') }}</p>
        </div>
      </section>

      <section id="characters" class="border-b border-white/10 py-10 sm:py-16">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="flex flex-wrap items-baseline justify-between gap-4">
            <h2 class="text-2xl font-bold sm:text-3xl">{{ t('Characters') }}</h2>
            <button
              v-if="knownCharacterProfiles.length > CHARACTER_PREVIEW_COUNT"
              type="button"
              class="text-sm font-medium text-white/80 transition-colors hover:text-white"
              :aria-expanded="areCharactersExpanded"
              @click="areCharactersExpanded = !areCharactersExpanded"
            >
              {{ areCharactersExpanded ? t('Show less') : t('View all {count} characters', { count: knownCharacterProfiles.length }) }}
            </button>
          </div>
          <div v-if="hubsPending" class="grid min-h-28 place-items-center">
            <SpinLoader class="h-6 w-6" />
          </div>
          <template v-else-if="knownCharacterProfiles.length">
            <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CharacterProfileCard
                v-for="profile in displayedCharacterProfiles"
                :key="normalizeCharacterName(profile.name)"
                :profile="profile"
                @select="focusCharacterTimeline(profile)"
              />
            </div>
            <p v-if="hasTvMazeDirectoryProfiles" class="mt-3 text-[9px] text-muted-foreground">
              {{ t('Portraits and cast enriched by') }}
              <a href="https://www.tvmaze.com/api#licensing" target="_blank" rel="noopener noreferrer" class="hover:text-primary hover:underline">TVMaze (CC BY-SA)</a>.
            </p>
          </template>
          <p v-else class="mt-4 text-sm text-muted-foreground">{{ t('No known characters yet.') }}</p>
        </div>
      </section>

      <section id="universe" class="border-b border-white/10 py-10 sm:py-16">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <h2 class="text-2xl font-bold sm:text-3xl">{{ t('World') }}</h2>
          <p class="mt-2 text-sm text-muted-foreground">{{ progressScopeLabel }}</p>
          <div class="mt-6 grid gap-3 sm:gap-4 md:grid-cols-3">
            <div
              v-for="item in universeItems"
              :key="item.title"
              class="flex flex-col gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 sm:gap-3 sm:p-6"
            >
              <component :is="item.icon" class="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <h3 class="flex items-center justify-between gap-2 text-base font-semibold">
                {{ item.title }}
                <span class="text-xs font-medium text-muted-foreground">{{ t('Soon') }}</span>
              </h3>
              <p class="text-sm leading-6 text-muted-foreground">{{ item.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="discussion" class="scroll-mt-16 border-b border-white/10 py-10 sm:py-16">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-2xl font-bold sm:text-3xl">{{ t('Discussion') }}</h2>
              <p class="mt-2 text-sm text-muted-foreground">{{ t('With people who are at the same point as you') }}</p>
            </div>
            <div class="flex gap-1.5" role="group" :aria-label="t('Discussion type')">
              <button
                v-for="tab in discussionTabs"
                :key="tab.id"
                type="button"
                class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                :class="discussionTab === tab.id ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.025] text-muted-foreground hover:border-white/20 hover:text-white'"
                :aria-pressed="discussionTab === tab.id"
                @click="discussionTab = tab.id"
              >
                {{ tab.label }}
              </button>
            </div>
          </div>
          <div class="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center sm:p-10">
            <MessagesSquareIcon class="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <template v-if="discussionTab === 'theories'">
              <h3 class="mt-4 font-semibold">{{ t('No theories yet') }}</h3>
              <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{{ t('Each theory will list the episodes it is based on. You will only see theories based on episodes you have already watched.') }}</p>
            </template>
            <template v-else>
              <h3 class="mt-4 font-semibold">{{ t('No comments on episode {number}', { number: activeDiscussionEpisode?.episode ?? '' }) }}</h3>
              <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{{ t('Only people who have watched this episode can read and write here. Discuss only what happened up to S{season}E{episode}.', { season: activeDiscussionEpisode?.season ?? '', episode: activeDiscussionEpisode?.episode ?? '' }) }}</p>
            </template>
            <Button type="button" class="mt-5 rounded-full" disabled>{{ t('Coming soon') }}</Button>
          </div>
        </div>
      </section>

      <section id="timeline" class="scroll-mt-16 border-b border-white/10 py-6 sm:py-10">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 px-6 py-5">
            <div>
              <h2 class="text-base font-semibold">{{ t('Timeline') }}</h2>
              <p class="mt-1 text-[13px] text-muted-foreground">{{ timelineSummary }}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="rounded-full"
              :aria-expanded="isTimelineOpen"
              aria-controls="timeline-content"
              @click="isTimelineOpen = !isTimelineOpen"
            >
              {{ isTimelineOpen ? t('Close the timeline') : t('Open the timeline') }}
              <ChevronDownIcon class="ml-2 h-4 w-4 transition-transform" :class="isTimelineOpen ? 'rotate-180' : ''" />
            </Button>
          </div>
          <div v-if="isTimelineOpen" id="timeline-content" class="mt-10">
            <div class="mb-8 flex justify-end">
            <div
              v-if="timelineFilterSeasons.length > 1 || timelineCharacterFilter"
              class="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              :aria-label="t('Timeline filters')"
            >
              <button
                v-if="timelineFilterSeasons.length > 1"
                type="button"
                class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                :class="timelineSeasonFilter === 'all' ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.025] text-muted-foreground hover:border-white/20 hover:text-white'"
                :aria-pressed="timelineSeasonFilter === 'all'"
                @click="timelineSeasonFilter = 'all'"
              >
                {{ t('All seasons') }}
              </button>
              <template v-if="timelineFilterSeasons.length > 1">
                <button
                  v-for="seasonNumber in timelineFilterSeasons"
                  :key="seasonNumber"
                  type="button"
                  class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  :class="timelineSeasonFilter === seasonNumber ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.025] text-muted-foreground hover:border-white/20 hover:text-white'"
                  :aria-pressed="timelineSeasonFilter === seasonNumber"
                  @click="timelineSeasonFilter = seasonNumber"
                >
                  S{{ seasonNumber }}
                </button>
              </template>
              <button
                v-if="timelineCharacterFilter"
                type="button"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                :aria-label="t('Remove the {name} filter', { name: timelineCharacterFilter })"
                @click="timelineCharacterFilter = null"
              >
                {{ timelineCharacterFilter }}
                <XIcon class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            </div>
          <div v-if="hubsPending" class="grid min-h-48 place-items-center"><SpinLoader class="h-7 w-7" /></div>
          <div v-else-if="filteredTimelineEvents.length" class="mx-auto max-w-5xl">
            <div id="timeline-event-list">
              <section
                v-for="(group, groupIndex) in displayedTimelineGroups"
                :key="group.key"
                class="grid grid-cols-[52px_1fr] gap-4"
                :aria-label="t('Season {season}, episode {episode}', { season: group.seasonNumber, episode: group.episodeNumber })"
              >
                <div class="flex flex-col items-center">
                  <div class="grid h-11 w-11 place-items-center rounded-full border border-primary/40 bg-primary/10 text-[11px] font-bold text-primary">S{{ group.seasonNumber }}E{{ group.episodeNumber }}</div>
                  <div v-if="groupIndex < displayedTimelineGroups.length - 1" class="my-2 w-px flex-1 bg-gradient-to-b from-primary/40 to-white/10" />
                </div>
                <div class="mb-8 min-w-0">
                  <h3 class="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
                    <span>{{ t('Episode {number}', { number: group.episodeNumber }) }}</span>
                    <span v-if="group.title" class="font-normal text-muted-foreground">· {{ group.title }}</span>
                    <span class="text-xs font-normal text-muted-foreground">{{ group.events.length > 1 ? t('{count} scenes', { count: group.events.length }) : t('{count} scene', { count: group.events.length }) }}</span>
                  </h3>
                  <div class="mt-3 space-y-4">
                    <Card v-for="item in group.events" :key="`${item.seasonNumber}-${item.id}`" class="border-white/10">
                      <CardHeader>
                        <div class="flex items-start justify-between gap-4">
                          <div class="min-w-0">
                            <div v-if="item.location || item.arc || item.importance === 'critical' || item.episodeNumbers.length > 1" class="mb-2 flex flex-wrap gap-2">
                              <Badge v-if="item.location" variant="outline" class="gap-1">
                                <MapPinIcon class="h-3 w-3" aria-hidden="true" />
                                {{ item.location }}
                              </Badge>
                              <Badge v-if="item.episodeNumbers.length > 1" variant="outline">{{ t('Episodes {numbers}', { numbers: item.episodeNumbers.join(', ') }) }}</Badge>
                              <Badge v-if="item.arc" variant="secondary">{{ item.arc }}</Badge>
                              <Badge v-if="item.importance === 'critical'" class="bg-amber-500/15 text-amber-300 hover:bg-amber-500/15">{{ t('Critical') }}</Badge>
                            </div>
                            <CardTitle class="text-xl">{{ item.title }}</CardTitle>
                          </div>
                          <Button variant="ghost" size="icon" :title="t('Suggest a correction')" @click="openCorrection(item.seasonNumber, 'event', item.id, 'description', item.description, Math.max(...item.episodeNumbers), item.throughEpisode)">
                            <SquarePenIcon class="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p
                          class="leading-7 text-white/75"
                          :class="timelineHasMoreEvents && !isTimelineExpanded ? 'line-clamp-2' : ''"
                        >
                          {{ item.description }}
                        </p>
                        <p
                          v-if="item.detail && (isTimelineExpanded || !timelineHasMoreEvents)"
                          class="mt-3 border-l-2 border-primary/50 pl-3 text-sm italic leading-6 text-white/70"
                        >
                          {{ item.detail }}
                        </p>
                        <div
                          v-if="item.characters.length && (isTimelineExpanded || !timelineHasMoreEvents)"
                          class="mt-4 flex flex-wrap gap-2"
                        >
                          <TimelineCharacterChip
                            v-for="character in item.characters"
                            :key="character"
                            :name="character"
                            :profile="timelineCharacterProfile(character)"
                          />
                        </div>
                        <details
                          v-if="item.sources.length && (isTimelineExpanded || !timelineHasMoreEvents)"
                          class="mt-5 text-xs text-muted-foreground"
                        >
                          <summary class="cursor-pointer hover:text-white">{{ item.sources.length > 1 ? t('{count} verifiable sources', { count: item.sources.length }) : t('{count} verifiable source', { count: item.sources.length }) }}</summary>
                          <ul class="mt-2 space-y-1 pl-4">
                            <li v-for="source in item.sources" :key="source.id">
                              <a v-if="source.sourceUrl" :href="source.sourceUrl" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">{{ source.label }}</a>
                              <span v-else>{{ source.label }}</span>
                              <span v-if="source.licenseName"> · {{ source.licenseName }}</span>
                            </li>
                          </ul>
                        </details>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </section>
            </div>

            <div
              v-if="timelineHasMoreEvents"
              class="relative flex justify-center"
              :class="isTimelineExpanded ? 'mt-2' : '-mt-10 pt-16'"
            >
              <div
                v-if="!isTimelineExpanded"
                class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-background/85 to-background"
                aria-hidden="true"
              />
              <Button
                type="button"
                variant="outline"
                class="relative z-10 rounded-full border-white/15 bg-background/95 px-5 shadow-xl shadow-black/20 hover:border-primary/40 hover:bg-background"
                :aria-expanded="isTimelineExpanded"
                aria-controls="timeline-event-list"
                @click="isTimelineExpanded = !isTimelineExpanded"
              >
                {{ isTimelineExpanded ? t('Show less') : t('View the full timeline · {count} scenes', { count: filteredTimelineEvents.length }) }}
                <ChevronDownIcon class="ml-2 h-4 w-4 transition-transform" :class="isTimelineExpanded ? 'rotate-180' : ''" />
              </Button>
            </div>
          </div>
          <div v-else class="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
            <LockIcon class="mx-auto h-7 w-7 text-muted-foreground" />
            <h3 class="mt-4 font-semibold">{{ t('The timeline is protected') }}</h3>
            <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{{ t('Set your progress to see all the events you have watched, without revealing what comes next.') }}</p>
          </div>
          </div>
        </div>
      </section>

      <section id="community" class="py-10 sm:py-16">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="mb-8"><h2 class="text-2xl font-bold sm:text-3xl">{{ t('Community corrections') }}</h2><p class="mt-2 text-sm text-muted-foreground">{{ t('Visible suggestions also respect your spoiler limit.') }}</p></div>
          <div v-if="visibleCorrections.length" class="grid gap-5 md:grid-cols-2">
            <Card v-for="correction in visibleCorrections" :key="correction.id" class="border-white/10">
              <CardHeader><div class="flex justify-between gap-3"><Badge variant="outline">{{ t('Season {number}', { number: correction.seasonNumber }) }} · {{ correctionFieldLabel(correction.field) }}</Badge><span class="text-xs text-muted-foreground">{{ t('Score {score}', { score: correction.score }) }}</span></div></CardHeader>
              <CardContent>
                <div class="grid gap-3 sm:grid-cols-2"><div class="rounded-lg bg-red-500/5 p-3"><span class="text-xs text-muted-foreground">{{ t('Current') }}</span><p class="mt-1 text-sm">{{ correction.currentValue }}</p></div><div class="rounded-lg bg-emerald-500/10 p-3"><span class="text-xs text-muted-foreground">{{ t('Suggested') }}</span><p class="mt-1 text-sm">{{ correction.proposedValue }}</p></div></div>
                <p class="mt-4 text-sm leading-6 text-muted-foreground">{{ correction.reason }}</p>
                <div class="mt-4 flex gap-2"><Button size="sm" :variant="correction.userVote === 1 ? 'default' : 'outline'" @click="vote(correction.id, 1, correction.throughEpisode)"><ThumbsUpIcon class="mr-1 h-4 w-4" />{{ correction.score }}</Button><Button size="sm" :variant="correction.userVote === -1 ? 'destructive' : 'outline'" @click="vote(correction.id, -1, correction.throughEpisode)"><ThumbsDownIcon class="h-4 w-4" /></Button></div>
              </CardContent>
            </Card>
          </div>
          <p v-else class="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-muted-foreground">{{ t('No pending corrections for episodes you have watched.') }}</p>
        </div>
      </section>
    </main>

    <div v-else-if="showPending" class="grid min-h-[70vh] place-items-center"><SpinLoader class="h-8 w-8" /></div>
    <div v-else class="grid min-h-[70vh] place-items-center px-5 text-center"><div><h1 class="text-2xl font-bold">{{ t('Could not load this show') }}</h1><p class="mt-2 text-muted-foreground">{{ showError?.statusMessage || t('Please try again in a moment.') }}</p><Button class="mt-5" @click="refreshShow">{{ t('Retry') }}</Button></div></div>

    <Dialog v-model:open="correctionOpen">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader><DialogTitle>{{ t('Suggest a correction') }}</DialogTitle><DialogDescription>{{ t('The suggestion will be voted on and reviewed by the team before publication.') }}</DialogDescription></DialogHeader>
        <form class="space-y-4" @submit.prevent="submitCorrection">
          <div><label class="mb-1.5 block text-sm font-medium">{{ t('Current information') }}</label><div class="max-h-28 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">{{ correctionForm.currentValue }}</div></div>
          <div><label for="correction-value" class="mb-1.5 block text-sm font-medium">{{ t('Your correction') }}</label><Textarea id="correction-value" v-model="correctionForm.proposedValue" required :maxlength="3000" rows="4" /></div>
          <div><label for="correction-reason" class="mb-1.5 block text-sm font-medium">{{ t('Why?') }}</label><Textarea id="correction-reason" v-model="correctionForm.reason" required minlength="10" maxlength="2000" rows="3" :placeholder="t('Explain the mistake and how to verify it…')" /></div>
          <div><label for="correction-source" class="mb-1.5 block text-sm font-medium">{{ t('Verifiable source') }} <span class="font-normal text-muted-foreground">{{ t('(optional)') }}</span></label><Input id="correction-source" v-model="correctionForm.sourceUrl" type="url" placeholder="https://…" /></div>
          <DialogFooter><Button type="button" variant="outline" @click="correctionOpen = false">{{ t('Cancel') }}</Button><Button type="submit" :disabled="correctionSubmitting">{{ correctionSubmitting ? t('Sending…') : t('Send suggestion') }}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { CalendarIcon, CheckIcon, ChevronDownIcon, LockIcon, MapIcon, MapPinIcon, MessagesSquareIcon, Share2Icon, SquarePenIcon, ThumbsDownIcon, ThumbsUpIcon, UsersIcon, XIcon } from 'lucide-vue-next';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import type { ShowWithSeasons } from '~/types/database.types';
import type { LibraryEntry } from '~/types/library.types';
import type { SeasonHubCorrection, SeasonHubCorrectionTarget, SeasonHubEvent, SeasonHubResponse } from '~/types/season-hub.types';
import type {
  ShowCharacterProfile,
  TimelineCharacterProfile,
} from '~/types/show-character.types';
import { Badge } from '~/components/shadcn/badge';
import { Button } from '~/components/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/shadcn/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '~/components/shadcn/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/shadcn/dialog';
import { Input } from '~/components/shadcn/input';
import { Textarea } from '~/components/shadcn/textarea';
import CharacterProfileCard from '~/components/CharacterProfileCard.vue';
import EpisodeTracker from '~/components/EpisodeTracker.vue';
import SeasonStory from '~/components/SeasonStory.vue';
import TimelineCharacterChip from '~/components/TimelineCharacterChip.vue';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import { proxiedImageUrl } from '~/lib/image-url';
import { recapGenerationKey, useRecapGenerations } from '~/composables/useRecapGenerations';
import { recapLocaleFlags, recapLocaleNames, recapLocales, type RecapLocale } from '~/lib/recap-locales';
import { useStoryViewer } from '~/composables/useStoryViewer';
import { isRegularSeasonReleased } from '~/lib/season-availability';
import { toPlainText } from '~/lib/plain-text';

type TimelineEvent = SeasonHubEvent & { seasonNumber: number; throughEpisode: number };
type TimelineEpisodeGroup = {
  key: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  events: TimelineEvent[];
};
type VisibleCorrection = SeasonHubCorrection & { seasonNumber: number; throughEpisode: number };
type ProgressEpisode = { number: number; title: string; firstAired: string | null };
type TimelineCharacterKnowledge = Pick<
  TimelineCharacterProfile,
  'seasonNumbers' | 'eventCount' | 'lastSeen' | 'arcs' | 'keyEvents'
>;
type TimelineCharacterKnowledgeBuilder = TimelineCharacterKnowledge & {
  seasonNumberSet: Set<number>;
  arcSet: Set<string>;
  keyEventSet: Set<string>;
};

const { t, locale } = useI18n();

const TIMELINE_PREVIEW_EVENT_COUNT = 3;
const CHARACTER_PREVIEW_COUNT = 6;

const route = useRoute();
const router = useRouter();
const user = useSupabaseUser();
const isAdmin = useIsAdmin();
const { data: showData, pending: showPending, error: showError, refresh: refreshShow } = await useAsyncData(
  `show-data-${route.params.slug}`,
  async () => {
    const traktId = String(route.params.slug).split('-').pop();
    if (!traktId) throw new Error(t('Invalid show address.'));
    const response = await $fetch<{ show: ShowWithSeasons | null }>(`/api/shows/${traktId}`);
    return response.show as ShowWithSeasons | null;
  },
);

const sortedSeasons = computed(() => (showData.value?.seasons ?? [])
  .filter(season => isRegularSeasonReleased(season.number, season.first_aired))
  .sort((a, b) => b.number - a.number));
// Provider summaries may carry HTML: always shown as text.
const showSummary = computed(() => toPlainText(showData.value?.summary));
const seasonsChronological = computed(() => [...sortedSeasons.value].reverse());
const firstAired = computed(() => seasonsChronological.value[0]?.first_aired ?? null);
const cast = computed<any[]>(() => (showData.value?._embedded?.cast as any[] | undefined) ?? []);
const mediaCharacterProfiles = computed(() => {
  const profiles = new Map<string, ShowCharacterProfile>();

  for (const profile of showData.value?._embedded?.characterProfiles ?? []) {
    const key = normalizeCharacterName(profile.name);
    if (key) profiles.set(key, profile);
  }

  for (const member of cast.value) {
    const imageUrl = castMemberImage(member);
    const profile: ShowCharacterProfile = {
      name: '',
      imageUrl,
      imageKind: imageUrl ? 'actor' : null,
      imageProvider: imageUrl ? 'trakt' : null,
      actorName: typeof member?.person?.name === 'string' ? member.person.name : null,
      isVoice: false,
      sourceUrl: null,
    };
    for (const characterName of castMemberCharacterNames(member)) {
      const key = normalizeCharacterName(characterName);
      if (key && !profiles.has(key)) profiles.set(key, { ...profile, name: characterName });
    }
  }
  return profiles;
});

const showTraktId = String(route.params.slug).split('-').pop();
const requestFetch = useRequestFetch();
// The library holds the viewer's progress; the server reads it so the page renders at the right episode.
const { data: libraryEntry } = await useAsyncData(
  `library-entry-${user.value?.sub ?? 'guest'}-${route.params.slug}`,
  async () => {
    if (!user.value || !showData.value) return null;
    try {
      return (await requestFetch<{ entry: LibraryEntry | null }>(`/api/library/${showTraktId}`)).entry;
    } catch {
      return null;
    }
  },
);
// Progress from before accounts were required; it moves into the library at the first signed-in visit.
const progressCookie = useCookie<{ season?: number; episode?: number } | null>(
  `synupsis-progress-${route.params.slug}`,
  { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', default: () => null },
);
const progressStorageKey = `synupsis:series-progress:${route.params.slug}`;
const savedProgress = route.query.season != null
  ? { season: route.query.season, episode: route.query.episode }
  : libraryEntry.value?.season ? libraryEntry.value : progressCookie.value;
const requestedSeason = Number(savedProgress?.season ?? 0);
const requestedEpisode = Number(savedProgress?.episode ?? 0);
const reachedSeasonNumber = ref(sortedSeasons.value.some(season => season.number === requestedSeason) ? requestedSeason : 0);
const reachedEpisode = ref(Number.isInteger(requestedEpisode) && requestedEpisode > 0 ? requestedEpisode : 0);
// Until someone tracks the series, all of it is visible.
const trackingMode = computed<'undecided' | 'library' | 'tracking'>(() => {
  if (reachedSeasonNumber.value) return 'tracking';
  return libraryEntry.value ? 'library' : 'undecided';
});
// A per-series account preference, independent of the last episode watched.
const spoilerShieldEnabled = ref(libraryEntry.value?.spoilerShieldEnabled ?? true);
const spoilerShieldSaving = ref(false);

// Each season has one recap per language: every language is offered, so a
// missing one can be generated, with the user's recap languages first.
const { recapLanguages } = useRecapLanguages();
const publishedRecapLocales = computed(() => new Set(sortedSeasons.value.flatMap(season => (season.recap ?? [])
  .filter(recap => recap.status === 'published')
  .map(recap => recap.locale))));
const recapLocaleOptions = computed<RecapLocale[]>(() => [
  ...recapLanguages.value,
  ...recapLocales.filter(locale => !recapLanguages.value.includes(locale)),
]);
const recapLocaleCookie = useCookie<string | null>('synupsis-recap-locale', {
  maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', default: () => null,
});
// Until the reader picks one, the first language with something to read.
const selectedRecapLocale = computed<RecapLocale>({
  get: () => recapLocaleOptions.value.find(locale => locale === recapLocaleCookie.value)
    ?? recapLocaleOptions.value.find(locale => publishedRecapLocales.value.has(locale))
    ?? recapLocaleOptions.value[0]!,
  set: (locale) => { recapLocaleCookie.value = locale; },
});

function withRecapsInLocale<T extends { recap?: Array<{ locale: string }> | null }>(season: T): T {
  return { ...season, recap: (season.recap ?? []).filter(recap => recap.locale === selectedRecapLocale.value) };
}

const { data: seasonHubs, pending: hubsPending, refresh: refreshHubs } = await useAsyncData(
  `series-knowledge-${user.value?.sub ?? 'guest'}-${route.params.slug}`,
  async () => Promise.all(sortedSeasons.value.map(season => $fetch<SeasonHubResponse>(
    `/api/shows/${route.params.slug}/seasons/${season.number}`,
    { query: { throughEpisode: cursorForSeason(season.number), locale: selectedRecapLocale.value } },
  ))),
  { watch: [reachedSeasonNumber, reachedEpisode, spoilerShieldEnabled, selectedRecapLocale] },
);

function cursorForSeason(seasonNumber: number) {
  if (!spoilerShieldEnabled.value || !reachedSeasonNumber.value) return 999;
  if (seasonNumber < reachedSeasonNumber.value) return 999;
  if (seasonNumber === reachedSeasonNumber.value) return reachedEpisode.value;
  return 0;
}

// Old responses can contain future character arcs and corrections as well as
// scenes. Hide whole out-of-scope hubs immediately, even if the refresh fails.
const visibleSeasonHubs = computed(() => (seasonHubs.value ?? [])
  .filter(hub => hub.progress.throughEpisode <= cursorForSeason(hub.season.number)));
const currentSeasonHub = computed(() => visibleSeasonHubs.value.find(hub => hub.season.number === reachedSeasonNumber.value) ?? null);
const {
  data: progressEpisodeCatalog,
} = await useAsyncData(
  `series-progress-episodes-${route.params.slug}`,
  async () => {
    // Without progress, the first season: the episode tracker starts there.
    const seasonNumber = reachedSeasonNumber.value || seasonsChronological.value[0]?.number;
    if (!seasonNumber) return { seasonNumber: 0, episodes: [] as ProgressEpisode[], totalEpisodes: 0 };
    return $fetch<{ seasonNumber: number; episodes: ProgressEpisode[]; totalEpisodes: number }>(
      `/api/shows/${route.params.slug}/seasons/${seasonNumber}/episodes`,
    );
  },
  { watch: [reachedSeasonNumber] },
);
const progressEpisodeOptions = computed<ProgressEpisode[]>(() => {
  if (progressEpisodeCatalog.value?.seasonNumber === reachedSeasonNumber.value && progressEpisodeCatalog.value.episodes.length) {
    return progressEpisodeCatalog.value.episodes;
  }
  const fallbackTotal = currentSeasonHub.value?.progress.totalEpisodes ?? 0;
  return Array.from({ length: fallbackTotal }, (_, index) => ({
    number: index + 1,
    title: '',
    firstAired: null,
  }));
});
const progressEpisodeTotal = computed(() => progressEpisodeOptions.value.reduce(
  (maximum, episode) => Math.max(maximum, episode.number),
  0,
));
const timelineEvents = computed<TimelineEvent[]>(() => visibleSeasonHubs.value
  .flatMap(hub => hub.events.map(event => ({ ...event, seasonNumber: hub.season.number, throughEpisode: hub.progress.throughEpisode })))
  .sort((a, b) => a.seasonNumber - b.seasonNumber
    || Math.max(...a.episodeNumbers) - Math.max(...b.episodeNumbers)
    || (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0)));
const timelineEpisodeTitles = computed(() => new Map<string, string>(visibleSeasonHubs.value
  .flatMap(hub => hub.episodes.map(episode => [`${hub.season.number}-${episode.number}`, episode.title]))));
const timelineCharacterKnowledge = computed(() => {
  const builders = new Map<string, TimelineCharacterKnowledgeBuilder>();

  for (const hub of visibleSeasonHubs.value) {
    for (const character of hub.characters) {
      const key = normalizeCharacterName(character.name);
      if (!key) continue;

      const builder = builders.get(key) ?? {
        seasonNumbers: [],
        eventCount: 0,
        lastSeen: null,
        arcs: [],
        keyEvents: [],
        seasonNumberSet: new Set<number>(),
        arcSet: new Set<string>(),
        keyEventSet: new Set<string>(),
      };
      builder.eventCount += character.eventCount;
      builder.seasonNumberSet.add(hub.season.number);

      const lastSeen = {
        seasonNumber: hub.season.number,
        episodeNumber: character.lastSeenEpisode,
      };
      if (!builder.lastSeen
        || lastSeen.seasonNumber > builder.lastSeen.seasonNumber
        || (lastSeen.seasonNumber === builder.lastSeen.seasonNumber
          && lastSeen.episodeNumber > builder.lastSeen.episodeNumber)) {
        builder.lastSeen = lastSeen;
      }

      for (const arc of character.arcs) builder.arcSet.add(arc);
      for (const event of character.keyEvents) {
        const eventKey = `${hub.season.number}:${event.id}`;
        if (builder.keyEventSet.has(eventKey)) continue;
        builder.keyEventSet.add(eventKey);
        builder.keyEvents.push({
          id: event.id,
          title: event.title,
          seasonNumber: hub.season.number,
          episodeNumber: event.episode,
        });
      }
      builders.set(key, builder);
    }
  }

  return new Map([...builders.entries()].map(([key, builder]) => [
    key,
    {
      seasonNumbers: [...builder.seasonNumberSet].sort((a, b) => a - b),
      eventCount: builder.eventCount,
      lastSeen: builder.lastSeen,
      arcs: [...builder.arcSet],
      keyEvents: builder.keyEvents
        .sort((a, b) => b.seasonNumber - a.seasonNumber || b.episodeNumber - a.episodeNumber)
        .slice(0, 3),
    } satisfies TimelineCharacterKnowledge,
  ]));
});
const timelineSeasonFilter = ref<number | 'all'>('all');
const timelineCharacterFilter = ref<string | null>(null);
const isTimelineExpanded = ref(false);
const isTimelineOpen = ref(false);
const timelineFilterSeasons = computed(() => [...new Set(timelineEvents.value.map(event => event.seasonNumber))]
  .sort((a, b) => a - b));
const seasonFilteredTimelineEvents = computed(() => timelineSeasonFilter.value === 'all'
  ? timelineEvents.value
  : timelineEvents.value.filter(event => event.seasonNumber === timelineSeasonFilter.value));
const filteredTimelineEvents = computed(() => {
  if (!timelineCharacterFilter.value) return seasonFilteredTimelineEvents.value;
  return seasonFilteredTimelineEvents.value.filter(event => event.characters
    .some(character => characterNamesMatch(character, timelineCharacterFilter.value ?? '')));
});
const timelineHasMoreEvents = computed(() => filteredTimelineEvents.value.length > TIMELINE_PREVIEW_EVENT_COUNT);
const displayedTimelineEvents = computed(() => isTimelineExpanded.value || !timelineHasMoreEvents.value
  ? filteredTimelineEvents.value
  : filteredTimelineEvents.value.slice(-TIMELINE_PREVIEW_EVENT_COUNT));
// Scenes of one episode stay together under a single episode marker.
const displayedTimelineGroups = computed<TimelineEpisodeGroup[]>(() => {
  const groups: TimelineEpisodeGroup[] = [];
  for (const event of displayedTimelineEvents.value) {
    const episodeNumber = Math.max(...event.episodeNumbers);
    const key = `${event.seasonNumber}-${episodeNumber}`;
    const currentGroup = groups[groups.length - 1];
    if (currentGroup?.key === key) {
      currentGroup.events.push(event);
    } else {
      groups.push({
        key,
        seasonNumber: event.seasonNumber,
        episodeNumber,
        title: timelineEpisodeTitles.value.get(key) ?? null,
        events: [event],
      });
    }
  }
  return groups;
});
watch(timelineFilterSeasons, (availableSeasons) => {
  if (timelineSeasonFilter.value !== 'all' && !availableSeasons.includes(timelineSeasonFilter.value)) {
    timelineSeasonFilter.value = 'all';
  }
});
const knownCharacterProfiles = computed<TimelineCharacterProfile[]>(() => {
  const profiles = new Map<string, TimelineCharacterProfile>();

  for (const hub of visibleSeasonHubs.value) {
    for (const character of hub.characters) {
      const profile = timelineCharacterProfile(character.name);
      if (!profile) continue;
      const key = normalizeCharacterName(profile.name);
      if (key && !profiles.has(key)) profiles.set(key, profile);
    }
  }

  return [...profiles.values()].sort((a, b) => b.eventCount - a.eventCount
    || a.name.localeCompare(b.name, locale.value));
});
const hasTvMazeDirectoryProfiles = computed(() => knownCharacterProfiles.value
  .some(profile => profile.imageProvider === 'tvmaze'));
watch(knownCharacterProfiles, (profiles) => {
  if (timelineCharacterFilter.value
    && !profiles.some(profile => characterNamesMatch(profile.name, timelineCharacterFilter.value ?? ''))) {
    timelineCharacterFilter.value = null;
  }
});
const areCharactersExpanded = ref(false);
const displayedCharacterProfiles = computed(() => areCharactersExpanded.value
  ? knownCharacterProfiles.value
  : knownCharacterProfiles.value.slice(0, CHARACTER_PREVIEW_COUNT));
const progressScopeLabel = computed(() => {
  if (!spoilerShieldEnabled.value) return t('Spoiler shield off: the entire series is visible, including spoilers.');
  if (!reachedSeasonNumber.value) return t('The entire series is visible. Set your progress to hide what comes next.');
  if (!reachedEpisode.value) return t('Up to the start of season {number}: nothing after this point is shown.', { number: reachedSeasonNumber.value });
  return t('Up to S{season}E{episode}: nothing after this point is shown.', { season: reachedSeasonNumber.value, episode: reachedEpisode.value });
});
const timelineSummary = computed(() => {
  if (hubsPending.value) return t('Loading scenes…');
  const count = timelineEvents.value.length;
  const scope = reachedSeasonNumber.value && reachedEpisode.value && spoilerShieldEnabled.value
    ? t('up to S{season}E{episode}', { season: reachedSeasonNumber.value, episode: reachedEpisode.value })
    : !spoilerShieldEnabled.value ? t('across the entire series') : t('seen so far');
  return count > 1 ? t('{count} scenes {scope}, with their sources', { count, scope }) : t('{count} scene {scope}, with its sources', { count, scope });
});
// Placeholders until these views can be built from sources without invention.
const universeItems = computed(() => [
  { title: t('Family tree'), description: t('Families and their connections, as they are revealed.'), icon: UsersIcon },
  { title: t('Location map'), description: t('Locations from the series and the scenes that take place there.'), icon: MapIcon },
  { title: t('Relationships'), description: t('Who knows what and who lies to whom, episode by episode.'), icon: Share2Icon },
]);
type DiscussionTab = 'theories' | 'episode';
const discussionTab = ref<DiscussionTab>('theories');
const discussionEpisode = ref<{ season: number; episode: number } | null>(null);
const lastSeenEpisode = computed(() => reachedSeasonNumber.value && reachedEpisode.value
  ? { season: reachedSeasonNumber.value, episode: reachedEpisode.value }
  : null);
const activeDiscussionEpisode = computed(() => discussionEpisode.value ?? lastSeenEpisode.value);
const discussionTabs = computed(() => [
  { id: 'theories' as const, label: t('Theories') },
  ...(activeDiscussionEpisode.value
    ? [{ id: 'episode' as const, label: t('Episode {number}', { number: activeDiscussionEpisode.value.episode }) }]
    : []),
]);
watch(lastSeenEpisode, (episode) => {
  if (!episode && discussionTab.value === 'episode' && !discussionEpisode.value) discussionTab.value = 'theories';
});
const visibleCorrections = computed<VisibleCorrection[]>(() => visibleSeasonHubs.value
  .flatMap(hub => hub.corrections.map(correction => ({ ...correction, seasonNumber: hub.season.number, throughEpisode: hub.progress.throughEpisode }))));

function castMemberCharacterNames(member: any): string[] {
  const values = [
    ...(Array.isArray(member?.characters) ? member.characters : []),
    member?.character,
  ];
  return values.flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (value && typeof value.name === 'string') return [value.name];
    return [];
  });
}

function castMemberImage(member: any): string | null {
  const candidates = [
    member?.images?.headshot?.[0],
    member?.person?.images?.headshot?.[0],
    member?.person?.images?.headshot?.full,
    member?.person?.images?.headshot?.medium,
    member?.person?.image?.medium,
    member?.person?.image?.original,
  ];
  const image = candidates.find(candidate => typeof candidate === 'string' && candidate.length > 0);
  if (!image) return null;
  if (/^https?:\/\//i.test(image)) return image;
  return `https://${image.replace(/^\/\//, '')}`;
}

function normalizeCharacterName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function characterNamesMatch(firstName: string, secondName: string) {
  const firstKey = normalizeCharacterName(firstName);
  const secondKey = normalizeCharacterName(secondName);
  return Boolean(firstKey && secondKey
    && (firstKey === secondKey || firstKey.includes(secondKey) || secondKey.includes(firstKey)));
}

function focusCharacterTimeline(profile: TimelineCharacterProfile) {
  timelineCharacterFilter.value = profile.name;
  timelineSeasonFilter.value = 'all';
  isTimelineOpen.value = true;
  isTimelineExpanded.value = true;
  nextTick(() => {
    document.getElementById('timeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function findCharacterMatch<T>(profiles: Map<string, T>, key: string): T | null {
  const exactMatch = profiles.get(key);
  if (exactMatch) return exactMatch;

  const partialMatches = [...profiles.entries()]
    .filter(([profileName]) => profileName.includes(key) || key.includes(profileName));
  return partialMatches.length === 1 ? partialMatches.at(0)?.[1] ?? null : null;
}

function timelineCharacterProfile(characterName: string): TimelineCharacterProfile | null {
  const key = normalizeCharacterName(characterName);
  if (!key) return null;
  const media = findCharacterMatch(mediaCharacterProfiles.value, key);
  const knowledge = findCharacterMatch(timelineCharacterKnowledge.value, key);
  if (!media && !knowledge) return null;

  return {
    name: media?.name ?? characterName,
    imageUrl: media?.imageUrl ?? null,
    imageKind: media?.imageKind ?? null,
    imageProvider: media?.imageProvider ?? null,
    actorName: media?.actorName ?? null,
    isVoice: media?.isVoice ?? false,
    sourceUrl: media?.sourceUrl ?? null,
    seasonNumbers: knowledge?.seasonNumbers ?? [],
    eventCount: knowledge?.eventCount ?? 0,
    lastSeen: knowledge?.lastSeen ?? null,
    arcs: knowledge?.arcs ?? [],
    keyEvents: knowledge?.keyEvents ?? [],
  };
}

watch(progressEpisodeTotal, (totalEpisodes) => {
  if (!import.meta.client || !totalEpisodes || reachedEpisode.value <= totalEpisodes) return;
  reachedEpisode.value = totalEpisodes;
  persistProgress();
});

// Progress kept in the browser before accounts were required: shown as it was,
// and moved into the library once the viewer signs in.
onMounted(() => {
  if (route.query.season == null && !progressCookie.value) {
    try {
      const saved = JSON.parse(localStorage.getItem(progressStorageKey) || '{}');
      const hasSavedSeason = sortedSeasons.value.some(season => season.number === Number(saved.season));
      if (hasSavedSeason && saved.enabled !== false && !libraryEntry.value) {
        reachedSeasonNumber.value = Number(saved.season);
        reachedEpisode.value = Number.isInteger(Number(saved.episode)) ? Math.max(0, Number(saved.episode)) : 0;
      }
    } catch {
      // A malformed local preference simply falls back to the spoiler-safe state.
    }
  }
  if (!user.value) return;
  const hasLegacyProgress = progressCookie.value || localStorage.getItem(progressStorageKey);
  if (hasLegacyProgress && route.query.season == null && !libraryEntry.value && reachedSeasonNumber.value) persistProgress();
  progressCookie.value = null;
  localStorage.removeItem(progressStorageKey);
});

// Saving and tracking need an account: the viewer comes back to this page once signed in.
function requireAccount() {
  if (user.value) return true;
  navigateTo({ path: '/login', query: { redirect: route.fullPath } });
  return false;
}

function resetProgress() {
  if (!user.value) {
    progressCookie.value = null;
    localStorage.removeItem(progressStorageKey);
  }
  reachedSeasonNumber.value = 0;
  reachedEpisode.value = 0;
  discussionEpisode.value = null;
  persistProgress();
}

function startTracking() {
  markEpisodeSeen({ season: seasonsChronological.value[0]?.number ?? 1, episode: 0 });
}

function markEpisodeSeen(position: { season: number; episode: number }) {
  if (!requireAccount()) return;
  reachedSeasonNumber.value = position.season;
  reachedEpisode.value = Math.max(0, position.episode);
  discussionEpisode.value = null;
  persistProgress();
}

function saveToLibrary() {
  if (!requireAccount()) return;
  persistProgress();
  toast.success(t('Added to your library'), {
    action: { label: t('View'), onClick: () => navigateTo('/library') },
  });
}

async function removeFromLibrary() {
  // Let an in-flight preference save settle before taking the rollback state.
  if (spoilerShieldSaving.value) await librarySync;
  const operation = ++libraryOperation;
  const previousShield = spoilerShieldEnabled.value;
  const previousSeason = reachedSeasonNumber.value;
  const previousEpisode = reachedEpisode.value;
  const previousDiscussion = discussionEpisode.value;
  spoilerShieldEnabled.value = true;
  reachedSeasonNumber.value = 0;
  reachedEpisode.value = 0;
  discussionEpisode.value = null;
  const previous = libraryEntry.value;
  libraryEntry.value = null;
  syncProgressQuery();
  librarySync = librarySync.then(async () => {
    try {
      await $fetch(`/api/library/${showTraktId}`, { method: 'DELETE' });
    } catch {
      if (operation === libraryOperation) {
        libraryEntry.value = previous;
        spoilerShieldEnabled.value = previousShield;
        reachedSeasonNumber.value = previousSeason;
        reachedEpisode.value = previousEpisode;
        discussionEpisode.value = previousDiscussion;
        syncProgressQuery();
      }
      toast.error(t('Could not update your library.'));
    }
  });
  await librarySync;
}

function openEpisodeDiscussion(position: { season: number; episode: number }) {
  discussionEpisode.value = position;
  discussionTab.value = 'episode';
  nextTick(() => {
    document.getElementById('discussion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function isRecapUnlocked(seasonNumber: number) {
  if (!spoilerShieldEnabled.value || !reachedSeasonNumber.value) return true;
  if (seasonNumber < reachedSeasonNumber.value) return true;
  if (seasonNumber > reachedSeasonNumber.value) return false;
  return progressEpisodeTotal.value > 0 && reachedEpisode.value >= progressEpisodeTotal.value;
}

function syncProgressQuery() {
  router.replace({ query: {
    ...route.query,
    season: reachedSeasonNumber.value || undefined,
    episode: reachedEpisode.value || undefined,
  } });
}

// Saves run one after the other, so quick clicks reach the library in order.
let librarySync = Promise.resolve();
let libraryOperation = 0;

async function toggleSpoilerShield() {
  if (spoilerShieldSaving.value || !requireAccount()) return;
  const previous = spoilerShieldEnabled.value;
  spoilerShieldEnabled.value = !previous;
  spoilerShieldSaving.value = true;
  const saving = persistProgress(true);
  try {
    if (!await saving) {
      // Progress may have changed while saving; only roll back the preference.
      spoilerShieldEnabled.value = previous;
      if (libraryEntry.value) libraryEntry.value.spoilerShieldEnabled = previous;
    }
  } finally {
    spoilerShieldSaving.value = false;
  }
}

function persistProgress(updateSpoilerShield = false): Promise<boolean> {
  syncProgressQuery();
  if (!user.value) return Promise.resolve(false);
  const operation = ++libraryOperation;
  const body = {
    slug: String(route.params.slug),
    season: reachedSeasonNumber.value || null,
    episode: reachedEpisode.value,
    // Ordinary progress updates leave the stored shield untouched, including
    // updates queued while a shield save is pending or has failed.
    ...(updateSpoilerShield ? { spoilerShieldEnabled: spoilerShieldEnabled.value } : {}),
  };
  // The card follows at once; the saved row replaces it when it comes back.
  libraryEntry.value = { ...body, spoilerShieldEnabled: spoilerShieldEnabled.value, updatedAt: new Date().toISOString() };
  const saving = librarySync.then(async () => {
    try {
      const response = await $fetch<{ entry: LibraryEntry }>(`/api/library/${showTraktId}`, { method: 'PUT', body });
      if (operation === libraryOperation) libraryEntry.value = response.entry;
      return true;
    } catch {
      toast.error(updateSpoilerShield ? t('Could not save your spoiler shield setting.') : t('Could not save your library.'));
      return false;
    }
  });
  librarySync = saving.then(() => {});
  return saving;
}

const { generations: recapGenerations, start: startRecapGeneration } = useRecapGenerations({
  showId: () => showData.value?.id,
  async onCompleted(_seasonId, recapId) {
    await Promise.all([refreshShow(), refreshHubs()]);
    // Several seasons may be generating: offer the recap instead of leaving the page.
    toast.success(t('The recap is ready.'), recapId
      ? { action: { label: t('View'), onClick: () => goToRecap(recapId) } }
      : undefined);
  },
  onFailed(_seasonId, message) {
    toast.error(t('Could not generate this recap.'), { description: t(message) });
  },
});

async function generateRecap(seasonId: string) {
  if (!user.value) {
    toast.info(t('Sign in to request this recap.'));
    await navigateTo('/login');
    return;
  }
  await startRecapGeneration(seasonId, selectedRecapLocale.value);
}

function recapGenerationOf(seasonId: string) {
  return recapGenerations.value[recapGenerationKey(seasonId, selectedRecapLocale.value)];
}

function goToRecapEditor(show?: string, season?: string, recap?: string) {
  navigateTo({ path: '/recap-editor', query: { show, season, ...(recap ? { recap } : {}) } });
}
const { openStory } = useStoryViewer();
function goToRecap(recapId: string) { openStory(recapId); }

const correctionOpen = ref(false);
const correctionSubmitting = ref(false);
const correctionForm = reactive({
  seasonNumber: 0, targetType: 'event' as SeasonHubCorrectionTarget, targetKey: '', field: 'description',
  currentValue: '', proposedValue: '', reason: '', sourceUrl: '', revealEpisode: 0, throughEpisode: 0,
});

async function openCorrection(
  seasonNumber: number,
  targetType: SeasonHubCorrectionTarget,
  targetKey: string,
  field: string,
  currentValue: string,
  revealEpisode: number,
  throughEpisode: number,
) {
  if (!user.value) {
    toast.info(t('Sign in to suggest a correction.'));
    await navigateTo('/login');
    return;
  }
  Object.assign(correctionForm, { seasonNumber, targetType, targetKey, field, currentValue, proposedValue: currentValue, reason: '', sourceUrl: '', revealEpisode, throughEpisode });
  correctionOpen.value = true;
}

function correctionFieldLabel(field: string) {
  const labels: Record<string, string> = {
    description: t('Description'),
    name: t('Name'),
    title: t('Title'),
    status: t('Status'),
    role: t('Role'),
    label: t('Label'),
    detail: t('Details'),
    summary: t('Summary'),
  };
  return labels[field] ?? field;
}

async function submitCorrection() {
  correctionSubmitting.value = true;
  try {
    await $fetch(`/api/shows/${route.params.slug}/seasons/${correctionForm.seasonNumber}/corrections`, {
      method: 'POST', body: correctionForm,
    });
    correctionOpen.value = false;
    toast.success(t('Your correction has been submitted.'));
    await refreshHubs();
  } catch (cause: any) {
    toast.error(t('Could not submit the correction.'), { description: cause.data?.statusMessage || cause.message });
  } finally {
    correctionSubmitting.value = false;
  }
}

async function vote(correctionId: string, value: -1 | 1, throughEpisode: number) {
  if (!user.value) {
    toast.info(t('Sign in to vote.'));
    await navigateTo('/login');
    return;
  }
  try {
    await $fetch(`/api/corrections/${correctionId}/vote`, { method: 'POST', body: { value, throughEpisode } });
    await refreshHubs();
  } catch (cause: any) {
    toast.error(t('Could not save this vote.'), { description: cause.data?.statusMessage || cause.message });
  }
}

useHead(() => {
  const description = showSummary.value.slice(0, 155) || t('Spoiler-free show recaps and information.');
  return {
    title: showData.value ? `${showData.value.name} — Synupsis` : t('Show — Synupsis'),
    meta: [
      { name: 'description', content: description },
      { property: 'og:image', content: proxiedImageUrl(showData.value?.image) || '/svg/logo.svg' },
    ],
  };
});
</script>
