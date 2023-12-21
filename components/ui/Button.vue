<template>
    <div>
        <router-link v-if="type==='link' && to" :to="to"><slot></slot></router-link>
        <a v-else-if="type==='link' && href" :href="href"><slot></slot></a>
        <button v-else class="w-40 h-10 rounded-lg text-white bg-purple-950 hover:bg-purple-500 transition"><slot></slot></button>
    </div>

    
</template>

<script lang="ts" setup>

defineProps(
    {
        type: {
            type: String,
            default: "default"
        },
        href: {
            type: String,
            default: ""
        },
        to: {
            type: String,
            default: ""
        }
    }
)

</script>