<template>
  <aside class="w-64 bg-gray-800 text-white p-4">
    <nav>
      <ul>
        <li>
          <router-link to="/admin" class="block py-2 px-4 rounded hover:bg-gray-700">Dashboard</router-link>
        </li>
        <li>
          <router-link to="/admin/prompts" class="block py-2 px-4 rounded hover:bg-gray-700">Prompts</router-link>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<script setup lang="ts">
</script>
