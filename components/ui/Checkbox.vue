<template>
<div>
    <input type="checkbox" :name="name" class="rounded-sm">
</div>

</template>

<script lang="ts" setup>

defineProps(
    {

        name:{
            type: String,
            required: true
        }
    } 

    )

</script>