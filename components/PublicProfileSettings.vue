<template>
  <!-- What other viewers see on the public page. -->
  <section aria-labelledby="public-profile-heading">
    <div class="flex flex-wrap items-center gap-5">
      <Avatar class="size-20">
        <AvatarImage v-if="avatarUrl" :src="avatarUrl" alt="" />
        <AvatarFallback class="flex size-full items-center justify-center bg-foreground/10 text-2xl font-semibold">{{ initial }}</AvatarFallback>
      </Avatar>
      <div class="min-w-0 flex-1">
        <h2 id="public-profile-heading" class="text-xl font-semibold tracking-tight">{{ t('Public profile') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('Shown on your public page. Your name and avatar also appear on your comments, suggestions and recaps.') }}</p>
      </div>
      <div class="flex w-full gap-2 sm:w-auto">
        <Button variant="outline" class="h-10 rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-muted" @click="isAvatarModalOpen = true">{{ t('Change Avatar') }}</Button>
        <Button v-if="profilePath" as-child variant="outline" class="h-10 rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-muted">
          <NuxtLink :to="profilePath">{{ t('View my profile') }}</NuxtLink>
        </Button>
      </div>
    </div>

    <div v-if="pending" class="grid h-40 place-items-center"><SpinLoader class="h-5 w-5" /></div>
    <p v-else-if="error" class="mt-6 text-sm text-destructive">{{ t('Could not load your profile.') }}</p>
    <form v-else class="mt-6 space-y-5" :aria-busy="saving" @submit.prevent="save">
      <div class="space-y-2">
        <label class="text-sm font-medium" for="profile-name">{{ t('Username') }}</label>
        <Input
          id="profile-name"
          v-model="displayName"
          type="text"
          autocomplete="nickname"
          :maxlength="PROFILE_NAME_MAX_LENGTH"
          required
          :disabled="saving"
          class="h-10 rounded-lg border-border bg-background px-3 text-sm shadow-none focus-visible:border-foreground/40 focus-visible:ring-0"
        />
      </div>
      <div class="space-y-2">
        <div class="flex items-baseline justify-between gap-3">
          <label class="text-sm font-medium" for="profile-bio">{{ t('Bio') }}</label>
          <span class="text-xs tabular-nums text-muted-foreground" aria-hidden="true">{{ bio.length }}/{{ PROFILE_BIO_MAX_LENGTH }}</span>
        </div>
        <textarea
          id="profile-bio"
          v-model="bio"
          rows="3"
          :maxlength="PROFILE_BIO_MAX_LENGTH"
          :placeholder="t('The series you love, what you are watching…')"
          :disabled="saving"
          class="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/40"
        />
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button type="submit" class="h-10 rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/85" :disabled="saving || !changed || !displayName.trim()">
          {{ saving ? t('Saving…') : t('Save profile') }}
        </Button>
        <p v-if="status" class="text-sm" :class="statusError ? 'text-destructive' : 'text-muted-foreground'" role="status" aria-live="polite">{{ t(status) }}</p>
      </div>
    </form>
    <AvatarUploadModal v-model:is-open="isAvatarModalOpen" @upload-success="refreshSession" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/shadcn/avatar';
import { Button } from '~/components/shadcn/button';
import { Input } from '~/components/shadcn/input';
import SpinLoader from '~/components/ui/SpinLoader.vue';
import AvatarUploadModal from '~/components/AvatarUploadModal.vue';
import { PROFILE_BIO_MAX_LENGTH, PROFILE_NAME_MAX_LENGTH } from '~/lib/public-profile';
import type { OwnPublicProfile } from '~/types/public-profile.types';

const { t } = useI18n();
const user = useSupabaseUser();
const supabase = useSupabaseClient();
const isAvatarModalOpen = ref(false);

const avatarUrl = computed(() => {
  const value = user.value?.user_metadata?.avatar_url;
  return typeof value === 'string' ? value : '';
});

const { data, pending, error } = useFetch<OwnPublicProfile>('/api/user/profile');
const displayName = ref('');
const bio = ref('');
const saving = ref(false);
const status = ref('');
const statusError = ref(false);

function fill(profile: OwnPublicProfile | null | undefined) {
  displayName.value = profile?.displayName ?? '';
  bio.value = profile?.bio ?? '';
}
watch(data, fill, { immediate: true });
watch([displayName, bio], () => { status.value = ''; });

const initial = computed(() => (displayName.value.trim()[0] ?? '?').toLocaleUpperCase());
// The page exists once the account has a name.
const profilePath = computed(() => data.value?.handle && data.value.displayName ? `/u/${data.value.handle}` : '');
const changed = computed(() => displayName.value.trim() !== (data.value?.displayName ?? '')
  || bio.value.trim() !== (data.value?.bio ?? ''));

async function save() {
  saving.value = true;
  status.value = '';
  statusError.value = false;
  try {
    data.value = await $fetch<OwnPublicProfile>('/api/user/profile', {
      method: 'PUT',
      body: { displayName: displayName.value, bio: bio.value },
    });
    // The header reads the username from the session.
    await refreshSession();
    status.value = 'Profile saved.';
  } catch (cause: any) {
    statusError.value = true;
    status.value = cause?.data?.statusMessage ?? 'Could not save your profile.';
  } finally {
    saving.value = false;
  }
}

async function refreshSession() {
  await supabase.auth.refreshSession();
}
</script>
