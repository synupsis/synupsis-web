<template>
  <LegalPage :document="privacyPolicy" />
</template>

<script setup lang="ts">
import LegalPage from '~/components/LegalPage.vue';
import { privacyPolicy } from '~/lib/legal/privacy';
</script>
