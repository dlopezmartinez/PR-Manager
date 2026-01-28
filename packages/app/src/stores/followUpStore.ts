import { reactive, watch, computed } from 'vue';
import type { PullRequestBasic } from '../model/types';

export interface FollowedPRState {
  commitCount: number;
  commentCount: number;
  reviewCount: number;  // Total reviews (kept for backwards compatibility)
  updatedAt: string;

  // New: Tracking reviews by state
  approvedCount: number;
  changesRequestedCount: number;

  // New: Tracking merge status
  mergeStateStatus: string | null;  // 'CLEAN' | 'BLOCKED' | 'BEHIND' | etc

  // New: For detecting merge
  isMerged: boolean;
}

export interface FollowedPRNotificationPrefs {
  notifyOnCommits: boolean;
  notifyOnComments: boolean;
  notifyOnReviews: boolean;  // Kept for backwards compatibility
  notifyOnApproved: boolean;  // New
  notifyOnChangesRequested: boolean;  // New
  notifyOnWorkflows: boolean;
  notifyOnReadyToMerge: boolean;
  notifyOnMergeStatusChange: boolean;  // New
  notifyOnMerged: boolean;  // New
}

export const DEFAULT_NOTIFICATION_PREFS: FollowedPRNotificationPrefs = {
  notifyOnCommits: true,
  notifyOnComments: true,
  notifyOnReviews: false,  // Deprecated, but kept for backwards compatibility
  notifyOnApproved: true,
  notifyOnChangesRequested: true,
  notifyOnWorkflows: false,
  notifyOnReadyToMerge: true,
  notifyOnMergeStatusChange: false,  // Can be noisy
  notifyOnMerged: true,
};

export interface FollowedPRInfo {
  prId: string;
  prNumber: number;
  repoNameWithOwner: string;
  url: string;
  title: string;
  authorLogin: string;
  authorAvatarUrl: string;
  followedAt: string;
  lastKnownState: FollowedPRState;
  notificationPrefs: FollowedPRNotificationPrefs;
}

interface FollowUpStoreData {
  followedPRs: Record<string, FollowedPRInfo>;
  lastPruned: string;
}

const STORAGE_KEY = 'pr-manager-follow-up';
const MAX_FOLLOWED_PRS = 50;
const PRUNE_AGE_DAYS = 30;
const SAVE_DEBOUNCE_MS = 500;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function loadFollowUpState(): FollowUpStoreData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        followedPRs: data.followedPRs || {},
        lastPruned: data.lastPruned || new Date().toISOString(),
      };
    }
  } catch (e) {
    console.error('Error loading follow-up state:', e);
  }
  return {
    followedPRs: {},
    lastPruned: new Date().toISOString(),
  };
}

function saveFollowUpState(data: FollowUpStoreData): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving follow-up state:', e);
    }
  }, SAVE_DEBOUNCE_MS);
}

function pruneOldEntries(data: FollowUpStoreData): void {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - PRUNE_AGE_DAYS * 24 * 60 * 60 * 1000);
  const entries = Object.entries(data.followedPRs);

  let pruned = 0;
  for (const [prId, info] of entries) {
    const followedDate = new Date(info.followedAt);
    if (followedDate < cutoffDate) {
      delete data.followedPRs[prId];
      pruned++;
    }
  }

  if (pruned > 0) {
    console.log(`FollowUpStore: Pruned ${pruned} old entries`);
  }

  data.lastPruned = now.toISOString();
}

/**
 * Count reviews by state from the reviews array
 */
export interface ReviewCounts {
  total: number;
  approved: number;
  changesRequested: number;
  commented: number;
  dismissed: number;
}

export function countReviewsByState(reviews: Array<{ state?: string }>): ReviewCounts {
  return reviews.reduce((acc, review) => {
    acc.total++;
    switch (review.state) {
      case 'APPROVED':
        acc.approved++;
        break;
      case 'CHANGES_REQUESTED':
        acc.changesRequested++;
        break;
      case 'COMMENTED':
        acc.commented++;
        break;
      case 'DISMISSED':
        acc.dismissed++;
        break;
    }
    return acc;
  }, { total: 0, approved: 0, changesRequested: 0, commented: 0, dismissed: 0 });
}

