<template>
  <a
    href="#"
    class="image-link"
    @click.prevent="openImage"
  >
    <Image :size="14" :stroke-width="2" />
    <span>View Image</span>
  </a>
</template>

<script setup lang="ts">
import { Image } from 'lucide-vue-next';
import { openExternal } from '../utils/electron';
import { uiLogger } from '../utils/logger';

const props = defineProps<{
  url: string;
}>();

function openImage() {
  openExternal(props.url).catch((err: Error) => {
    uiLogger.error('Failed to open image URL', { error: err.message });
  });
}
</script>

<style scoped>
.image-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-accent-primary);
  text-decoration: none;
  background: var(--color-accent-lighter);
  padding: 6px 12px;
  border-radius: var(--radius-xl);
  font-size: 12px;
  font-weight: 500;
  margin: var(--spacing-md) var(--spacing-xs);
  transition: all var(--transition-fast);
  border: 1px solid var(--color-accent-light);
}

.image-link:hover {
  background: var(--color-accent-light);
  transform: translateY(-1px);
}

.image-link:active {
  transform: translateY(0);
  background: var(--color-accent-light);
}
</style>
