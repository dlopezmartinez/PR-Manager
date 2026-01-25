<template>
  <div
    class="pr-card"
    :class="{ 'is-expanded': isExpanded || isCommentsExpanded || isDetailsExpanded || showCommentExpansion }"
    @click="handleCardClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    role="link"
    tabindex="0"
    @keydown.enter="handleCardClick"
  >
    <UnseenBadge
      v-if="!isSeen(pr.id)"
      class="unseen-indicator"
      :animate="true"
      title="New PR"
    />

    <div class="pr-header">
      <div class="title-container">
        <h3>{{ pr.title }}</h3>
        <span class="pr-number">#{{ pr.number }}</span>
      </div>
      <div class="header-right">
        <QuickActionsBar
          v-if="showQuickActions && pr.state === 'OPEN'"
          class="quick-actions"
          :show-approve="canApprove"
          :show-request-changes="canRequestChanges"
          :loading="actionLoading"
          @approve="handleApprove"
          @request-changes="handleRequestChanges"
          @comment="handleComment"
        />
        <div class="status-badges">
          <span
            v-if="pr.myReviewStatus && pr.myReviewStatus !== 'none'"
            :class="['review-status', pr.myReviewStatus]"
            :title="reviewStatusTitle"
          >
            <component :is="reviewStatusIcon" :size="12" :stroke-width="2.5" />
          </span>
          <span :class="['status', pr.state.toLowerCase()]">
            {{ pr.state }}
          </span>
        </div>
      </div>
    </div>

    <p class="repo">
      <BookOpen :size="14" :stroke-width="2" class="repo-icon" />
      {{ pr.repository.nameWithOwner }}
    </p>

    <div class="pr-meta">
      <div class="author">
        <LazyAvatar
          :src="pr.author.avatarUrl"
          :name="pr.author.login"
          :size="24"
          alt="Author avatar"
        />
        {{ pr.author.login }}
      </div>

      <div class="meta-items">
        <span
          class="meta-item follow-up"
          :class="{ 'is-following': isFollowingPR }"
          :title="followUpTitle"
          @click="(event) => toggleFollowUp(event as MouseEvent)"
        >
          <component :is="isFollowingPR ? Bell : BellOff" :size="14" :stroke-width="2" class="icon" />
        </span>

        <span
          class="meta-item details"
          title="Show details"
          @click="(event) => toggleDetailsExpand(event as MouseEvent)"
        >
          <Info :size="14" :stroke-width="2" class="icon" />
          <ChevronDown :size="10" :stroke-width="2" class="expand-icon" :class="{ expanded: isDetailsExpanded }" />
        </span>

        <span
          v-if="showComments && commentsCount > 0"
          class="meta-item comments"
          title="Comments"
          @click="(event) => toggleCommentsExpand(event as MouseEvent)"
        >
          <MessageSquare :size="14" :stroke-width="2" class="icon" />
          <span class="count">{{ commentsCount }}</span>
          <ChevronDown v-if="allowCommentsExpansion" :size="10" :stroke-width="2" class="expand-icon" :class="{ expanded: isCommentsExpanded }" />
        </span>

        <span
          v-if="showChecks && pr.commits?.nodes?.[0]?.commit?.statusCheckRollup"
          class="meta-item checks"
          :class="getCheckStatusClass(pr.commits.nodes[0].commit.statusCheckRollup.state)"
          :title="getCheckStatusTitle(pr.commits.nodes[0].commit.statusCheckRollup.state)"
          @click="(event) => toggleExpand(event as MouseEvent)"
        >
          <component :is="getCheckStatusIcon(pr.commits.nodes[0].commit.statusCheckRollup.state)" :size="14" :stroke-width="2" class="icon" />
          <ChevronDown v-if="allowChecksExpansion" :size="10" :stroke-width="2" class="expand-icon" :class="{ expanded: isExpanded }" />
        </span>
      </div>
    </div>

    <div v-if="isDetailsExpanded" class="details-expansion" @click.stop>
      <div class="details-grid">
        <div v-if="diffStats" class="detail-item">
          <BarChart3 :size="14" :stroke-width="2" class="detail-icon" />
          <span class="detail-text">{{ diffStats }}</span>
        </div>

        <div v-if="branchInfo" class="detail-item">
          <GitMerge :size="14" :stroke-width="2" class="detail-icon" />
          <span class="detail-text branch-info">{{ branchInfo }}</span>
        </div>

        <div v-if="reviewersList.length > 0" class="detail-item reviewers-item">
          <Users :size="14" :stroke-width="2" class="detail-icon" />
          <div class="reviewers-list">
            <span
              v-for="reviewer in reviewersList"
              :key="reviewer.login"
              class="reviewer"
              :class="reviewer.state.toLowerCase()"
              :title="`${reviewer.login}: ${reviewer.state}`"
            >
              <component :is="getReviewerIcon(reviewer.state)" :size="12" :stroke-width="2" />
              {{ reviewer.login }}
            </span>
          </div>
        </div>

        <div class="detail-item">
          <Clock :size="14" :stroke-width="2" class="detail-icon" />
          <span class="detail-text">Updated {{ updatedAgo }}</span>
        </div>
      </div>
    </div>

    <div v-if="isCommentsExpanded" class="comments-details" @click.stop>
      <div v-if="loadingComments" class="loading-comments">
        Loading comments...
      </div>
      <div v-else-if="commentsList && commentsList.length > 0" class="comments-list">
        <CommentItem
          v-for="comment in commentsList"
          :key="comment.id"
          :comment="comment"
        />
      </div>
      <div v-else class="no-comments">
        No comments available.
      </div>
    </div>

    <div v-if="isExpanded" class="checks-details" @click.stop>
      <div v-if="loadingChecks" class="loading-checks">
        Loading checks...
      </div>
      <div v-else-if="checksContexts && checksContexts.length > 0" class="checks-list">
        <CheckItem
          v-for="check in checksContexts"
          :key="check.id"
          :check="check"
        />
      </div>
      <div v-else class="no-checks">
        No detailed checks available.
      </div>
    </div>

    <div v-if="showCommentExpansion" class="comment-expansion" @click.stop>
      <div class="comment-header">
        <span class="comment-title">{{ commentActionTitle }}</span>
        <button class="close-btn" @click="closeCommentExpansion" title="Cancel">
          <X :size="14" :stroke-width="2" />
        </button>
      </div>

      <textarea
        ref="commentTextarea"
        v-model="commentText"
        :placeholder="commentPlaceholder"
        class="comment-textarea"
        rows="4"
        :disabled="actionLoading"
      />

      <div class="comment-footer">
        <span v-if="commentModalType === 'request-changes'" class="required-note">
          * Comment required
        </span>
        <div class="comment-actions">
          <button
            class="cancel-btn"
            @click="closeCommentExpansion"
            :disabled="actionLoading"
          >
            Cancel
          </button>
          <button
            class="submit-btn"
            @click="handleCommentSubmitClick"
            :disabled="actionLoading || (commentModalType === 'request-changes' && !commentText.trim())"
            :class="commentActionClass"
          >
            <span v-if="actionLoading" class="loading-spinner"></span>
            <span v-else>{{ commentActionLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { PullRequestBasic } from '../model/types';
import { openExternal } from '../utils/electron';
import { isSeen, markAsSeen } from '../stores/seenStateStore';
import { isFollowing, followPR, unfollowPR, canFollowMore } from '../stores/followUpStore';
import { useQuickActions } from '../composables/useQuickActions';
import CommentItem from './CommentItem.vue';
import CheckItem from './CheckItem.vue';
import LazyAvatar from './LazyAvatar.vue';
import UnseenBadge from './UnseenBadge.vue';
import QuickActionsBar from './QuickActionsBar.vue';
import {
  BookOpen,
  Info,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  BarChart3,
  GitMerge,
  Users,
  Check,
  X,
  MessageCircle,
  Circle,
  Pencil,
  Bell,
  BellOff
} from 'lucide-vue-next';

interface Props {
  pr: PullRequestBasic;
  showComments?: boolean;
  showChecks?: boolean;
  allowCommentsExpansion?: boolean;
  allowChecksExpansion?: boolean;
  showQuickActions?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showComments: true,
  showChecks: true,
  allowCommentsExpansion: true,
  allowChecksExpansion: true,
  showQuickActions: true
});

const showComments = computed(() => props.showComments);
const showChecks = computed(() => props.showChecks);
const allowCommentsExpansion = computed(() => props.allowCommentsExpansion);
const allowChecksExpansion = computed(() => props.allowChecksExpansion);

const emit = defineEmits<{
  (e: 'click', pr: PullRequestBasic): void;
  (e: 'toggle-expand', pr: PullRequestBasic): void;
  (e: 'toggle-expand-comments', pr: PullRequestBasic): void;
  (e: 'prefetch', pr: PullRequestBasic): void;
  (e: 'prefetch-cancel'): void;
  (e: 'action-completed', pr: PullRequestBasic, action: string): void;
}>();

const {
  loading: actionLoading,
  approve,
  requestChanges,
  addComment,
  canApprove: canApproveCheck,
  canRequestChanges: canRequestChangesCheck,
} = useQuickActions();

const isExpanded = ref(false);
const isCommentsExpanded = ref(false);
const isDetailsExpanded = ref(false);
const showCommentExpansion = ref(false);
const commentModalType = ref<'approve' | 'request-changes' | 'comment'>('comment');
const commentText = ref('');
const commentTextarea = ref<HTMLTextAreaElement | null>(null);

const checksContexts = computed(() => {
  return props.pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes;
});

const commentsList = computed(() => {
  return props.pr.comments?.nodes;
});

const loadingChecks = computed(() => {
  return isExpanded.value && !checksContexts.value;
});

const commentsCount = computed(() => {
  const issueComments = props.pr.comments?.totalCount || 0;
  const reviewComments = props.pr.reviews?.nodes?.reduce((acc, review) => acc + review.comments.totalCount, 0) || 0;
  return issueComments + reviewComments;
});

const reviewStatusIcon = computed(() => {
  switch (props.pr.myReviewStatus) {
    case 'author': return Pencil;
    case 'reviewed': return Check;
    case 'pending': return Circle;
    default: return null;
  }
});

const reviewStatusTitle = computed(() => {
  switch (props.pr.myReviewStatus) {
    case 'author': return 'You are the author';
    case 'reviewed': return 'You have reviewed this PR';
    case 'pending': return 'Review requested';
    default: return '';
  }
});

const loadingComments = computed(() => {
  return isCommentsExpanded.value && !commentsList.value;
});

const canApprove = computed(() => canApproveCheck(props.pr));
const canRequestChanges = computed(() => canRequestChangesCheck(props.pr));

const isFollowingPR = computed(() => isFollowing(props.pr.id));
const followUpTitle = computed(() => {
  if (isFollowingPR.value) {
    return 'Stop following this PR';
  }
  return canFollowMore() ? 'Follow this PR for updates' : 'Maximum followed PRs reached';
});

const diffStats = computed(() => {
  const pr = props.pr as any;
  if (pr.additions === undefined && pr.deletions === undefined) return null;

  const files = pr.changedFiles || 0;
  const additions = pr.additions || 0;
  const deletions = pr.deletions || 0;

  return `${files} file${files !== 1 ? 's' : ''} changed • +${additions} -${deletions}`;
});

const branchInfo = computed(() => {
  const pr = props.pr as any;
  if (!pr.headRefName || !pr.baseRefName) return null;

  const maxLen = 30;
  const head = pr.headRefName.length > maxLen
    ? pr.headRefName.substring(0, maxLen) + '...'
    : pr.headRefName;
  const base = pr.baseRefName.length > maxLen
    ? pr.baseRefName.substring(0, maxLen) + '...'
    : pr.baseRefName;

  return `${head} → ${base}`;
});

interface ReviewerInfo {
  login: string;
  state: string;
}

let lastReviewersResult: { prId: string; reviewers: ReviewerInfo[] } | null = null;

function getReviewStatePriority(state: string): number {
  switch (state) {
    case 'APPROVED': return 4;
    case 'CHANGES_REQUESTED': return 3;
    case 'COMMENTED': return 2;
    case 'PENDING': return 1;
    case 'DISMISSED': return 0;
    default: return 1;
  }
}

const reviewersList = computed((): ReviewerInfo[] => {
  const pr = props.pr;

  if (lastReviewersResult?.prId === pr.id) {
    return lastReviewersResult.reviewers;
  }

  const reviewerStates = new Map<string, string>();

  if ((pr as any).reviews?.nodes) {
    for (const review of (pr as any).reviews.nodes) {
      const login = review.author?.login;
      const state = review.state || 'PENDING';

      if (login && login !== pr.author.login) {
        const existingState = reviewerStates.get(login);

        if (!existingState) {
          reviewerStates.set(login, state);
        } else {
          const existingPriority = getReviewStatePriority(existingState);
          const newPriority = getReviewStatePriority(state);

          if (newPriority >= existingPriority) {
            reviewerStates.set(login, state);
          }
        }
      }
    }
  }

  if (pr.reviewRequests?.nodes) {
    for (const request of pr.reviewRequests.nodes) {
      const reviewer = request.requestedReviewer;
      const login = reviewer.login || reviewer.name || 'Unknown';

      if (login && login !== pr.author.login && !reviewerStates.has(login)) {
        reviewerStates.set(login, 'PENDING');
      }
    }
  }

  // Convert map to array
  const reviewers: ReviewerInfo[] = Array.from(reviewerStates.entries()).map(
    ([login, state]) => ({ login, state })
  );

  lastReviewersResult = { prId: pr.id, reviewers };
  return reviewers;
});

const updatedAgo = computed(() => {
  const updated = new Date(props.pr.updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return updated.toLocaleDateString();
});

function getReviewerIcon(state: string) {
  switch (state) {
    case 'APPROVED': return Check;
    case 'CHANGES_REQUESTED': return X;
    case 'COMMENTED': return MessageCircle;
    case 'PENDING': return Circle;
    default: return Circle;
  }
}

// Handlers
function handleCardClick(event: MouseEvent) {
  // Don't navigate if clicking on interactive elements
  const target = event.target as HTMLElement;

  // Check if clicking on meta-items (details, comments, checks) or quick actions
  const isInteractiveArea =
    target.closest('.meta-item') ||
    target.closest('.quick-actions') ||
    target.closest('.status-badges') ||
    target.closest('.details-expansion') ||
    target.closest('.comments-details') ||
    target.closest('.checks-details') ||
    target.closest('.comment-expansion') ||
    (target.tagName === 'BUTTON' && target.closest('.pr-card'));

  if (isInteractiveArea) {
    return;
  }

  markAsSeen(props.pr.id);
  openExternal(props.pr.url).catch((err) => {
    console.error('Failed to open PR URL:', err);
  });
}

function toggleFollowUp(event?: MouseEvent) {
  event?.stopPropagation();
  if (isFollowingPR.value) {
    unfollowPR(props.pr.id);
  } else {
    followPR(props.pr);
  }
}

function toggleDetailsExpand(event?: MouseEvent) {
  event?.stopPropagation();
  isDetailsExpanded.value = !isDetailsExpanded.value;
  if (isDetailsExpanded.value) {
    markAsSeen(props.pr.id);
  }
}

function toggleExpand(event?: MouseEvent) {
  event?.stopPropagation();
  if (!props.allowChecksExpansion) return;
  isExpanded.value = !isExpanded.value;
  if (isExpanded.value) {
    markAsSeen(props.pr.id);
    if (!checksContexts.value) {
      emit('toggle-expand', props.pr);
    }
  }
}

function toggleCommentsExpand(event?: MouseEvent) {
  event?.stopPropagation();
  if (!props.allowCommentsExpansion) return;
  isCommentsExpanded.value = !isCommentsExpanded.value;
  if (isCommentsExpanded.value) {
    markAsSeen(props.pr.id);
    if (!commentsList.value) {
      emit('toggle-expand-comments', props.pr);
    }
  }
}

function getCheckStatusIcon(state: string) {
  switch (state) {
    case 'SUCCESS': return CheckCircle2;
    case 'FAILURE': return XCircle;
    case 'PENDING': return Clock;
    default: return Circle;
  }
}

function getCheckStatusClass(state: string) {
  switch (state) {
    case 'SUCCESS': return 'status-success';
    case 'FAILURE': return 'status-failure';
    case 'PENDING': return 'status-pending';
    case 'ERROR': return 'status-failure';
    default: return 'status-pending';
  }
}

function getCheckStatusTitle(state: string) {
  switch (state) {
    case 'SUCCESS': return 'All checks passed';
    case 'FAILURE': return 'Some checks failed';
    case 'PENDING': return 'Checks in progress';
    case 'ERROR': return 'Checks encountered an error';
    default: return 'Checks status unknown';
  }
}

function handleMouseEnter() {
  const hasComments = commentsCount.value > 0 && !commentsList.value;
  const hasChecks = !!props.pr.commits?.nodes?.[0]?.commit?.statusCheckRollup && !checksContexts.value;

  if (hasComments || hasChecks) {
    emit('prefetch', props.pr);
  }
}

function handleMouseLeave() {
  emit('prefetch-cancel');
}

const commentActionTitle = computed(() => {
  switch (commentModalType.value) {
    case 'approve':
      return 'Approve Pull Request';
    case 'request-changes':
      return 'Request Changes';
    case 'comment':
      return 'Add Comment';
    default:
      return 'Comment';
  }
});

const commentPlaceholder = computed(() => {
  switch (commentModalType.value) {
    case 'approve':
      return 'Optional: Add a comment with your approval...';
    case 'request-changes':
      return 'What needs to be changed? (required)';
    case 'comment':
      return 'Write your comment...';
    default:
      return 'Write a comment...';
  }
});

const commentActionLabel = computed(() => {
  switch (commentModalType.value) {
    case 'approve':
      return 'Approve';
    case 'request-changes':
      return 'Request Changes';
    case 'comment':
      return 'Comment';
    default:
      return 'Submit';
  }
});

const commentActionClass = computed(() => {
  switch (commentModalType.value) {
    case 'approve':
      return 'approve';
    case 'request-changes':
      return 'request-changes';
    case 'comment':
      return 'comment';
    default:
      return '';
  }
});

function handleApprove() {
  commentModalType.value = 'approve';
  commentText.value = '';
  showCommentExpansion.value = true;
  // Close other expansions
  isDetailsExpanded.value = false;
  isCommentsExpanded.value = false;
  isExpanded.value = false;
  // Focus textarea
  nextTick(() => {
    commentTextarea.value?.focus();
  });
}

function handleRequestChanges() {
  commentModalType.value = 'request-changes';
  commentText.value = '';
  showCommentExpansion.value = true;
  isDetailsExpanded.value = false;
  isCommentsExpanded.value = false;
  isExpanded.value = false;
  nextTick(() => {
    commentTextarea.value?.focus();
  });
}

function handleComment() {
  commentModalType.value = 'comment';
  commentText.value = '';
  showCommentExpansion.value = true;
  isDetailsExpanded.value = false;
  isCommentsExpanded.value = false;
  isExpanded.value = false;
  nextTick(() => {
    commentTextarea.value?.focus();
  });
}

function closeCommentExpansion() {
  showCommentExpansion.value = false;
  commentText.value = '';
}

async function handleCommentSubmitClick() {
  const comment = commentText.value.trim();

  if (commentModalType.value === 'request-changes' && !comment) {
    return;
  }

  let success = false;

  switch (commentModalType.value) {
    case 'approve':
      success = !!(await approve(props.pr, comment || undefined));
      break;
    case 'request-changes':
      success = !!(await requestChanges(props.pr, comment));
      break;
    case 'comment':
      success = !!(await addComment(props.pr, comment));
      break;
  }

  if (success) {
    closeCommentExpansion();
    emit('action-completed', props.pr, commentModalType.value);
  }
}
</script>

<style scoped>
.pr-card {
  position: relative;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  border: 1px solid var(--color-border-secondary);
  box-shadow: var(--shadow-sm-themed);
  outline: none;
}

.pr-card:focus-visible {
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 2px var(--color-accent-light);
}

.pr-card:hover {
  background: var(--color-bg-elevated);
  border-color: var(--color-border-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.10);
  transform: translateY(-2px);
}

.pr-card:active {
  transform: scale(0.99);
}

.pr-card.is-expanded:hover {
  transform: none;
}

.pr-card.is-expanded:active {
  transform: none;
}

.unseen-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
}

.quick-actions {
  opacity: 0.4;
  pointer-events: auto;
  transition: opacity 0.2s ease;
}

.pr-card:hover .quick-actions {
  opacity: 1;
}

.pr-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.title-container {
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex: 1;
  margin-right: var(--spacing-sm);
  padding-left: 16px; /* Space for unseen badge */
}

h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.3;
}