function extractPRState(pr: PullRequestBasic, mergeStateStatus?: string | null): FollowedPRState {
  // Extract commit count - prefer totalCount from API
  const commitTotalCount = pr.commits?.totalCount;
  const commitNodesLength = pr.commits?.nodes?.length;
  const commitCount = commitTotalCount ?? commitNodesLength ?? 0;

  // Extract comment counts - GitHub has two types of comments:
  // 1. Issue comments (pr.comments) - general PR discussion
  // 2. Review comments (pr.reviews.nodes[].comments) - inline code comments
  const regularComments = pr.comments?.totalCount ?? 0;
  const reviewComments = pr.reviews?.nodes?.reduce(
    (sum, review) => sum + (review.comments?.totalCount ?? 0),
    0
  ) ?? 0;
  const totalComments = regularComments + reviewComments;

  // Extract review counts by state
  const reviewNodes = pr.reviews?.nodes ?? [];
  const reviewCounts = countReviewsByState(reviewNodes);

  console.log('extractPRState for PR #' + pr.number + ':', {
    commitTotalCount,
    commitNodesLength,
    commitCount,
    regularComments,
    reviewComments,
    totalComments,
    reviewCounts,
    mergeStateStatus,
    state: pr.state,
    rawCommits: pr.commits,
    rawComments: pr.comments,
  });

  return {
    commitCount,
    commentCount: totalComments,
    reviewCount: reviewCounts.total,
    approvedCount: reviewCounts.approved,
    changesRequestedCount: reviewCounts.changesRequested,
    mergeStateStatus: mergeStateStatus ?? null,
    isMerged: pr.state === 'MERGED',
    updatedAt: pr.updatedAt,
  };
}

const storeData = reactive<FollowUpStoreData>(loadFollowUpState());

const lastPruned = new Date(storeData.lastPruned);
const now = new Date();
if (now.getTime() - lastPruned.getTime() > 24 * 60 * 60 * 1000) {
  pruneOldEntries(storeData);
  saveFollowUpState(storeData);
}

watch(
  () => ({ ...storeData }),
  (newData) => {
    saveFollowUpState(newData);
  },
  { deep: true }
);

export function followPR(pr: PullRequestBasic, prefs?: Partial<FollowedPRNotificationPrefs>): boolean {
  if (Object.keys(storeData.followedPRs).length >= MAX_FOLLOWED_PRS) {
    console.warn(`Cannot follow more than ${MAX_FOLLOWED_PRS} PRs`);
    return false;
  }

  storeData.followedPRs[pr.id] = {
    prId: pr.id,
    prNumber: pr.number,
    repoNameWithOwner: pr.repository.nameWithOwner,
    url: pr.url,
    title: pr.title,
    authorLogin: pr.author.login,
    authorAvatarUrl: pr.author.avatarUrl,
    followedAt: new Date().toISOString(),
    lastKnownState: extractPRState(pr),
    notificationPrefs: {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...prefs,
    },
  };

  return true;
}

export function updateFollowedPRPrefs(prId: string, prefs: Partial<FollowedPRNotificationPrefs>): void {
  const info = storeData.followedPRs[prId];
  if (info) {
    info.notificationPrefs = {
      ...info.notificationPrefs,
      ...prefs,
    };
  }
}

export function unfollowPR(prId: string): void {
  delete storeData.followedPRs[prId];
}

export function isFollowing(prId: string): boolean {
  return prId in storeData.followedPRs;
}

export function getFollowedPRInfo(prId: string): FollowedPRInfo | undefined {
  return storeData.followedPRs[prId];
}

export function getFollowedPRs(): FollowedPRInfo[] {
  return Object.values(storeData.followedPRs);
}

export function getFollowedPRIds(): string[] {
  return Object.keys(storeData.followedPRs);
}

export function getFollowedCount(): number {
  return Object.keys(storeData.followedPRs).length;
}

export function updatePRState(prId: string, pr: PullRequestBasic, mergeStateStatus?: string | null): void {
  const info = storeData.followedPRs[prId];
  if (info) {
    info.lastKnownState = extractPRState(pr, mergeStateStatus);
    info.title = pr.title;
  }
}

export interface DetectedChanges {
  hasChanges: boolean;
  newCommits: number;
  newComments: number;
  newReviews: number;  // Kept for backwards compatibility
  // New specific review changes
  newApproved: number;
  newChangesRequested: number;
  // Merge status
  mergeStatusChanged: boolean;
  newMergeStatus: string | null;
  // Merged detection
  justMerged: boolean;
}

