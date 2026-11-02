<template>
  <LegalPage :document="termsOfService" />
</template>

<script setup lang="ts">
import LegalPage from '~/components/LegalPage.vue';
import { termsOfService } from '~/lib/legal/terms';
</script>
