<template>
  <div class="title-bar" :class="{ 'title-bar--macos': isMac }">
    <div class="title-bar__drag-region">
      <div class="title-bar__left">
        <slot name="left"></slot>
      </div>

      <div class="title-bar__center">
        <slot name="center"></slot>
      </div>

      <div class="title-bar__right">
        <slot name="right"></slot>

        <div v-if="showWindowControls" class="window-controls">
          <button
            class="window-control window-control--minimize"
            @click="minimize"
            title="Minimize"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect fill="currentColor" width="10" height="1" x="1" y="6" />
            </svg>
          </button>
          <button
            class="window-control window-control--maximize"
            @click="toggleMaximize"
            :title="isMaximized ? 'Restore' : 'Maximize'"
          >
            <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12">
              <rect stroke="currentColor" fill="none" width="9" height="9" x="1.5" y="1.5" stroke-width="1" />
            </svg>
            <svg v-else width="12" height="12" viewBox="0 0 12 12">
              <rect stroke="currentColor" fill="none" width="7" height="7" x="1" y="4" stroke-width="1" />
              <polyline stroke="currentColor" fill="none" points="4,4 4,1 11,1 11,8 8,8" stroke-width="1" />
            </svg>
          </button>
          <button
            class="window-control window-control--close"
            @click="close"
            title="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path fill="currentColor" d="M6.707 6l3.146-3.146a.5.5 0 00-.707-.708L6 5.293 2.854 2.146a.5.5 0 10-.708.708L5.293 6l-3.147 3.146a.5.5 0 00.708.708L6 6.707l3.146 3.147a.5.5 0 00.708-.708L6.707 6z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getPlatform, sendIpc } from '../utils/electron';

const isMac = computed(() => getPlatform() === 'darwin');
const showWindowControls = computed(() => !isMac.value);
const isMaximized = ref(false);

function minimize() {
  sendIpc('window-minimize');
}

function toggleMaximize() {
  sendIpc('window-toggle-maximize');
}

function close() {
  sendIpc('hide-window');
}

function handleMaximizeChange(_event: Event, maximized: boolean) {
  isMaximized.value = maximized;
}

onMounted(() => {
});

onUnmounted(() => {
});
</script>

<style scoped>
.title-bar {
  height: 40px;
  flex-shrink: 0;
  background: var(--color-titlebar-bg, var(--color-bg-secondary));
  border-bottom: 1px solid var(--color-titlebar-border, var(--color-border-secondary));
  user-select: none;
}

.title-bar--macos {
  padding-left: 78px;
}

.title-bar__drag-region {
  -webkit-app-region: drag;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}

.title-bar__left,
.title-bar__center,
.title-bar__right {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.title-bar__left {
  flex: 0 0 auto;
}

.title-bar__center {
  flex: 1 1 auto;
  justify-content: center;
}

.title-bar__right {
  flex: 0 0 auto;
}

.window-controls {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.window-control {
  width: 46px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.window-control:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.window-control--close:hover {
  background: #e81123;
  color: white;
}

.window-control:active {
  background: var(--color-surface-active);
}

.window-control--close:active {
  background: #bf0f1d;
}

.window-control svg {
  display: block;
}
</style>
