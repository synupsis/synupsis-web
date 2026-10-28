<template>
  <aside class="w-64 bg-gray-800 text-white p-4">
    <nav>
      <ul>
        <li>
          <router-link to="/admin" class="block py-2 px-4 rounded hover:bg-gray-700">{{ t('Dashboard') }}</router-link>
        </li>
        <li>
          <router-link to="/admin/prompts" class="block py-2 px-4 rounded hover:bg-gray-700">{{ t('Prompts') }}</router-link>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<script setup lang="ts">
const { t } = useI18n();
</script>
