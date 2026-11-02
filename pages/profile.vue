<template>
  <div class="grid min-h-screen place-items-center bg-background"><SpinLoader class="h-6 w-6" /></div>
</template>

<script setup lang="ts">
import SpinLoader from '~/components/ui/SpinLoader.vue';
import type { OwnPublicProfile } from '~/types/public-profile.types';

// "My profile": the viewer's public page, or their settings while they have no username.
const { data } = await useFetch<OwnPublicProfile>('/api/user/profile');
await navigateTo(data.value?.handle && data.value.displayName ? `/u/${data.value.handle}` : '/settings', { replace: true });
</script>
