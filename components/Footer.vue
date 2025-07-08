<template>
  <footer class="border-t border-border mt-16">
    <div class="container mx-auto py-8 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-8">
      <div class="flex items-center gap-2">
        <Logo class="h-8 w-auto" />
      </div>
      <p class="text-sm text-muted-foreground order-3 sm:order-2">&copy; {{ new Date().getFullYear() }} Synupsis. All rights reserved.</p>
      <div class="flex items-center gap-6 text-sm order-2 sm:order-3">
        <router-link to="/about" class="text-muted-foreground hover:text-foreground transition-colors">
          About
        </router-link>
        <a href="#" class="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a>
        <a href="#" class="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import Logo from '~/components/Logo.vue';
</script>
