<template>
  <div :class="['safe-html', className]">
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-html="sanitizedContent" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { sanitizeHtml, wasSanitized } from '@/utils/sanitize';

interface Props {
  /**
   * Raw HTML content (potentially untrusted from user input)
   * Will be sanitized before rendering
   */
  content: string;
  /**
   * CSS class name to apply to wrapper div
   */
  className?: string;
  /**
   * Emit warning if content was sanitized (removed dangerous code)
   */
  onSanitized?: (wasSanitized: boolean) => void;
}

const props = withDefaults(defineProps<Props>(), {
  className: '',
});

const sanitizedContent = computed(() => {
  const sanitized = sanitizeHtml(props.content);
  const changed = wasSanitized(props.content, sanitized);
  if (changed && props.onSanitized) {
    props.onSanitized(true);
  }
  return sanitized;
});
</script>

<style scoped>
.safe-html {
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.safe-html :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.safe-html :deep(a) {
  color: #0ea5e9;
  text-decoration: underline;
  cursor: pointer;
}

.safe-html :deep(a:hover) {
  text-decoration-thickness: 2px;
}

.safe-html :deep(code) {
  background-color: #f3f4f6;
  color: #374151;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: 'Courier New', 'Monaco', monospace;
  font-size: 0.9em;
}

.safe-html :deep(pre) {
  background-color: #1f2937;
  color: #f3f4f6;
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  line-height: 1.5;
  font-family: 'Courier New', 'Monaco', monospace;
  font-size: 0.9em;
}

.safe-html :deep(pre code) {
  background-color: transparent;
  color: inherit;
  padding: 0;
  border-radius: 0;
}

.safe-html :deep(blockquote) {
  border-left: 4px solid #d1d5db;
  padding-left: 1em;
  margin-left: 0;
  margin-right: 0;
  color: #6b7280;
  font-style: italic;
}

.safe-html :deep(ul),
.safe-html :deep(ol) {
  margin: 0.5em 0;
  padding-left: 2em;
}

.safe-html :deep(li) {
  margin: 0.25em 0;
}

.safe-html :deep(h1) {
  font-size: 1.875em;
  font-weight: bold;
  margin: 0.5em 0;
}

.safe-html :deep(h2) {
  font-size: 1.5em;
  font-weight: bold;
  margin: 0.4em 0;
}

.safe-html :deep(h3) {
  font-size: 1.25em;
  font-weight: bold;
  margin: 0.3em 0;
}

.safe-html :deep(h4),
.safe-html :deep(h5),
.safe-html :deep(h6) {
  font-weight: bold;
  margin: 0.25em 0;
}

.safe-html :deep(hr) {
  border: none;
  border-top: 1px solid #d1d5db;
  margin: 1em 0;
}

.safe-html :deep(p) {
  margin: 0.5em 0;
  line-height: 1.6;
}

.safe-html :deep(strong),
.safe-html :deep(b) {
  font-weight: bold;
}

.safe-html :deep(em),
.safe-html :deep(i) {
  font-style: italic;
}
</style>
