<template>
  <div class="avatar-wrapper" :style="{ width: size + 'px', height: size + 'px' }">
    <div 
      v-if="!loaded || error" 
      class="avatar-placeholder"
      :style="{ 
        width: size + 'px', 
        height: size + 'px',
        fontSize: (size * 0.45) + 'px',
        backgroundColor: placeholderColor
      }"
    >
      {{ initial }}
    </div>
    <img
      v-show="loaded && !error"
      ref="imgRef"
      :src="src"
      :alt="alt"
      class="avatar-img"
      :style="{ width: size + 'px', height: size + 'px' }"
      @load="onLoad"
      @error="onError"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

interface Props {
  src?: string;
  alt?: string;
  name?: string;
  size?: number;
}

const props = withDefaults(defineProps<Props>(), {
  src: '',
  alt: 'Avatar',
  name: '',
  size: 24,
});

const imgRef = ref<HTMLImageElement | null>(null);
const loaded = ref(false);
const error = ref(false);

let observer: IntersectionObserver | null = null;

const initial = computed(() => {
  return props.name?.charAt(0).toUpperCase() || '?';
});

const placeholderColor = computed(() => {
  const colors = [
    '#007AFF', '#34C759', '#FF9500', '#FF3B30', 
    '#5856D6', '#AF52DE', '#00C7BE', '#FF2D55'
  ];
  const hash = props.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
});

function onLoad() {
  loaded.value = true;
  error.value = false;
}

function onError() {
  error.value = true;
  loaded.value = false;
}

watch(() => props.src, () => {
  loaded.value = false;
  error.value = false;
});

onMounted(() => {
  if (!props.src) return;
  
  if ('IntersectionObserver' in window && imgRef.value) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            observer?.disconnect();
            observer = null;
          }
        });
      },
      { rootMargin: '50px' }
    );
    observer.observe(imgRef.value);
  }
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});
</script>

<style scoped>
.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: white;
  font-weight: 600;
  user-select: none;
}

.avatar-img {
  border-radius: 50%;
  object-fit: cover;
  position: absolute;
  top: 0;
  left: 0;
}
</style>
