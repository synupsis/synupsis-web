<template>
  <div>
    <h3 class="text-2xl font-medium">{{ data?.name }}</h3>

    <img v-if="data" :src="data?.image?.original" alt="">
    <Alert v-if="error" title="Something went wrong">
      <p>There was an error</p>
      <p>{{ error }}</p>
    </Alert>
  </div>
</template>
<script setup lang="ts">
import useSupabase from "~/composables/useSupabase";
import Alert from "~/components/ui/Alert.vue";

const {supabase} = useSupabase();
const loading = ref(false);
const error = ref(null);
const data = ref(null)

onMounted(async () => {
  const router = useRoute()
  console.log(router.params.slug)
  loading.value = true;
  const {data: showData, error: showError} = await supabase.functions.invoke('get-show', {
    body: {slug: router.params.slug},
  })
  loading.value = false;

  data.value = showData?.show
  error.value = showError?.message;
})
</script>
