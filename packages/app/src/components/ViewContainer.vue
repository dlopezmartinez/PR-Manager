<template>
  <div class="view-container">
    <PullRequestList
      :prs="prs"
      :page-info="pageInfo"
      :loading="loading"
      :show-comments="showComments"
      :show-checks="showChecks"
      :allow-comments-expansion="allowCommentsExpansion"
      :allow-checks-expansion="allowChecksExpansion"
      @select="$emit('select', $event)"
      @load-more="$emit('load-more')"
      @toggle-expand="$emit('toggle-expand', $event)"
      @toggle-expand-comments="$emit('toggle-expand-comments', $event)"
      @prefetch="$emit('prefetch', $event)"
      @prefetch-cancel="$emit('prefetch-cancel')"
    />
  </div>
</template>

<script setup lang="ts">
import PullRequestList from './PullRequestList.vue';
import type { PullRequestBasic, PageInfo } from '../model/types';

defineProps<{
  prs: PullRequestBasic[];
  pageInfo: PageInfo;
  loading: boolean;
  showComments?: boolean;
  showChecks?: boolean;
  allowCommentsExpansion?: boolean;
  allowChecksExpansion?: boolean;
}>();

defineEmits<{
  (e: 'select', pr: PullRequestBasic): void;
  (e: 'load-more'): void;
  (e: 'toggle-expand', pr: PullRequestBasic): void;
  (e: 'toggle-expand-comments', pr: PullRequestBasic): void;
  (e: 'prefetch', pr: PullRequestBasic): void;
  (e: 'prefetch-cancel'): void;
}>();
</script>

<style scoped>
.view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
</style>
