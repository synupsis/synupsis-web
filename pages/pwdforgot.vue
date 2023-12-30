<template>
  <div
    class="w-screen h-screen"
    style="background-color: color(srgb 0 0.070588 0.2); color: #cac0b3"
  >
    <div class="flex flex-row">
      <div class="hidden lg:flex w-[1080px] h-screen">
        <video class="h-screen max-w-[1080px] responsive-video" autoplay loop muted>
          <source src="~/assets/mp4/forgot.mp4" type="video/webm" />
        </video>
      </div>
      <div class="flex flex-col w-1/2 h-screen place-content-center ml-24">
        <div class="text-3xl font-bold w-3/6 mb-8">Forgot password ?</div>
        <div class="w-3/6 mb-8">
          <div class="mb-4">
            Enter the email address you used when you joined and we’ll send you instructions to
            reset your password.
          </div>
          <div>
            For security reasons, we do NOT store your password. So rest assured that we will never
            send your password via email.
          </div>
        </div>
        <div class="w-3/6 mb-2">Email Address</div>
        <Input class="w-3/6 mb-4" type="email" />
        <Button class="text-sm font-semibold">Send Reset Instructions</Button>
      </div>
    </div>
  </div>

  <!--
- reste logo à afficher en haut à gauche
- crédit de la vidéo
- 
--></template>

<script lang="ts" setup>
import Button from '~/components/ui/Button.vue';
import Input from '~/components/ui/Input.vue';
</script>
