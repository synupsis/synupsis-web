<template>
  <div class="min-h-screen w-full bg-background text-foreground">
    <AppHeader class="border-b border-border" />
    <main class="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <section class="flex flex-wrap items-center gap-5" :aria-label="t('Profile')">
        <Avatar class="size-20">
          <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="displayName" />
          <AvatarFallback class="flex size-full items-center justify-center bg-foreground/10 text-2xl font-semibold">{{ displayName.charAt(0).toUpperCase() }}</AvatarFallback>
        </Avatar>
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-3xl font-bold tracking-tight">{{ displayName }}</h1>
          <p class="truncate text-sm text-muted-foreground">{{ user?.email }}</p>
        </div>
        <div class="flex w-full gap-2 sm:w-auto">
          <Button variant="outline" class="h-10 rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-muted" @click="isAvatarModalOpen = true">{{ t("Change Avatar") }}</Button>
          <Button variant="ghost" class="h-10 rounded-lg px-4 text-sm font-medium text-red-400 hover:bg-red-400/10 hover:text-red-300" @click="logout">{{ t("Log Out") }}</Button>
        </div>
      </section>

      <section class="mt-10 border-t border-border pt-8" :aria-label="t('Recap tickets')">
        <div v-if="keysPending" class="grid h-16 place-items-center"><SpinLoader class="h-5 w-5" /></div>
        <RecapTicketsBalance v-else-if="keys" :wallet="keys.wallet" />
      </section>

      <section class="mt-10 border-t border-border pt-8">
        <Tabs v-model="activeTab" default-value="recaps">
          <TabsList class="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="recaps" class="rounded-none border-b-2 border-transparent px-0 pb-3 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">{{ t("My Recaps") }}</TabsTrigger>
            <TabsTrigger value="stats" class="rounded-none border-b-2 border-transparent px-0 pb-3 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">{{ t("Statistics") }}</TabsTrigger>
          </TabsList>

          <TabsContent value="recaps" class="mt-8">
            <section v-if="unlockedRecaps?.length" class="mb-10">
              <h2 class="text-xl font-semibold tracking-tight">{{ t('Recaps you unlocked') }}</h2>
              <ul class="mt-3 divide-y divide-border">
                <li v-for="recap in unlockedRecaps" :key="recap.id" class="flex items-center justify-between gap-3 py-3 text-sm">
                  <button type="button" class="min-w-0 truncate text-left underline-offset-4 hover:underline" @click="openStory(recap.id)">
                    {{ t('{show}, season {number}', { show: recap.showName, number: recap.seasonNumber }) }}
                    <span class="ml-1 text-xs uppercase text-muted-foreground">{{ recap.locale }}</span>
                  </button>
                  <span class="flex shrink-0 items-center gap-1 text-muted-foreground">
                    <EyeIcon class="h-3.5 w-3.5" aria-hidden="true" />
                    {{ recap.views === 1 ? t('1 view') : t('{count} views', { count: recap.views }) }}
                  </span>
                </li>
              </ul>
            </section>
            <div v-if="recapsPending">
              <SpinLoader class="mx-auto mt-12 h-8 w-8" />
            </div>
            <p v-else-if="recapsError" class="mt-12 text-center text-destructive">{{ t("Could not load your recaps.") }}</p>
            <div v-else class="space-y-10">
              <section>
                <h2 class="text-xl font-semibold tracking-tight">{{ t("Drafts") }}</h2>
                <ul v-if="drafts.length > 0" class="mt-3 divide-y divide-border">
                  <li v-for="recap in drafts" :key="recap.id" class="flex items-center justify-between gap-4 py-3">
                    <div class="min-w-0">
                      <p class="truncate font-medium">{{ recap.show.name }}</p>
                      <p class="text-sm text-muted-foreground">{{ t('Season {number}', { number: recap.season.number }) }}</p>
                    </div>
                    <Button variant="outline" class="h-10 rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-muted" @click="goToRecapEditor(recap.show.id, recap.season.id, recap.id)">
                      <PencilIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                      {{ t("Edit Draft") }}
                    </Button>
                  </li>
                </ul>
                <p v-else class="mt-3 text-sm text-muted-foreground">{{ t("You have no drafts.") }}</p>
              </section>
              <section>
                <h2 class="text-xl font-semibold tracking-tight">{{ t("Published Recaps") }}</h2>
                <ul v-if="published.length > 0" class="mt-3 divide-y divide-border">
                  <li v-for="recap in published" :key="recap.id" class="flex flex-wrap items-center justify-between gap-4 py-3">
                    <div class="min-w-0">
                      <p class="truncate font-medium">{{ recap.show.name }}</p>
                      <p class="text-sm text-muted-foreground">{{ t('Season {number}', { number: recap.season.number }) }}</p>
                    </div>
                    <div class="flex gap-2">
                      <Button variant="outline" class="h-10 rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-muted" @click="goToRecap(recap.id)">
                        <EyeIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                        {{ t("View") }}
                      </Button>
                      <Button variant="outline" class="h-10 rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-muted" @click="goToRecapEditor(recap.show.id, recap.season.id, recap.id)">
                        <PencilIcon class="mr-2 h-4 w-4" aria-hidden="true" />
                        {{ t("Edit") }}
                      </Button>
                    </div>
                  </li>
                </ul>
                <p v-else class="mt-3 text-sm text-muted-foreground">{{ t("You have no published recaps.") }}</p>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="stats" class="mt-8">
            <div v-if="statsPending">
              <SpinLoader class="mx-auto mt-12 h-8 w-8" />
            </div>
            <p v-else-if="statsError" class="mt-12 text-center text-destructive">{{ t("Could not load your statistics.") }}</p>
            <dl v-else-if="stats" class="grid grid-cols-3 divide-x divide-border">
              <div class="pr-4">
                <dt class="text-sm font-medium">{{ t("Total Recaps") }}</dt>
                <dd class="mt-1 text-3xl font-bold tabular-nums">{{ stats.total }}</dd>
                <dd class="mt-1 text-xs text-muted-foreground">{{ t("All your contributions.") }}</dd>
              </div>
              <div class="px-4">
                <dt class="text-sm font-medium">{{ t("Published") }}</dt>
                <dd class="mt-1 text-3xl font-bold tabular-nums">{{ stats.published }}</dd>
                <dd class="mt-1 text-xs text-muted-foreground">{{ t("Visible to everyone.") }}</dd>
              </div>
              <div class="pl-4">
                <dt class="text-sm font-medium">{{ t("Drafts") }}</dt>
                <dd class="mt-1 text-3xl font-bold tabular-nums">{{ stats.drafts }}</dd>
                <dd class="mt-1 text-xs text-muted-foreground">{{ t("Only visible to you.") }}</dd>
              </div>
            </dl>
          </TabsContent>
        </Tabs>
      </section>

      <section class="mt-12 border-t border-border pt-8" aria-labelledby="display-language-heading">
        <h2 id="display-language-heading" class="text-xl font-semibold tracking-tight">{{ t('Display language') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('Choose the language used across the app.') }}</p>
        <form class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center" @submit.prevent="saveLanguage">
          <label for="display-language" class="sr-only">{{ t('Display language') }}</label>
          <select id="display-language" v-model="selectedLanguage" :disabled="saving" class="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-0">
            <option value="browser">{{ t('Browser language') }}</option>
            <option value="fr" lang="fr">Français</option>
            <option value="en" lang="en">English</option>
          </select>
          <Button type="submit" class="h-10 rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/85" :disabled="saving || selectedLanguage === preference">
            {{ saving ? t('Saving…') : t('Save language') }}
          </Button>
        </form>
        <p v-if="languageStatus" class="mt-3 text-sm" :class="languageError ? 'text-destructive' : 'text-muted-foreground'" role="status" aria-live="polite">{{ t(languageStatus) }}</p>
      </section>

      <section class="mt-10 border-t border-border pt-8" aria-labelledby="recap-languages-heading">
        <h2 id="recap-languages-heading" class="text-xl font-semibold tracking-tight">{{ t('Recap languages') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('Choose the languages you read recaps in. A show page lets you switch between them.') }}</p>
        <form class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center" @submit.prevent="saveRecapLanguageSelection">
          <fieldset class="flex flex-1 flex-wrap gap-x-6 gap-y-2" :disabled="savingRecapLanguages">
            <legend class="sr-only">{{ t('Recap languages') }}</legend>
            <label v-for="language in recapLocales" :key="language" class="flex items-center gap-2 text-sm" :lang="language">
              <input v-model="selectedRecapLanguages" type="checkbox" :value="language" class="h-4 w-4 rounded border-input bg-background text-foreground focus-visible:ring-2 focus-visible:ring-foreground">
              {{ recapLocaleNames[language] }}
            </label>
          </fieldset>
          <Button type="submit" class="h-10 rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/85" :disabled="savingRecapLanguages || !selectedRecapLanguages.length || !recapLanguagesChanged">
            {{ savingRecapLanguages ? t('Saving…') : t('Save recap languages') }}
          </Button>
        </form>
        <p v-if="recapLanguageStatus" class="mt-3 text-sm" :class="recapLanguageError ? 'text-destructive' : 'text-muted-foreground'" role="status" aria-live="polite">{{ t(recapLanguageStatus) }}</p>
      </section>
    </main>
    <AvatarUploadModal v-model:is-open="isAvatarModalOpen" @upload-success="refreshUser" />
  </div>
