<template>
  <div class="relative flex min-h-screen flex-col justify-center overflow-hidden bg-black py-6 sm:py-12">
    <div
      class="relative bg-white px-6 pt-10 pb-8 shadow-xl ring-1 ring-gray-900/5 sm:mx-auto sm:max-w-lg sm:rounded-lg sm:px-10 m-8">

      <div class="flex justify-between gap-4 items-center mb-10">
        <router-link to="/">
          <Logo class="h-16 w-16" />
        </router-link>
        <div class="text-black text-2xl font-black inline-block">Welcome back !</div>
      </div>

      <div class="mb-6">
        <div class="text-black font-semibold">Email</div>
        <label class="relative block">
          <span class="sr-only">Mailinput</span>
          <input
            class="placeholder:italic placeholder:text-slate-400 block bg-white w-full border border-slate-300 rounded-md py-2 pr-3 shadow-sm focus:outline-none focus:border-sky-500 focus:ring-sky-500 focus:ring-1 sm:text-xs"
            placeholder="Enter your email here" type="email" style="color:black" name="emailinput" />
        </label>
      </div>
      <div class="mb-2">
        <div class="text-black font-semibold">Password</div>
        <label class="relative block">
          <span class="sr-only">Pwdinput</span>
          <input
            class="placeholder:italic placeholder:text-slate-400 block bg-white w-full border border-slate-300 rounded-md py-2 pr-3 shadow-sm focus:outline-none focus:border-sky-500 focus:ring-sky-500 focus:ring-1 sm:text-xs"
            placeholder="Enter your password here" type="password" style="color:black" name="pwdinput" />
        </label>
      </div>

      <div class="flex gap-10 text-sm mb-8 justify-between">

        <div class="flex justify gap-1 ml-2 items-center">
          <input type="checkbox" name="Remember" id="1234" class="rounded-sm">
          <div class="text-black">Remember me</div>
        </div>
        <div class="text-black underline underline-offset-1">
          <a href="http://localhost:3000/signup">Forgot password ?</a> <!-- remplacer par le lien définitif-->
        </div>
      </div>


      <div class="flex justify-center mb-1">
        <button class="w-40 h-10 rounded-lg text-white bg-purple-950 hover:bg-purple-500 transition">Login</button>
      </div>

      <div class="flex justify-center gap-1">
        <p class="text-black text-sm">No account yet ?</p>
        <div class="text-black text-sm underline underline-offset-1">
          <a href="http://localhost:3000/signup">Register</a> <!-- remplacer par le lien définitif-->
        </div>
      </div>


    </div>
</div></template>