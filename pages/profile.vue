<template>
  <div class="w-full min-h-screen bg-background text-foreground">
    <AppHeader class="border-b" />
    <main class="p-4 sm:p-8">
      <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <!-- Left Column: User Card -->
        <div class="md:col-span-1">
          <Card class="sticky top-8">
            <CardHeader class="items-center text-center">
              <Avatar class="h-24 w-24 mb-4">
                <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="displayName" />
                <AvatarFallback>{{ displayName.charAt(0) }}</AvatarFallback>
              </Avatar>
              <CardTitle>{{ displayName }}</CardTitle>
              <CardDescription>{{ user?.email }}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" class="w-full" @click="isAvatarModalOpen = true">{{ t("Change Avatar") }}</Button>
            </CardContent>
            <CardFooter>
              <Button variant="destructive" @click="logout" class="w-full">{{ t("Log Out") }}</Button>
            </CardFooter>
          </Card>
        </div>

        <!-- Right Column: Tabs -->
        <div class="md:col-span-3">
          <Card class="mb-6">
            <CardHeader>
              <CardTitle>{{ t('Display language') }}</CardTitle>
              <CardDescription>{{ t('Choose the language used across the app.') }}</CardDescription>
            </CardHeader>
            <CardContent>
              <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="saveLanguage">
                <div class="flex-1">
                  <label for="display-language" class="mb-2 block text-sm font-medium">{{ t('Display language') }}</label>
                  <select id="display-language" v-model="selectedLanguage" :disabled="saving" class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="browser">{{ t('Browser language') }}</option>
                    <option value="fr" lang="fr">Français</option>
                    <option value="en" lang="en">English</option>
                  </select>
                </div>
                <Button type="submit" :disabled="saving || selectedLanguage === preference">
                  {{ saving ? t('Saving…') : t('Save language') }}
                </Button>
              </form>
              <p v-if="languageStatus" class="mt-3 text-sm" :class="languageError ? 'text-destructive' : 'text-muted-foreground'" role="status" aria-live="polite">{{ t(languageStatus) }}</p>
            </CardContent>
          </Card>
          <Tabs v-model="activeTab" default-value="recaps">
            <TabsList class="grid w-full grid-cols-2">
              <TabsTrigger value="recaps">{{ t("My Recaps") }}</TabsTrigger>
              <TabsTrigger value="stats">{{ t("Statistics") }}</TabsTrigger>
            </TabsList>
            
            <!-- Recaps Tab -->
            <TabsContent value="recaps" class="mt-4">
              <div v-if="recapsPending">
                <SpinLoader class="h-8 w-8 mx-auto mt-12" />
              </div>
              <div v-else-if="recapsError">
                <p class="text-destructive text-center mt-12">{{ t("Could not load your recaps.") }}</p>
              </div>
              <div v-else class="space-y-8">
                <section>
                  <h2 class="text-2xl font-semibold mb-4">{{ t("Drafts") }}</h2>
                  <div v-if="drafts.length > 0" class="space-y-4">
                    <Card v-for="recap in drafts" :key="recap.id">
                      <CardHeader>
                        <CardTitle>{{ recap.show.name }}</CardTitle>
                        <CardDescription>{{ t('Season {number}', { number: recap.season.number }) }}</CardDescription>
                      </CardHeader>
                      <CardFooter>
                        <Button @click="goToRecapEditor(recap.show.id, recap.season.id, recap.id)">
                          <PencilIcon class="h-4 w-4 mr-2" />
                          {{ t("Edit Draft") }}
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                  <p v-else class="text-muted-foreground">{{ t("You have no drafts.") }}</p>
                </section>
                <section>
                  <h2 class="text-2xl font-semibold mb-4">{{ t("Published Recaps") }}</h2>
                  <div v-if="published.length > 0" class="space-y-4">
                    <Card v-for="recap in published" :key="recap.id">
                      <CardHeader>
                        <CardTitle>{{ recap.show.name }}</CardTitle>
                        <CardDescription>{{ t('Season {number}', { number: recap.season.number }) }}</CardDescription>
                      </CardHeader>
                      <CardFooter class="flex gap-2">
                        <Button variant="secondary" @click="goToRecap(recap.id)">
                          <EyeIcon class="h-4 w-4 mr-2" />
                          {{ t("View") }}
                        </Button>
                        <Button @click="goToRecapEditor(recap.show.id, recap.season.id, recap.id)">
                          <PencilIcon class="h-4 w-4 mr-2" />
                          {{ t("Edit") }}
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                  <p v-else class="text-muted-foreground">{{ t("You have no published recaps.") }}</p>
                </section>
              </div>
            </TabsContent>

            <!-- Stats Tab -->
            <TabsContent value="stats" class="mt-4">
               <div v-if="statsPending">
                <SpinLoader class="h-8 w-8 mx-auto mt-12" />
              </div>
              <div v-else-if="statsError">
                <p class="text-destructive text-center mt-12">{{ t("Could not load your statistics.") }}</p>
              </div>
              <div v-else-if="stats" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{{ t("Total Recaps") }}</CardTitle>
                    <CardDescription>{{ t("All your contributions.") }}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p class="text-4xl font-bold">{{ stats.total }}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{{ t("Published") }}</CardTitle>
                    <CardDescription>{{ t("Visible to everyone.") }}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p class="text-4xl font-bold">{{ stats.published }}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{{ t("Drafts") }}</CardTitle>
                    <CardDescription>{{ t("Only visible to you.") }}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p class="text-4xl font-bold">{{ stats.drafts }}</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
    <AvatarUploadModal v-model:is-open="isAvatarModalOpen" @upload-success="refreshUser" />
  </div>
</template>

<script lang="ts" setup>
import { EyeIcon, PencilIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/shadcn/card'
import { Button } from '~/components/shadcn/button'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/shadcn/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/shadcn/tabs'
import SpinLoader from '~/components/ui/SpinLoader.vue';
import AvatarUploadModal from '~/components/AvatarUploadModal.vue';
import { useStoryViewer } from '~/composables/useStoryViewer';
import type { LanguagePreference } from '~/lib/i18n/locale';

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