.pr-number {
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-weight: 400;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.repo {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin: 0 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding-left: 16px; /* Align with title */
}

.repo-icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.pr-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--color-border-tertiary);
}

.author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-primary);
  font-weight: 500;
}

.meta-items {
  display: flex;
  gap: var(--spacing-sm);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-surface-primary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.meta-item .icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.meta-item.comments .icon {
  color: var(--color-accent-primary);
}

.meta-item.follow-up {
  opacity: 0.6;
  transition: opacity var(--transition-fast), background-color var(--transition-fast);
}

.meta-item.follow-up:hover {
  opacity: 1;
}

.meta-item.follow-up.is-following {
  opacity: 1;
  background: var(--color-accent-light);
}

.meta-item.follow-up.is-following .icon {
  color: var(--color-accent-primary);
}

.meta-item.checks.status-success {
  background: var(--color-success-bg);
}

.meta-item.checks.status-success .icon {
  color: var(--color-success);
}

.meta-item.checks.status-failure {
  background: var(--color-error-bg);
}

.meta-item.checks.status-failure .icon {
  color: var(--color-error);
}

.meta-item.checks.status-pending {
  background: var(--color-warning-bg);
}

.meta-item.checks.status-pending .icon {
  color: var(--color-warning);
}

.meta-item.checks .icon {
  flex-shrink: 0;
}

.meta-item .count {
  font-weight: 500;
  color: var(--color-text-primary);
}

.meta-item:hover {
  background: var(--color-surface-hover);
}

.meta-item:hover .icon {
  color: var(--color-text-secondary);
}

.expand-icon {
  color: var(--color-text-tertiary);
  margin-left: 2px;
  transition: transform var(--transition-fast);
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.details-expansion {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-surface-primary);
  border-radius: var(--radius-md);
  animation: slideDown 0.2s ease-out;
}

.details-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.detail-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 12px;
}

