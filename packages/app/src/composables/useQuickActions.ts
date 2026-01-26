import { ref, computed } from 'vue';
import { useGitProvider } from './useGitProvider';
import { markAsSeen } from '../stores/seenStateStore';
import { configStore } from '../stores/configStore';
import { isPermissionError } from '../utils/http';
import type { PullRequestBasic } from '../model/types';
import type { MergeMethod, ReviewResponse, CommentResponse, MergeResponse } from '../model/mutation-types';

const PERMISSION_ERROR_MESSAGE = 'Insufficient permissions. Your token may not have write access. Please generate a new token with write permissions.';

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (isPermissionError(error)) {
    return PERMISSION_ERROR_MESSAGE;
  }
  return error instanceof Error ? error.message : fallback;
}

export interface QuickActionState {
  loading: boolean;
  error: string | null;
  success: string | null;
}

export function useQuickActions() {
  const github = useGitProvider();

  const loading = ref(false);
  const error = ref<string | null>(null);
  const success = ref<string | null>(null);

  function clearMessages(timeout = 3000) {
    setTimeout(() => {
      error.value = null;
      success.value = null;
    }, timeout);
  }

  async function approve(pr: PullRequestBasic, comment?: string): Promise<ReviewResponse | null> {
    if (loading.value) return null;

    loading.value = true;
    error.value = null;
    success.value = null;

    try {
      const result = await github.actions.approvePullRequest(pr.id, comment);

      if (result.success && result.data) {
        success.value = 'PR approved successfully';
        markAsSeen(pr.id);

        const repoParts = pr.repository.nameWithOwner.split('/');
        if (repoParts.length === 2) {
          github.reviews.clearReviewsCache(repoParts[0], repoParts[1], pr.number);
        }

        clearMessages();
        return result.data;
      } else {
        error.value = result.error || 'Failed to approve PR';
        clearMessages();
        return null;
      }
    } catch (e) {
      error.value = getActionErrorMessage(e, 'Failed to approve PR');
      clearMessages();
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function requestChanges(pr: PullRequestBasic, comment: string): Promise<ReviewResponse | null> {
    if (loading.value) return null;

    if (!comment.trim()) {
      error.value = 'Comment is required when requesting changes';
      clearMessages();
      return null;
    }

    loading.value = true;
    error.value = null;
    success.value = null;

    try {
      const result = await github.actions.requestChanges(pr.id, comment);

      if (result.success && result.data) {
        success.value = 'Changes requested successfully';
        markAsSeen(pr.id);

        const repoParts = pr.repository.nameWithOwner.split('/');
        if (repoParts.length === 2) {
          github.reviews.clearReviewsCache(repoParts[0], repoParts[1], pr.number);
        }

        clearMessages();
        return result.data;
      } else {
        error.value = result.error || 'Failed to request changes';
        clearMessages();
        return null;
      }
    } catch (e) {
      error.value = getActionErrorMessage(e, 'Failed to request changes');
      clearMessages();
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function addComment(pr: PullRequestBasic, comment: string): Promise<CommentResponse | null> {
    if (loading.value) return null;

    if (!comment.trim()) {
      error.value = 'Comment cannot be empty';
      clearMessages();
      return null;
    }

    loading.value = true;
    error.value = null;
    success.value = null;

    try {
      const result = await github.actions.addComment(pr.id, comment);

      if (result.success && result.data) {
        success.value = 'Comment added successfully';
        markAsSeen(pr.id);

        const repoParts = pr.repository.nameWithOwner.split('/');
        if (repoParts.length === 2) {
          github.comments.clearCommentsCache(repoParts[0], repoParts[1], pr.number);
        }

        clearMessages();
        return result.data;
      } else {
        error.value = result.error || 'Failed to add comment';
        clearMessages();
        return null;
      }
    } catch (e) {
      error.value = getActionErrorMessage(e, 'Failed to add comment');
      clearMessages();
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function merge(
    pr: PullRequestBasic,
    options?: {
      mergeMethod?: MergeMethod;
      commitTitle?: string;
      commitBody?: string;
    }
  ): Promise<MergeResponse | null> {
    if (loading.value) return null;

    loading.value = true;
    error.value = null;
    success.value = null;

    try {
      const result = await github.actions.mergePullRequest(pr.id, {
        mergeMethod: options?.mergeMethod || 'SQUASH',
        commitHeadline: options?.commitTitle,
        commitBody: options?.commitBody,
      });

      if (result.success && result.data) {
        success.value = 'PR merged successfully';
        markAsSeen(pr.id);
        clearMessages();
        return result.data;
      } else {
        error.value = result.error || 'Failed to merge PR';
        clearMessages();
        return null;
      }
    } catch (e) {
      error.value = getActionErrorMessage(e, 'Failed to merge PR');
      clearMessages();
      return null;
    } finally {
      loading.value = false;
    }
  }

  function hasWritePermissions(): boolean {
    return configStore.hasWritePermissions;
  }

  function canPerformActions(pr: PullRequestBasic): boolean {
    return pr.state === 'OPEN';
  }

  function canPerformWriteActions(pr: PullRequestBasic): boolean {
    return canPerformActions(pr) && hasWritePermissions();
  }

  function hasAlreadyApproved(pr: PullRequestBasic): boolean {
    const username = configStore.username;
    if (!username) return false;

    return pr.reviews?.nodes?.some(
      (review) => review.author?.login === username && review.state === 'APPROVED'
    ) || false;
  }

  function hasAlreadyRequestedChanges(pr: PullRequestBasic): boolean {
    const username = configStore.username;
    if (!username) return false;

    return pr.reviews?.nodes?.some(
      (review) => review.author?.login === username && review.state === 'CHANGES_REQUESTED'
    ) || false;
  }

  function canApprove(pr: PullRequestBasic): boolean {
    return canPerformWriteActions(pr) && pr.myReviewStatus !== 'author' && !hasAlreadyApproved(pr);
  }

  function canRequestChanges(pr: PullRequestBasic): boolean {
    return canPerformWriteActions(pr) && pr.myReviewStatus !== 'author' && !hasAlreadyRequestedChanges(pr);
  }

  function canComment(): boolean {
    return hasWritePermissions();
  }

  function canMerge(pr: PullRequestBasic): boolean {
    return canPerformWriteActions(pr);
  }

  function mightBeMergeable(pr: PullRequestBasic): boolean {
    if (pr.state !== 'OPEN') return false;
    if (!hasWritePermissions()) return false;
    const checkState = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
    return !checkState || checkState !== 'FAILURE';
  }

  return {
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    success: computed(() => success.value),

    approve,
    requestChanges,
    addComment,
    merge,

    hasWritePermissions,
    canPerformActions,
    canPerformWriteActions,
    canApprove,
    canRequestChanges,
    canComment,
    canMerge,
    mightBeMergeable,
  };
}
