<template>
  <div class="comment-item">
    <div class="comment-header">
      <div class="header-left">
        <span class="comment-author">{{ comment.author.login }}</span>
        <span v-if="isCodeComment" class="comment-type-badge">Code</span>
      </div>
      <span class="comment-date">{{ formattedDate }}</span>
    </div>
    <div class="comment-body">
      <template v-for="(segment, index) in parsedBody" :key="index">
        <span v-if="segment.type === 'text'" class="text-segment">{{ segment.content }}</span>
        <CommentImageButton 
          v-else-if="segment.type === 'image'" 
          :url="segment.content"
        />
      </template>
    </div>
    <div v-if="isCodeComment" class="comment-file">
      File: {{ (comment as any).path }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Comment } from '../model/types';
import CommentImageButton from './CommentImageButton.vue';

const props = defineProps<{
  comment: Comment;
}>();

const formattedDate = computed(() => {
  return new Date(props.comment.createdAt).toLocaleDateString();
});

const isCodeComment = computed(() => {
  return !!(props.comment as any).path;
});

interface BodySegment {
  type: 'text' | 'image';
  content: string;
}

// Pre-compiled regex for image matching (moved outside computed for performance)
// Matches markdown images: ![alt](url) and HTML images: <img src="url" ...>
const IMAGE_REGEX = /!\[.*?\]\((.*?)\)|<img\s+[^>]*src=["'](.*?)["'][^>]*>/g;

const parsedBody = computed<BodySegment[]>(() => {
  const text = props.comment.body;
  const segments: BodySegment[] = [];

  IMAGE_REGEX.lastIndex = 0;

  let lastIndex = 0;
  let match;

  while ((match = IMAGE_REGEX.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex, match.index)
      });
    }

    const imageUrl = match[1] || match[2];
    if (imageUrl) {
      segments.push({
        type: 'image',
        content: imageUrl
      });
    }

    lastIndex = IMAGE_REGEX.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.substring(lastIndex)
    });
  }

  return segments;
});
</script>

<style scoped>
.comment-item {
  background: var(--color-surface-primary);
  border-radius: var(--radius-md);
  padding: 10px;
  border: 1px solid var(--color-border-tertiary);
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  min-width: 0;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 11px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.comment-author {
  font-weight: 600;
  color: var(--color-text-primary);
}

.comment-date {
  color: var(--color-text-tertiary);
}

.comment-body {
  color: var(--color-text-secondary);
  line-height: 1.4;
  font-size: 12px;
}

.text-segment {
  white-space: pre-wrap;
}

.comment-type-badge {
  font-size: 9px;
  background: var(--color-surface-secondary);
  padding: 2px 4px;
  border-radius: var(--radius-xs);
  color: var(--color-text-secondary);
}

.comment-file {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
  font-family: var(--font-family-mono);
  word-break: break-all;
}
</style>