.detail-icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.detail-text {
  color: var(--color-text-primary);
}

.branch-info {
  font-family: var(--font-family-mono, monospace);
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-surface-secondary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.reviewers-item {
  align-items: flex-start;
}

.reviewers-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reviewer {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
}

.reviewer svg {
  flex-shrink: 0;
}

.reviewer.approved {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.reviewer.changes_requested {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.reviewer.commented {
  background: var(--color-accent-light);
  color: var(--color-accent-primary);
}

.reviewer.pending {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.checks-details, .comments-details {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--color-border-tertiary);
  font-size: 12px;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.loading-checks, .loading-comments {
  color: var(--color-text-tertiary);
  font-style: italic;
  text-align: center;
  padding: var(--spacing-sm);
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.no-comments {
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--spacing-sm);
}

.checks-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status {
  padding: var(--spacing-xs) 10px;
  border-radius: var(--radius-xl);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status.open {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}

.status.merged {
  background-color: rgba(191, 90, 242, 0.20);
  color: var(--color-pr-merged);
}

.status.closed {
  background-color: var(--color-error-bg);
  color: var(--color-error);
}

.status-badges {
  display: flex;
  gap: 6px;
  align-items: center;
}

.review-status {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-xl);
  font-size: 11px;
  font-weight: 600;
}

.review-status.author {
  background-color: rgba(88, 86, 214, 0.20);
  color: #7d7aff;
}

.review-status.reviewed {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}

.review-status.pending {
  background-color: var(--color-warning-bg);
  color: var(--color-warning);
}

.comment-expansion {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-surface-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-secondary);
  animation: slideDown 0.2s ease-out;
}

.comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.comment-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.comment-textarea {
  width: 100%;
  min-height: 80px;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 12px;
  font-family: var(--font-family);
  resize: vertical;
  transition: border-color var(--transition-fast);
  margin-bottom: var(--spacing-sm);
}

.comment-textarea:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 3px var(--color-accent-light);
}

.comment-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.comment-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.comment-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.required-note {
  font-size: 11px;
  color: var(--color-error);
  font-style: italic;
}

.comment-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-left: auto;
}

.cancel-btn,
.submit-btn {
  padding: 6px 16px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 80px;
}

.cancel-btn {
  background: var(--color-surface-secondary);
  color: var(--color-text-secondary);
}

.cancel-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.submit-btn {
  background: var(--color-accent-primary);
  color: white;
}

.submit-btn:hover:not(:disabled) {
  background: var(--color-accent-hover);
  transform: translateY(-1px);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn.approve {
  background: var(--color-success);
}

.submit-btn.approve:hover:not(:disabled) {
  background: var(--color-success-hover, #059669);
}

.submit-btn.request-changes {
  background: var(--color-error);
}

.submit-btn.request-changes:hover:not(:disabled) {
  background: var(--color-error-hover, #dc2626);
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
