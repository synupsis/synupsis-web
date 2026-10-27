<template>
  <div class="min-h-screen bg-background text-foreground">
    <AppHeader
      compact
      contained
      class="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-xl"
    />

    <main v-if="showData">
      <section
        class="relative isolate min-h-[520px] overflow-hidden bg-cover bg-center"
        :style="{ backgroundImage: `url(${useImageUrl(showData.image)})` }"
      >
        <div class="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div class="mx-auto flex min-h-[520px] max-w-7xl items-end px-5 pb-14 pt-24 lg:px-8">
          <div class="max-w-3xl">
            <div class="mb-4 flex flex-wrap gap-2">
              <Badge v-for="genre in showData.genres" :key="genre" variant="secondary">{{ genre }}</Badge>
            </div>
            <h1 class="text-5xl font-black tracking-tight sm:text-7xl">{{ showData.name }}</h1>
            <div v-if="firstAired" class="mt-4 flex items-center gap-2 text-sm text-white/60">
              <CalendarIcon class="h-4 w-4" />{{ new Date(firstAired).getFullYear() }}
            </div>
            <p v-if="showSummary" class="mt-5 max-w-2xl whitespace-pre-line text-base leading-7 text-white/70">{{ showSummary }}</p>
          </div>
        </div>
      </section>

      <section id="spoiler-protection" class="border-b border-white/10 py-4">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2 text-sm font-medium text-white/80">
              <ShieldCheckIcon class="h-4 w-4" :class="reachedSeasonNumber ? 'text-emerald-400' : 'text-muted-foreground'" />
              <span>Bouclier anti-spoiler</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="rounded-full"
              :class="reachedSeasonNumber ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100' : 'border-white/10 text-muted-foreground'"
              @click="spoilerDialogOpen = true"
            >
              {{ progressSummary }}
              <ChevronDownIcon class="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <section id="recaps" class="border-b border-white/10 py-9 sm:py-10">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold">Recaps</h2>
            </div>
          </div>
          <div
            v-if="sortedSeasons.length"
            class="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:gap-x-4 sm:gap-y-5 sm:overflow-visible sm:px-0 sm:pb-0"
          >
            <SeasonStory
              v-for="(season, index) in sortedSeasons"
              :key="season.id"
              class="snap-start"
              :season="season"
              :is-admin="isAdmin"
              :is-generating="recapGenerations[season.id]?.pending ?? false"
              :generation-progress="recapGenerations[season.id]?.progress ?? 0"
              :generation-label="recapGenerations[season.id]?.label"
              :generation-error="recapGenerations[season.id]?.error ?? null"
              :is-latest="index === 0"
              :spoiler-locked="!isRecapUnlocked(season.number)"
              @view="goToRecap"
              @edit="goToRecapEditor(showData.id, season.id, $event)"
              @create="goToRecapEditor(showData.id, season.id)"
              @generate="generateRecap"
            />
          </div>
          <p v-else class="text-sm text-muted-foreground">Aucune saison diffusée n’est disponible.</p>
        </div>
      </section>

      <section id="timeline" class="border-b border-white/10 py-16">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-3xl font-bold sm:text-4xl">Timeline</h2>
              <p v-if="timelineHasMoreEvents && !isTimelineExpanded" class="mt-2 text-sm text-muted-foreground">
                Les {{ displayedTimelineEvents.length }} scènes les plus récentes
              </p>
            </div>
            <div
              v-if="timelineFilterSeasons.length > 1 || timelineCharacterFilter"
              class="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Filtres de la timeline"
            >
              <button
                v-if="timelineFilterSeasons.length > 1"
                type="button"
                class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                :class="timelineSeasonFilter === 'all' ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 bg-white/[0.025] text-muted-foreground hover:border-white/20 hover:text-white'"
                :aria-pressed="timelineSeasonFilter === 'all'"
                @click="timelineSeasonFilter = 'all'"
              >
                Toutes
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
                :aria-label="`Retirer le filtre ${timelineCharacterFilter}`"
                @click="timelineCharacterFilter = null"
              >
                {{ timelineCharacterFilter }}
                <XMarkIcon class="h-3.5 w-3.5" aria-hidden="true" />
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
                :aria-label="`Saison ${group.seasonNumber}, épisode ${group.episodeNumber}`"
              >
                <div class="flex flex-col items-center">
                  <div class="grid h-11 w-11 place-items-center rounded-full border border-primary/40 bg-primary/10 text-[11px] font-bold text-primary">S{{ group.seasonNumber }}E{{ group.episodeNumber }}</div>
                  <div v-if="groupIndex < displayedTimelineGroups.length - 1" class="my-2 w-px flex-1 bg-gradient-to-b from-primary/40 to-white/10" />
                </div>
                <div class="mb-8 min-w-0">
                  <h3 class="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
                    <span>Épisode {{ group.episodeNumber }}</span>
                    <span v-if="group.title" class="font-normal text-muted-foreground">· {{ group.title }}</span>
                    <span class="text-xs font-normal text-muted-foreground">{{ group.events.length }} scène{{ group.events.length > 1 ? 's' : '' }}</span>
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
                              <Badge v-if="item.episodeNumbers.length > 1" variant="outline">Épisodes {{ item.episodeNumbers.join(', ') }}</Badge>
                              <Badge v-if="item.arc" variant="secondary">{{ item.arc }}</Badge>
                              <Badge v-if="item.importance === 'critical'" class="bg-amber-500/15 text-amber-300 hover:bg-amber-500/15">Décisif</Badge>
                            </div>
                            <CardTitle class="text-xl">{{ item.title }}</CardTitle>
                          </div>
                          <Button variant="ghost" size="icon" title="Proposer une correction" @click="openCorrection(item.seasonNumber, 'event', item.id, 'description', item.description, Math.max(...item.episodeNumbers), item.throughEpisode)">
                            <PencilSquareIcon class="h-4 w-4" />
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
                          <summary class="cursor-pointer hover:text-white">{{ item.sources.length }} source{{ item.sources.length > 1 ? 's' : '' }} vérifiable{{ item.sources.length > 1 ? 's' : '' }}</summary>
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
                {{ isTimelineExpanded ? 'Réduire' : `Voir toute la timeline · ${filteredTimelineEvents.length} scènes` }}
                <ChevronDownIcon class="ml-2 h-4 w-4 transition-transform" :class="isTimelineExpanded ? 'rotate-180' : ''" />
              </Button>
            </div>
          </div>
          <div v-else class="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
            <LockClosedIcon class="mx-auto h-7 w-7 text-muted-foreground" />
            <h3 class="mt-4 font-semibold">La timeline est protégée</h3>
            <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Indiquez où vous en êtes pour afficher tous les événements déjà vus, sans révéler la suite.</p>
          </div>
        </div>
      </section>

      <section id="characters" class="border-b border-white/10 bg-white/[0.015] py-9">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <h2 class="text-2xl font-bold">Personnages</h2>

          <div v-if="hubsPending" class="grid min-h-28 place-items-center">
            <SpinLoader class="h-6 w-6" />
          </div>

          <template v-else-if="knownCharacterProfiles.length">
            <div class="-mx-5 mt-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
              <CharacterDirectoryCard
                v-for="profile in knownCharacterProfiles"
                :key="normalizeCharacterName(profile.name)"
                class="snap-start"
                :profile="profile"
                @select="focusCharacterTimeline(profile)"
              />
            </div>
            <p v-if="hasTvMazeDirectoryProfiles" class="mt-2 text-[9px] text-muted-foreground">
              Portraits et casting enrichis par
              <a href="https://www.tvmaze.com/api#licensing" target="_blank" rel="noopener noreferrer" class="hover:text-primary hover:underline">TVMaze (CC BY-SA)</a>.
            </p>
          </template>

          <p v-else class="mt-4 text-sm text-muted-foreground">Aucun personnage connu pour le moment.</p>
        </div>
      </section>

      <section v-if="visibleArcs.length" id="arcs" class="border-b border-white/10 py-16">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <h2 class="text-3xl font-bold">Intrigues à retenir</h2>
          <p v-if="arcsHaveMoreItems && !isArcsExpanded" class="mt-2 text-sm text-muted-foreground">
            <span class="lg:hidden">Les 2 intrigues les plus récentes</span>
            <span class="hidden lg:inline">Les {{ displayedArcs.length }} intrigues les plus récentes</span>
          </p>
          <div id="arc-list" class="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <Card
              v-for="(arc, index) in displayedArcs"
              :key="`${arc.seasonNumber}-${arc.id}`"
              class="border-white/10"
              :class="!isArcsExpanded && arcsHaveMoreItems && index === 0 ? 'hidden lg:block' : ''"
            >
              <CardHeader>
                <div class="flex items-start justify-between gap-3">
                  <div><Badge variant="outline">Saison {{ arc.seasonNumber }}</Badge><CardTitle class="mt-3 text-lg">{{ arc.name }}</CardTitle></div>
                  <Button variant="ghost" size="icon" title="Proposer une correction" @click="openCorrection(arc.seasonNumber, 'arc', arc.id, 'name', arc.name, arc.lastEpisode, arc.throughEpisode)"><PencilSquareIcon class="h-4 w-4" /></Button>
                </div>
                <CardDescription>{{ arc.eventCount }} développement{{ arc.eventCount > 1 ? 's' : '' }} jusqu’à l’épisode {{ arc.lastEpisode }}</CardDescription>
              </CardHeader>
              <CardContent>
                <p
                  class="text-sm leading-6 text-muted-foreground"
                  :class="arcsHaveMoreItems && !isArcsExpanded ? 'line-clamp-3' : ''"
                >
                  {{ arc.latestDevelopment }}
                </p>
              </CardContent>
            </Card>
          </div>

          <div
            v-if="arcsHaveMoreItems"
            class="relative flex justify-center"
            :class="isArcsExpanded ? 'mt-8' : '-mt-8 pt-14'"
          >
            <div
              v-if="!isArcsExpanded"
              class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-transparent via-background/85 to-background"
              aria-hidden="true"
            />
            <Button
              type="button"
              variant="outline"
              class="relative z-10 rounded-full border-white/15 bg-background/95 px-5 shadow-xl shadow-black/20 hover:border-primary/40 hover:bg-background"
              :aria-expanded="isArcsExpanded"
              aria-controls="arc-list"
              @click="isArcsExpanded = !isArcsExpanded"
            >
              {{ isArcsExpanded ? 'Réduire' : `Voir toutes les intrigues · ${visibleArcs.length}` }}
              <ChevronDownIcon class="ml-2 h-4 w-4 transition-transform" :class="isArcsExpanded ? 'rotate-180' : ''" />
            </Button>
          </div>
        </div>
      </section>

      <section id="universe" class="border-b border-white/10 py-16">
        <div class="mx-auto grid max-w-7xl gap-6 px-5 lg:grid-cols-2 lg:px-8">
          <Card class="border-white/10"><CardHeader><CardTitle>Contexte de la série</CardTitle></CardHeader><CardContent><p class="whitespace-pre-line leading-7 text-white/70">{{ showSummary || 'Le contexte général n’est pas encore documenté.' }}</p></CardContent></Card>
          <Card class="border-dashed border-white/15 bg-white/[0.02]"><CardHeader><CardTitle>Cartes et relations</CardTitle></CardHeader><CardContent><div class="flex gap-4 text-muted-foreground"><MapIcon class="h-8 w-8 shrink-0 text-primary" /><p class="text-sm leading-6">Les cartes, arbres généalogiques et réseaux apparaîtront ici quand les sources permettront de les construire sans invention.</p></div></CardContent></Card>
        </div>
      </section>

      <section id="community" class="py-16">
        <div class="mx-auto max-w-7xl px-5 lg:px-8">
          <div class="mb-8"><h2 class="text-3xl font-bold">Corrections de la communauté</h2><p class="mt-2 text-sm text-muted-foreground">Les propositions visibles respectent elles aussi votre limite anti-spoiler.</p></div>
          <div v-if="visibleCorrections.length" class="grid gap-5 md:grid-cols-2">
            <Card v-for="correction in visibleCorrections" :key="correction.id" class="border-white/10">
              <CardHeader><div class="flex justify-between gap-3"><Badge variant="outline">Saison {{ correction.seasonNumber }} · {{ correction.field }}</Badge><span class="text-xs text-muted-foreground">Score {{ correction.score }}</span></div></CardHeader>
              <CardContent>
                <div class="grid gap-3 sm:grid-cols-2"><div class="rounded-lg bg-red-500/5 p-3"><span class="text-xs text-muted-foreground">Actuel</span><p class="mt-1 text-sm">{{ correction.currentValue }}</p></div><div class="rounded-lg bg-emerald-500/10 p-3"><span class="text-xs text-muted-foreground">Proposé</span><p class="mt-1 text-sm">{{ correction.proposedValue }}</p></div></div>
                <p class="mt-4 text-sm leading-6 text-muted-foreground">{{ correction.reason }}</p>
                <div class="mt-4 flex gap-2"><Button size="sm" :variant="correction.userVote === 1 ? 'default' : 'outline'" @click="vote(correction.id, 1, correction.throughEpisode)"><HandThumbUpIcon class="mr-1 h-4 w-4" />{{ correction.score }}</Button><Button size="sm" :variant="correction.userVote === -1 ? 'destructive' : 'outline'" @click="vote(correction.id, -1, correction.throughEpisode)"><HandThumbDownIcon class="h-4 w-4" /></Button></div>
              </CardContent>
            </Card>
          </div>
          <p v-else class="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-muted-foreground">Aucune correction en attente dans les épisodes déjà vus.</p>
        </div>
      </section>
    </main>

    <div v-else-if="showPending" class="grid min-h-[70vh] place-items-center"><SpinLoader class="h-8 w-8" /></div>
    <div v-else class="grid min-h-[70vh] place-items-center px-5 text-center"><div><h1 class="text-2xl font-bold">Impossible de charger cette série</h1><p class="mt-2 text-muted-foreground">{{ showError?.statusMessage || 'Réessayez dans quelques instants.' }}</p><Button class="mt-5" @click="refreshShow">Réessayer</Button></div></div>

    <Dialog v-model:open="spoilerDialogOpen">
      <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <ShieldCheckIcon class="h-5 w-5 text-emerald-400" />
            Bouclier anti-spoiler
          </DialogTitle>
          <DialogDescription class="sr-only">Choisissez le dernier épisode que vous avez terminé.</DialogDescription>
        </DialogHeader>

        <div class="space-y-7 py-2">
          <div>
            <p class="mb-3 text-sm font-medium">Saison</p>
            <div class="flex flex-wrap gap-2">
              <Button
                v-for="season in seasonsChronological"
                :key="season.id"
                type="button"
                size="sm"
                :variant="reachedSeasonNumber === season.number ? 'default' : 'outline'"
                :class="reachedSeasonNumber === season.number ? 'bg-emerald-600 hover:bg-emerald-600' : ''"
                :aria-pressed="reachedSeasonNumber === season.number"
                @click="selectReachedSeason(season.number)"
              >
                Saison {{ season.number }}
              </Button>
            </div>
          </div>

          <div v-if="reachedSeasonNumber">
            <div class="mb-3 flex items-center justify-between gap-3">
              <p class="text-sm font-medium">Épisode</p>
              <span v-if="progressEpisodeTotal" class="text-xs tabular-nums text-muted-foreground">{{ reachedEpisode }} / {{ progressEpisodeTotal }}</span>
            </div>

            <div v-if="progressEpisodesPending" class="grid min-h-24 place-items-center rounded-xl border border-dashed border-white/10">
              <SpinLoader class="h-5 w-5" />
            </div>
            <p v-else-if="progressEpisodesError && !progressEpisodeTotal" class="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
              Les épisodes de cette saison sont indisponibles.
            </p>
            <div v-else class="grid grid-cols-5 gap-2 sm:grid-cols-8">
              <button
                v-for="episode in progressEpisodeOptions"
                :key="episode.number"
                type="button"
                class="aspect-square rounded-lg border text-sm font-semibold tabular-nums transition-all"
                :class="reachedEpisode === episode.number ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.2)]' : 'border-white/10 bg-white/[0.025] text-muted-foreground hover:border-white/25 hover:bg-white/[0.05] hover:text-white'"
                :aria-label="`Épisode ${episode.number}`"
                :aria-pressed="reachedEpisode === episode.number"
                @click="selectReachedEpisode(episode.number)"
              >
                {{ episode.number }}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" @click="spoilerDialogOpen = false">Terminé</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="correctionOpen">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader><DialogTitle>Proposer une correction</DialogTitle><DialogDescription>La proposition sera soumise aux votes puis validée par l’équipe avant publication.</DialogDescription></DialogHeader>
        <form class="space-y-4" @submit.prevent="submitCorrection">
          <div><label class="mb-1.5 block text-sm font-medium">Information actuelle</label><div class="max-h-28 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">{{ correctionForm.currentValue }}</div></div>
          <div><label for="correction-value" class="mb-1.5 block text-sm font-medium">Votre correction</label><Textarea id="correction-value" v-model="correctionForm.proposedValue" required :maxlength="3000" rows="4" /></div>
          <div><label for="correction-reason" class="mb-1.5 block text-sm font-medium">Pourquoi ?</label><Textarea id="correction-reason" v-model="correctionForm.reason" required minlength="10" maxlength="2000" rows="3" placeholder="Expliquez l’erreur et ce qui permet de la vérifier…" /></div>
          <div><label for="correction-source" class="mb-1.5 block text-sm font-medium">Source vérifiable <span class="font-normal text-muted-foreground">(facultatif)</span></label><Input id="correction-source" v-model="correctionForm.sourceUrl" type="url" placeholder="https://…" /></div>
          <DialogFooter><Button type="button" variant="outline" @click="correctionOpen = false">Annuler</Button><Button type="submit" :disabled="correctionSubmitting">{{ correctionSubmitting ? 'Envoi…' : 'Envoyer la proposition' }}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import {
  CalendarIcon, ChevronDownIcon, HandThumbDownIcon, HandThumbUpIcon, LockClosedIcon, MapIcon,
  MapPinIcon, PencilSquareIcon, ShieldCheckIcon, XMarkIcon,
} from '@heroicons/vue/24/outline';
import { toast } from 'vue-sonner';
import type { ShowWithSeasons } from '~/types/database.types';
import type { SeasonHubArc, SeasonHubCorrection, SeasonHubCorrectionTarget, SeasonHubEvent, SeasonHubResponse } from '~/types/season-hub.types';
import type {
  ShowCharacterProfile,
  TimelineCharacterProfile,
} from '~/types/show-character.types';
import { Badge } from '~/components/shadcn/badge';
import { Button } from '~/components/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/shadcn/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/shadcn/dialog';
import { Input } from '~/components/shadcn/input';
import { Textarea } from '~/components/shadcn/textarea';
import CharacterDirectoryCard from '~/components/CharacterDirectoryCard.vue';
import SeasonStory from '~/components/SeasonStory.vue';
import TimelineCharacterChip from '~/components/TimelineCharacterChip.vue';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import { useImageUrl } from '~/composables/useUtils';
import { useRecapGenerations } from '~/composables/useRecapGenerations';
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
type VisibleArc = SeasonHubArc & { seasonNumber: number; throughEpisode: number };
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

