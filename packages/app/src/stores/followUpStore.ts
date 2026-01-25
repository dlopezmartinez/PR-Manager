import { reactive, watch, computed } from 'vue';
import type { PullRequestBasic } from '../model/types';

export interface FollowedPRState {
  commitCount: number;
  commentCount: number;
  reviewCount: number;
  updatedAt: string;
}

export interface FollowedPRNotificationPrefs {
  notifyOnCommits: boolean;
  notifyOnComments: boolean;
  notifyOnReviews: boolean;
  notifyOnWorkflows: boolean;
  notifyOnReadyToMerge: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: FollowedPRNotificationPrefs = {
  notifyOnCommits: true,
  notifyOnComments: true,
  notifyOnReviews: true,
  notifyOnWorkflows: false,
  notifyOnReadyToMerge: true,
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

function extractPRState(pr: PullRequestBasic): FollowedPRState {
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

  // Extract review count
  const reviewCount = pr.reviews?.nodes?.length ?? 0;

  console.log('extractPRState for PR #' + pr.number + ':', {
    commitTotalCount,
    commitNodesLength,
    commitCount,
    regularComments,
    reviewComments,
    totalComments,
    reviewCount,
    rawCommits: pr.commits,
    rawComments: pr.comments,
  });

  return {
    commitCount,
    commentCount: totalComments,
    reviewCount,
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

export function updatePRState(prId: string, pr: PullRequestBasic): void {
  const info = storeData.followedPRs[prId];
  if (info) {
    info.lastKnownState = extractPRState(pr);
    info.title = pr.title;
  }
}

export function detectChanges(
  prId: string,
  currentPR: PullRequestBasic
): {
  hasChanges: boolean;
  newCommits: number;
  newComments: number;
  newReviews: number;
} {
  const info = storeData.followedPRs[prId];
  if (!info) {
    console.log('FollowUpStore.detectChanges: PR not found in followed list:', prId);
    return { hasChanges: false, newCommits: 0, newComments: 0, newReviews: 0 };
  }

  const currentState = extractPRState(currentPR);
  const lastState = info.lastKnownState;

  console.log('FollowUpStore.detectChanges: PR #' + info.prNumber);
  console.log('  Current state:', currentState);
  console.log('  Last known state:', lastState);
  console.log('  Raw PR data - comments:', currentPR.comments, 'reviews:', currentPR.reviews);

  const newCommits = Math.max(0, currentState.commitCount - lastState.commitCount);
  const newComments = Math.max(0, currentState.commentCount - lastState.commentCount);
  const newReviews = Math.max(0, currentState.reviewCount - lastState.reviewCount);

  console.log('  Detected changes - commits:', newCommits, 'comments:', newComments, 'reviews:', newReviews);

  return {
    hasChanges: newCommits > 0 || newComments > 0 || newReviews > 0,
    newCommits,
    newComments,
    newReviews,
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