export function detectChanges(
  prId: string,
  currentPR: PullRequestBasic,
  mergeStateStatus?: string | null
): DetectedChanges {
  const info = storeData.followedPRs[prId];
  if (!info) {
    console.log('FollowUpStore.detectChanges: PR not found in followed list:', prId);
    return {
      hasChanges: false,
      newCommits: 0,
      newComments: 0,
      newReviews: 0,
      newApproved: 0,
      newChangesRequested: 0,
      mergeStatusChanged: false,
      newMergeStatus: null,
      justMerged: false,
    };
  }

  const currentState = extractPRState(currentPR, mergeStateStatus);
  const lastState = info.lastKnownState;

  // Migrate old state if needed (for backwards compatibility)
  const migratedLastState = migrateFollowedPRState(lastState);

  console.log('FollowUpStore.detectChanges: PR #' + info.prNumber);
  console.log('  Current state:', currentState);
  console.log('  Last known state:', migratedLastState);
  console.log('  Raw PR data - comments:', currentPR.comments, 'reviews:', currentPR.reviews);

  const newCommits = Math.max(0, currentState.commitCount - migratedLastState.commitCount);
  const newComments = Math.max(0, currentState.commentCount - migratedLastState.commentCount);
  const newReviews = Math.max(0, currentState.reviewCount - migratedLastState.reviewCount);

  // New: Specific review type changes
  const newApproved = Math.max(0, currentState.approvedCount - migratedLastState.approvedCount);
  const newChangesRequested = Math.max(0, currentState.changesRequestedCount - migratedLastState.changesRequestedCount);

  // Merge status changes
  const mergeStatusChanged = currentState.mergeStateStatus !== migratedLastState.mergeStateStatus;

  // Detect if PR was just merged
  const justMerged = currentState.isMerged && !migratedLastState.isMerged;

  console.log('  Detected changes - commits:', newCommits, 'comments:', newComments, 'reviews:', newReviews);
  console.log('  Review changes - approved:', newApproved, 'changes_requested:', newChangesRequested);
  console.log('  Merge status changed:', mergeStatusChanged, 'new status:', currentState.mergeStateStatus);
  console.log('  Just merged:', justMerged);

  const hasChanges = newCommits > 0 ||
    newComments > 0 ||
    newReviews > 0 ||
    newApproved > 0 ||
    newChangesRequested > 0 ||
    mergeStatusChanged ||
    justMerged;

  return {
    hasChanges,
    newCommits,
    newComments,
    newReviews,
    newApproved,
    newChangesRequested,
    mergeStatusChanged,
    newMergeStatus: currentState.mergeStateStatus,
    justMerged,
  };
}

/**
 * Migrate old state format to new format (for backwards compatibility)
 */
function migrateFollowedPRState(state: Partial<FollowedPRState>): FollowedPRState {
  return {
    commitCount: state.commitCount ?? 0,
    commentCount: state.commentCount ?? 0,
    reviewCount: state.reviewCount ?? 0,
    approvedCount: state.approvedCount ?? 0,
    changesRequestedCount: state.changesRequestedCount ?? 0,
    mergeStateStatus: state.mergeStateStatus ?? null,
    isMerged: state.isMerged ?? false,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Migrate old preferences format to new format (for backwards compatibility)
 */
export function migrateNotificationPrefs(prefs: Partial<FollowedPRNotificationPrefs>): FollowedPRNotificationPrefs {
  return {
    notifyOnCommits: prefs.notifyOnCommits ?? true,
    notifyOnComments: prefs.notifyOnComments ?? true,
    notifyOnReviews: prefs.notifyOnReviews ?? false,
    notifyOnApproved: prefs.notifyOnApproved ?? prefs.notifyOnReviews ?? true,
    notifyOnChangesRequested: prefs.notifyOnChangesRequested ?? prefs.notifyOnReviews ?? true,
    notifyOnWorkflows: prefs.notifyOnWorkflows ?? false,
    notifyOnReadyToMerge: prefs.notifyOnReadyToMerge ?? true,
    notifyOnMergeStatusChange: prefs.notifyOnMergeStatusChange ?? false,
    notifyOnMerged: prefs.notifyOnMerged ?? true,
  };
}

export function removeClosedPR(prId: string): void {
  delete storeData.followedPRs[prId];
}

export function clearAllFollowed(): void {
  storeData.followedPRs = {};
  storeData.lastPruned = new Date().toISOString();
}

export function canFollowMore(): boolean {
  return Object.keys(storeData.followedPRs).length < MAX_FOLLOWED_PRS;
}

export const followedCount = computed(() => Object.keys(storeData.followedPRs).length);

export const followedPRsList = computed(() => Object.values(storeData.followedPRs));

export const followUpStore = storeData;
