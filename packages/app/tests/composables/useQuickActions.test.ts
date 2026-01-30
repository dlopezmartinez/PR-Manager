/**
 * Tests for useQuickActions.ts
 * Tests write permission checks and action availability
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PullRequestBasic } from '../../src/model/types';

// Mock the useGitProvider composable
vi.mock('../../src/composables/useGitProvider', () => ({
  useGitProvider: () => ({
    actions: {
      approvePullRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
      requestChanges: vi.fn().mockResolvedValue({ success: true, data: {} }),
      addComment: vi.fn().mockResolvedValue({ success: true, data: {} }),
      mergePullRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
    },
    reviews: {
      clearReviewsCache: vi.fn(),
    },
    comments: {
      clearCommentsCache: vi.fn(),
    },
  }),
}));

// Mock the seenStateStore
vi.mock('../../src/stores/seenStateStore', () => ({
  markAsSeen: vi.fn(),
}));

let configStore: typeof import('../../src/stores/configStore');
let useQuickActions: typeof import('../../src/composables/useQuickActions').useQuickActions;

function createMockPR(overrides: Partial<PullRequestBasic> = {}): PullRequestBasic {
  return {
    id: 'PR_1',
    number: 1,
    title: 'Test PR',
    state: 'OPEN',
    url: 'https://github.com/test/repo/pull/1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: { login: 'author', avatarUrl: '' },
    repository: { nameWithOwner: 'test/repo' },
    headRefName: 'feature-branch',
    baseRefName: 'main',
    isDraft: false,
    mergeable: 'MERGEABLE',
    additions: 10,
    deletions: 5,
    totalCommentsCount: 0,
    myReviewStatus: 'pending',
    reviews: { nodes: [] },
    commits: { nodes: [] },
    ...overrides,
  } as PullRequestBasic;
}

describe('useQuickActions', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.resetModules();

    configStore = await import('../../src/stores/configStore');
    const quickActionsModule = await import('../../src/composables/useQuickActions');
    useQuickActions = quickActionsModule.useQuickActions;
  });

  describe('hasWritePermissions', () => {
    it('should return true when write permissions are enabled', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const { hasWritePermissions } = useQuickActions();
      expect(hasWritePermissions()).toBe(true);
    });

    it('should return false when write permissions are disabled', () => {
      configStore.updateConfig({ hasWritePermissions: false });
      const { hasWritePermissions } = useQuickActions();
      expect(hasWritePermissions()).toBe(false);
    });
  });

  describe('canPerformActions', () => {
    it('should return true for open PRs', () => {
      const pr = createMockPR({ state: 'OPEN' });
      const { canPerformActions } = useQuickActions();
      expect(canPerformActions(pr)).toBe(true);
    });

    it('should return false for closed PRs', () => {
      const pr = createMockPR({ state: 'CLOSED' });
      const { canPerformActions } = useQuickActions();
      expect(canPerformActions(pr)).toBe(false);
    });

    it('should return false for merged PRs', () => {
      const pr = createMockPR({ state: 'MERGED' });
      const { canPerformActions } = useQuickActions();
      expect(canPerformActions(pr)).toBe(false);
    });
  });

  describe('canPerformWriteActions', () => {
    it('should return true for open PR with write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const pr = createMockPR({ state: 'OPEN' });
      const { canPerformWriteActions } = useQuickActions();
      expect(canPerformWriteActions(pr)).toBe(true);
    });

    it('should return false for open PR without write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: false });
      const pr = createMockPR({ state: 'OPEN' });
      const { canPerformWriteActions } = useQuickActions();
      expect(canPerformWriteActions(pr)).toBe(false);
    });

    it('should return false for closed PR with write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const pr = createMockPR({ state: 'CLOSED' });
      const { canPerformWriteActions } = useQuickActions();
      expect(canPerformWriteActions(pr)).toBe(false);
    });
  });

  describe('canComment', () => {
    it('should return true when write permissions are enabled', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const { canComment } = useQuickActions();
      expect(canComment()).toBe(true);
    });

    it('should return false when write permissions are disabled', () => {
      configStore.updateConfig({ hasWritePermissions: false });
      const { canComment } = useQuickActions();
      expect(canComment()).toBe(false);
    });
  });

  describe('canApprove', () => {
    it('should return true for open PR as reviewer with write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: true, username: 'reviewer' });
      const pr = createMockPR({
        state: 'OPEN',
        myReviewStatus: 'pending',
        reviews: { nodes: [] },
      });
      const { canApprove } = useQuickActions();
      expect(canApprove(pr)).toBe(true);
    });

    it('should return false without write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: false, username: 'reviewer' });
      const pr = createMockPR({ state: 'OPEN', myReviewStatus: 'pending' });
      const { canApprove } = useQuickActions();
      expect(canApprove(pr)).toBe(false);
    });

    it('should return false for author of the PR', () => {
      configStore.updateConfig({ hasWritePermissions: true, username: 'author' });
      const pr = createMockPR({ state: 'OPEN', myReviewStatus: 'author' });
      const { canApprove } = useQuickActions();
      expect(canApprove(pr)).toBe(false);
    });

    it('should return false if already approved', () => {
      configStore.updateConfig({ hasWritePermissions: true, username: 'reviewer' });
      const pr = createMockPR({
        state: 'OPEN',
        myReviewStatus: 'pending',
        reviews: {
          nodes: [{ author: { login: 'reviewer', avatarUrl: '' }, state: 'APPROVED', comments: { totalCount: 0 } }],
        },
      });
      const { canApprove } = useQuickActions();
      expect(canApprove(pr)).toBe(false);
    });
  });

  describe('canRequestChanges', () => {
    it('should return true for open PR as reviewer with write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: true, username: 'reviewer' });
      const pr = createMockPR({
        state: 'OPEN',
        myReviewStatus: 'pending',
        reviews: { nodes: [] },
      });
      const { canRequestChanges } = useQuickActions();
      expect(canRequestChanges(pr)).toBe(true);
    });

    it('should return false without write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: false, username: 'reviewer' });
      const pr = createMockPR({ state: 'OPEN', myReviewStatus: 'pending' });
      const { canRequestChanges } = useQuickActions();
      expect(canRequestChanges(pr)).toBe(false);
    });

    it('should return false if already requested changes', () => {
      configStore.updateConfig({ hasWritePermissions: true, username: 'reviewer' });
      const pr = createMockPR({
        state: 'OPEN',
        myReviewStatus: 'pending',
        reviews: {
          nodes: [{ author: { login: 'reviewer', avatarUrl: '' }, state: 'CHANGES_REQUESTED', comments: { totalCount: 0 } }],
        },
      });
      const { canRequestChanges } = useQuickActions();
      expect(canRequestChanges(pr)).toBe(false);
    });
  });

  describe('canMerge', () => {
    it('should return true for open PR with write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const pr = createMockPR({ state: 'OPEN' });
      const { canMerge } = useQuickActions();
      expect(canMerge(pr)).toBe(true);
    });

    it('should return false without write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: false });
      const pr = createMockPR({ state: 'OPEN' });
      const { canMerge } = useQuickActions();
      expect(canMerge(pr)).toBe(false);
    });

    it('should return false for closed PR', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const pr = createMockPR({ state: 'CLOSED' });
      const { canMerge } = useQuickActions();
      expect(canMerge(pr)).toBe(false);
    });
  });

  describe('mightBeMergeable', () => {
    it('should return true for open PR with write permissions and no failing checks', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const pr = createMockPR({
        state: 'OPEN',
        commits: {
          nodes: [{
            commit: {
              statusCheckRollup: { state: 'SUCCESS' },
            },
          }],
        },
      });
      const { mightBeMergeable } = useQuickActions();
      expect(mightBeMergeable(pr)).toBe(true);
    });

    it('should return false without write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: false });
      const pr = createMockPR({ state: 'OPEN' });
      const { mightBeMergeable } = useQuickActions();
      expect(mightBeMergeable(pr)).toBe(false);
    });

    it('should return false for PR with failing checks', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const pr = createMockPR({
        state: 'OPEN',
        commits: {
          nodes: [{
            commit: {
              statusCheckRollup: { state: 'FAILURE' },
            },
          }],
        },
      });
      const { mightBeMergeable } = useQuickActions();
      expect(mightBeMergeable(pr)).toBe(false);
    });

    it('should return true for PR with no status checks', () => {
      configStore.updateConfig({ hasWritePermissions: true });
      const pr = createMockPR({
        state: 'OPEN',
        commits: { nodes: [] },
      });
      const { mightBeMergeable } = useQuickActions();
      expect(mightBeMergeable(pr)).toBe(true);
    });
  });
});