</template>

<script lang="ts" setup>
import { EyeIcon, PencilIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { Button } from '~/components/shadcn/button'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/shadcn/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/shadcn/tabs'
import SpinLoader from '~/components/ui/SpinLoader.vue';
import AvatarUploadModal from '~/components/AvatarUploadModal.vue';
import RecapTicketsBalance from '~/components/RecapTicketsBalance.vue';
import { useStoryViewer } from '~/composables/useStoryViewer';
import type { LanguagePreference } from '~/lib/i18n/locale';
import { recapLocaleNames, recapLocales, type RecapLocale } from '~/lib/recap-locales';
import { useRecapKeys } from '~/composables/useRecapKeys';

const { t, preference } = useI18n();
const { saving, saveLanguagePreference } = useLanguagePreference();
const selectedLanguage = ref<LanguagePreference>(preference.value);
const languageStatus = ref('');
const languageError = ref(false);
watch(preference, value => { selectedLanguage.value = value; });
watch(selectedLanguage, () => { languageStatus.value = ''; });

async function saveLanguage() {
  languageStatus.value = '';
  languageError.value = false;
  try {
    if (await saveLanguagePreference(selectedLanguage.value)) languageStatus.value = 'Language saved.';
  } catch {
    languageError.value = true;
    languageStatus.value = 'Could not save your language. Please try again.';
  }
}

const { recapLanguages, saving: savingRecapLanguages, saveRecapLanguages } = useRecapLanguages();
const selectedRecapLanguages = ref<RecapLocale[]>([...recapLanguages.value]);
const recapLanguageStatus = ref('');
const recapLanguageError = ref(false);
// Saved in the catalog order: the show page starts on the display language when it is one of them.
const orderedRecapLanguages = computed(() => recapLocales.filter(language => selectedRecapLanguages.value.includes(language)));
const recapLanguagesChanged = computed(() => orderedRecapLanguages.value.join() !== recapLanguages.value.join());
watch(recapLanguages, value => { selectedRecapLanguages.value = [...value]; });
watch(selectedRecapLanguages, () => { recapLanguageStatus.value = ''; });

async function saveRecapLanguageSelection() {
  recapLanguageStatus.value = '';
  recapLanguageError.value = false;
  try {
    if (await saveRecapLanguages(orderedRecapLanguages.value)) recapLanguageStatus.value = 'Recap languages saved.';
  } catch {
    recapLanguageError.value = true;
    recapLanguageStatus.value = 'Could not save your recap languages. Please try again.';
  }
}

const user = useSupabaseUser();
const supabase = useSupabaseClient();
const router = useRouter();
const activeTab = ref('recaps');
const isAvatarModalOpen = ref(false);
const userMetadata = computed<Record<string, unknown>>(() => user.value?.user_metadata ?? {});
const displayName = computed(() => {
  const username = userMetadata.value.username;
  return typeof username === 'string' && username ? username : (user.value?.email ?? t('User'));
});
const avatarUrl = computed(() => {
  const value = userMetadata.value.avatar_url;
  return typeof value === 'string' ? value : '';
});

const { wallet, completedVersion, refreshWallet } = useRecapKeys();
const keys = computed(() => wallet.value ? { wallet: wallet.value } : null);
const keysPending = computed(() => !wallet.value);
onMounted(() => { if (!wallet.value) void refreshWallet(); });
const { data: unlockedRecaps } = useFetch('/api/user/unlocked-recaps', {
  watch: [completedVersion, () => wallet.value?.points],
});

// Fetch recaps
const { data: recaps, pending: recapsPending, error: recapsError } = useFetch('/api/user/recaps');
const drafts = computed(() => (recaps.value || []).filter(r => r.status === 'draft'));
const published = computed(() => (recaps.value || []).filter(r => r.status === 'published'));

// Fetch stats
const { data: stats, pending: statsPending, error: statsError } = useFetch('/api/user/stats');

const refreshUser = async () => {
  await supabase.auth.refreshSession();
};

function goToRecapEditor(showId: string, seasonId: string, recapId: string) {
  router.push({ path: '/recap-editor', query: { show: showId, season: seasonId, recap: recapId } });
}

const { openStory } = useStoryViewer();

function goToRecap(recapId: string) {
  openStory(recapId);
}

async function logout() {
  await supabase.auth.signOut();
  await router.push('/');
}
</script>
