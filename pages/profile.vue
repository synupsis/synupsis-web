<template>
  <div class="w-full min-h-screen bg-background text-foreground">
    <header class="flex w-full justify-between items-center py-6 px-8 border-b">
      <router-link to="/">
        <img src="/svg/logo_text.svg" alt="Synupsis Logo" class="h-8" />
      </router-link>
      <UserAuthStatus />
    </header>
    <main class="p-8">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-bold mb-8">My Profile</h1>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- User Details Card -->
          <Card class="md:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
            </CardHeader>
            <CardContent v-if="user" class="space-y-4">
              <div class="space-y-1">
                <p class="text-sm font-medium text-muted-foreground">Username</p>
                <p>{{ user.user_metadata.username }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-sm font-medium text-muted-foreground">Email</p>
                <p>{{ user.email }}</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="destructive" @click="logout">Log Out</Button>
            </CardFooter>
          </Card>

          <!-- Recaps Section -->
          <div v-if="isAdmin" class="md:col-span-2 space-y-8">
            <div v-if="pending">
              <SpinLoader class="h-8 w-8 mx-auto" />
            </div>
            <div v-else-if="error">
              <p class="text-destructive">Could not load your recaps.</p>
            </div>
            <div v-else>
              <!-- Drafts -->
              <section>
                <h2 class="text-2xl font-semibold mb-4">Drafts</h2>
                <div v-if="drafts.length > 0" class="space-y-4">
                  <Card v-for="recap in drafts" :key="recap.id">
                    <CardHeader>
                      <CardTitle>{{ recap.show.name }}</CardTitle>
                      <CardDescription>Season {{ recap.season.number }}</CardDescription>
                    </CardHeader>
                    <CardFooter>
                      <Button @click="goToRecapEditor(recap.show.id, recap.season.id)">
                        <PencilIcon class="h-4 w-4 mr-2" />
                        Edit Draft
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
                <p v-else class="text-muted-foreground">You have no drafts.</p>
              </section>

              <!-- Published -->
              <section>
                <h2 class="text-2xl font-semibold mb-4">Published Recaps</h2>
                <div v-if="published.length > 0" class="space-y-4">
                  <Card v-for="recap in published" :key="recap.id">
                    <CardHeader>
                      <CardTitle>{{ recap.show.name }}</CardTitle>
                      <CardDescription>Season {{ recap.season.number }}</CardDescription>
                    </CardHeader>
                    <CardFooter class="flex gap-2">
                      <Button variant="secondary" @click="goToRecap(recap.id)">
                        <EyeIcon class="h-4 w-4 mr-2" />
                        View
                      </Button>
                      <Button @click="goToRecapEditor(recap.show.id, recap.season.id)">
                        <PencilIcon class="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
                <p v-else class="text-muted-foreground">You have no published recaps.</p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watchEffect } from 'vue';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/shadcn/card'
import { Button } from '~/components/shadcn/button'
import UserAuthStatus from '~/components/UserAuthStatus.vue';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import { PencilIcon, EyeIcon } from '@heroicons/vue/24/outline';

const user = useSupabaseUser();
const supabase = useSupabaseClient();
const router = useRouter();
const isAdmin = ref(false);

watchEffect(async () => {
  if (user.value) {
    const { data } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.value.id)
      .single();
    isAdmin.value = data?.role === 'admin';
  }
});

const { data: recaps, pending, error } = useFetch('/api/user/recaps');

const drafts = computed(() => (recaps.value || []).filter(r => r.status === 'draft'));
const published = computed(() => (recaps.value || []).filter(r => r.status === 'published'));

function goToRecapEditor(showId: string, seasonId: string) {
  router.push({ path: '/recap-editor', query: { show: showId, season: seasonId } });
}

function goToRecap(recapId: string) {
  router.push(`/recap/${recapId}`);
}

async function logout() {
  await supabase.auth.signOut();
  await router.push('/');
}
</script>
