<template>
  <span class="unseen-badge" :class="{ pulse: animate }" :title="title"></span>
</template>

<script setup lang="ts">
defineProps<{
  animate?: boolean;
  title?: string;
}>();
</script>

<style scoped>
.unseen-badge {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--color-accent-primary);
  border-radius: 50%;
  flex-shrink: 0;
}

.unseen-badge.pulse {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}
</style>