const TIMELINE_PREVIEW_EVENT_COUNT = 3;
const ARC_PREVIEW_COUNT = 3;

const route = useRoute();
const router = useRouter();
const user = useSupabaseUser();
const isAdmin = useIsAdmin();
const { data: showData, pending: showPending, error: showError, refresh: refreshShow } = await useAsyncData(
  `show-data-${route.params.slug}`,
  async () => {
    const traktId = String(route.params.slug).split('-').pop();
    if (!traktId) throw new Error('Invalid show slug.');
    const response = await $fetch(`/api/shows/${traktId}`);
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

const requestedSeason = Number(route.query.season ?? 0);
const requestedEpisode = Number(route.query.episode ?? 0);
const reachedSeasonNumber = ref(sortedSeasons.value.some(season => season.number === requestedSeason) ? requestedSeason : 0);
const reachedEpisode = ref(Number.isInteger(requestedEpisode) && requestedEpisode > 0 ? requestedEpisode : 0);
const spoilerDialogOpen = ref(false);
const progressStorageKey = `synupsis:series-progress:${route.params.slug}`;

const { data: seasonHubs, pending: hubsPending, refresh: refreshHubs } = await useAsyncData(
  `series-knowledge-${route.params.slug}`,
  async () => Promise.all(sortedSeasons.value.map(season => $fetch<SeasonHubResponse>(
    `/api/shows/${route.params.slug}/seasons/${season.number}`,
    { query: { throughEpisode: cursorForSeason(season.number) } },
  ))),
  { watch: [reachedSeasonNumber, reachedEpisode] },
);

function cursorForSeason(seasonNumber: number) {
  if (!reachedSeasonNumber.value) return 999;
  if (seasonNumber < reachedSeasonNumber.value) return 999;
  if (seasonNumber === reachedSeasonNumber.value) return reachedEpisode.value;
  return 0;
}

const currentSeasonHub = computed(() => seasonHubs.value?.find(hub => hub.season.number === reachedSeasonNumber.value) ?? null);
const {
  data: progressEpisodeCatalog,
  pending: progressEpisodesPending,
  error: progressEpisodesError,
} = await useAsyncData(
  `series-progress-episodes-${route.params.slug}`,
  async () => {
    if (!reachedSeasonNumber.value) return { seasonNumber: 0, episodes: [] as ProgressEpisode[], totalEpisodes: 0 };
    return $fetch<{ seasonNumber: number; episodes: ProgressEpisode[]; totalEpisodes: number }>(
      `/api/shows/${route.params.slug}/seasons/${reachedSeasonNumber.value}/episodes`,
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
const progressSummary = computed(() => {
  if (!reachedSeasonNumber.value) return 'Désactivé';
  if (!reachedEpisode.value) return `Saison ${reachedSeasonNumber.value}`;
  return `S${reachedSeasonNumber.value} · E${reachedEpisode.value}`;
});
const timelineEvents = computed<TimelineEvent[]>(() => (seasonHubs.value ?? [])
  .flatMap(hub => hub.events.map(event => ({ ...event, seasonNumber: hub.season.number, throughEpisode: hub.progress.throughEpisode })))
  .sort((a, b) => a.seasonNumber - b.seasonNumber
    || Math.max(...a.episodeNumbers) - Math.max(...b.episodeNumbers)
    || (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0)));
const timelineEpisodeTitles = computed(() => new Map<string, string>((seasonHubs.value ?? [])
  .flatMap(hub => hub.episodes.map(episode => [`${hub.season.number}-${episode.number}`, episode.title]))));
const timelineCharacterKnowledge = computed(() => {
  const builders = new Map<string, TimelineCharacterKnowledgeBuilder>();

  for (const hub of seasonHubs.value ?? []) {
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
const isArcsExpanded = ref(false);
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

  for (const hub of seasonHubs.value ?? []) {
    for (const character of hub.characters) {
      const profile = timelineCharacterProfile(character.name);
      if (!profile) continue;
      const key = normalizeCharacterName(profile.name);
      if (key && !profiles.has(key)) profiles.set(key, profile);
    }
  }

  return [...profiles.values()].sort((a, b) => b.eventCount - a.eventCount
    || a.name.localeCompare(b.name, 'fr'));
});
const hasTvMazeDirectoryProfiles = computed(() => knownCharacterProfiles.value
  .some(profile => profile.imageProvider === 'tvmaze'));
watch(knownCharacterProfiles, (profiles) => {
  if (timelineCharacterFilter.value
    && !profiles.some(profile => characterNamesMatch(profile.name, timelineCharacterFilter.value ?? ''))) {
    timelineCharacterFilter.value = null;
  }
});
const visibleArcs = computed<VisibleArc[]>(() => (seasonHubs.value ?? [])
  .flatMap(hub => hub.arcs.map(arc => ({ ...arc, seasonNumber: hub.season.number, throughEpisode: hub.progress.throughEpisode })))
  .sort((a, b) => a.seasonNumber - b.seasonNumber || a.lastEpisode - b.lastEpisode));
const arcsHaveMoreItems = computed(() => visibleArcs.value.length > ARC_PREVIEW_COUNT);
const displayedArcs = computed(() => isArcsExpanded.value || !arcsHaveMoreItems.value
  ? visibleArcs.value
  : visibleArcs.value.slice(-ARC_PREVIEW_COUNT));
const visibleCorrections = computed<VisibleCorrection[]>(() => (seasonHubs.value ?? [])
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

onMounted(() => {
  if (route.query.season != null) return;
  try {
    const saved = JSON.parse(localStorage.getItem(progressStorageKey) || '{}');
    const hasSavedSeason = sortedSeasons.value.some(season => season.number === Number(saved.season));
    if (hasSavedSeason && saved.enabled !== false) {
      reachedSeasonNumber.value = Number(saved.season);
      reachedEpisode.value = Number.isInteger(Number(saved.episode)) ? Math.max(0, Number(saved.episode)) : 0;
    }
  } catch {
    // A malformed local preference simply falls back to the spoiler-safe state.
  }
});

function changeReachedSeason() {
  reachedEpisode.value = 0;
  persistProgress();
}

function selectReachedSeason(seasonNumber: number) {
  if (reachedSeasonNumber.value === seasonNumber) {
    reachedSeasonNumber.value = 0;
    reachedEpisode.value = 0;
    persistProgress();
    return;
  }
  reachedSeasonNumber.value = seasonNumber;
  changeReachedSeason();
}

function selectReachedEpisode(episodeNumber: number) {
  reachedEpisode.value = episodeNumber;
  persistProgress();
}

function isRecapUnlocked(seasonNumber: number) {
  if (!reachedSeasonNumber.value) return true;
  if (seasonNumber < reachedSeasonNumber.value) return true;
  if (seasonNumber > reachedSeasonNumber.value) return false;
  return progressEpisodeTotal.value > 0 && reachedEpisode.value >= progressEpisodeTotal.value;
}

function persistProgress() {
  if (import.meta.client) localStorage.setItem(progressStorageKey, JSON.stringify({
    season: reachedSeasonNumber.value,
    episode: reachedEpisode.value,
  }));
  router.replace({ query: {
    ...route.query,
    season: reachedSeasonNumber.value || undefined,
    episode: reachedEpisode.value || undefined,
  } });
}

const { generations: recapGenerations, start: startRecapGeneration } = useRecapGenerations({
  showId: () => showData.value?.id,
  async onCompleted(_seasonId, recapId) {
    await Promise.all([refreshShow(), refreshHubs()]);
    // Several seasons may be generating: offer the recap instead of leaving the page.
    toast.success('Le récap est prêt.', recapId
      ? { action: { label: 'Voir', onClick: () => goToRecap(recapId) } }
      : undefined);
  },
  onFailed(_seasonId, message) {
    toast.error('Impossible de générer ce récap.', { description: message });
  },
});

async function generateRecap(seasonId: string) {
  if (!user.value) {
    toast.info('Connectez-vous pour demander ce récap.');
    await navigateTo('/login');
    return;
  }
  await startRecapGeneration(seasonId);
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
    toast.info('Connectez-vous pour proposer une correction.');
    await navigateTo('/login');
    return;
  }
  Object.assign(correctionForm, { seasonNumber, targetType, targetKey, field, currentValue, proposedValue: currentValue, reason: '', sourceUrl: '', revealEpisode, throughEpisode });
  correctionOpen.value = true;
}

async function submitCorrection() {
  correctionSubmitting.value = true;
  try {
    await $fetch(`/api/shows/${route.params.slug}/seasons/${correctionForm.seasonNumber}/corrections`, {
      method: 'POST', body: correctionForm,
    });
    correctionOpen.value = false;
    toast.success('Votre correction a été proposée.');
    await refreshHubs();
  } catch (cause: any) {
    toast.error('Impossible d’envoyer la correction.', { description: cause.data?.statusMessage || cause.message });
  } finally {
    correctionSubmitting.value = false;
  }
}

async function vote(correctionId: string, value: -1 | 1, throughEpisode: number) {
  if (!user.value) {
    toast.info('Connectez-vous pour voter.');
    await navigateTo('/login');
    return;
  }
  try {
    await $fetch(`/api/corrections/${correctionId}/vote`, { method: 'POST', body: { value, throughEpisode } });
    await refreshHubs();
  } catch (cause: any) {
    toast.error('Impossible d’enregistrer ce vote.', { description: cause.data?.statusMessage || cause.message });
  }
}

useHead(() => {
  const description = showSummary.value.slice(0, 155) || 'Récaps et informations de série sans spoilers.';
  return {
    title: showData.value ? `${showData.value.name} — Synupsis` : 'Série — Synupsis',
    meta: [
      { name: 'description', content: description },
      { property: 'og:image', content: useImageUrl(showData.value?.image) ?? '/svg/logo.svg' },
    ],
  };
});
</script>
