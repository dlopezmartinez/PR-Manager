/**
 * Tests for followUpStore.ts
 * Tests PR follow-up tracking functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PullRequestBasic } from '../../src/model/types';

// We need to reset modules before importing to get fresh state
let followUpStore: typeof import('../../src/stores/followUpStore');

// Mock PR for testing
const mockPR: PullRequestBasic = {
  id: 'PR_123',
  number: 42,
  title: 'Test PR',
  url: 'https://github.com/owner/repo/pull/42',
  state: 'OPEN',
  isDraft: false,
  repository: { nameWithOwner: 'owner/repo' },
  author: { login: 'testuser', avatarUrl: 'https://github.com/testuser.png' },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  commits: { nodes: [{ commit: {} }] },
  comments: { totalCount: 5 },
  reviews: { nodes: [{ author: { login: 'reviewer', avatarUrl: 'https://github.com/reviewer.png' }, state: 'APPROVED', comments: { totalCount: 2 } }] },
};

describe('followUpStore', () => {
  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear();

    // Reset modules to get fresh store state
    vi.resetModules();

    // Re-import the store
    followUpStore = await import('../../src/stores/followUpStore');
  });

  describe('initial state', () => {
    it('should start with no followed PRs', () => {
      expect(followUpStore.getFollowedPRs()).toEqual([]);
      expect(followUpStore.getFollowedCount()).toBe(0);
    });

    it('should allow following more PRs initially', () => {
      expect(followUpStore.canFollowMore()).toBe(true);
    });
  });

  describe('followPR', () => {
    it('should add a PR to followed list', () => {
      const result = followUpStore.followPR(mockPR);

      expect(result).toBe(true);
      expect(followUpStore.isFollowing(mockPR.id)).toBe(true);
      expect(followUpStore.getFollowedCount()).toBe(1);
    });

    it('should store PR info correctly', () => {
      followUpStore.followPR(mockPR);

      const info = followUpStore.getFollowedPRInfo(mockPR.id);
      expect(info).toBeDefined();
      expect(info?.prId).toBe(mockPR.id);
      expect(info?.prNumber).toBe(mockPR.number);
      expect(info?.repoNameWithOwner).toBe(mockPR.repository.nameWithOwner);
      expect(info?.title).toBe(mockPR.title);
      expect(info?.authorLogin).toBe(mockPR.author.login);
    });

    it('should track initial state for change detection', () => {
      followUpStore.followPR(mockPR);

      const info = followUpStore.getFollowedPRInfo(mockPR.id);
      expect(info?.lastKnownState).toBeDefined();
      expect(info?.lastKnownState.commitCount).toBe(1);
      expect(info?.lastKnownState.commentCount).toBe(7); // 5 regular + 2 review comments
      expect(info?.lastKnownState.reviewCount).toBe(1);
    });

    it('should not allow following more than limit', () => {
      // Follow max PRs
      for (let i = 0; i < 50; i++) {
        const pr = { ...mockPR, id: `PR_${i}` };
        followUpStore.followPR(pr);
      }

      expect(followUpStore.canFollowMore()).toBe(false);

      // Try to follow one more
      const extraPR = { ...mockPR, id: 'PR_extra' };
      const result = followUpStore.followPR(extraPR);

      expect(result).toBe(false);
      expect(followUpStore.isFollowing('PR_extra')).toBe(false);
    });
  });

  describe('unfollowPR', () => {
    it('should remove a PR from followed list', () => {
      followUpStore.followPR(mockPR);
      expect(followUpStore.isFollowing(mockPR.id)).toBe(true);

      followUpStore.unfollowPR(mockPR.id);

      expect(followUpStore.isFollowing(mockPR.id)).toBe(false);
      expect(followUpStore.getFollowedCount()).toBe(0);
    });

    it('should not throw when unfollowing non-existent PR', () => {
      expect(() => followUpStore.unfollowPR('non-existent')).not.toThrow();
    });
  });

  describe('isFollowing', () => {
    it('should return true for followed PR', () => {
      followUpStore.followPR(mockPR);
      expect(followUpStore.isFollowing(mockPR.id)).toBe(true);
    });

    it('should return false for non-followed PR', () => {
      expect(followUpStore.isFollowing('non-existent')).toBe(false);
    });
  });

  describe('getFollowedPRs', () => {
    it('should return all followed PRs', () => {
      const pr1 = { ...mockPR, id: 'PR_1' };
      const pr2 = { ...mockPR, id: 'PR_2' };

      followUpStore.followPR(pr1);
      followUpStore.followPR(pr2);

      const followed = followUpStore.getFollowedPRs();
      expect(followed).toHaveLength(2);
      expect(followed.some(p => p.prId === 'PR_1')).toBe(true);
      expect(followed.some(p => p.prId === 'PR_2')).toBe(true);
    });
  });

  describe('getFollowedPRIds', () => {
    it('should return all followed PR IDs', () => {
      const pr1 = { ...mockPR, id: 'PR_1' };
      const pr2 = { ...mockPR, id: 'PR_2' };

      followUpStore.followPR(pr1);
      followUpStore.followPR(pr2);

      const ids = followUpStore.getFollowedPRIds();
      expect(ids).toContain('PR_1');
      expect(ids).toContain('PR_2');
    });
  });

  describe('detectChanges', () => {
    it('should detect new commits', () => {
      followUpStore.followPR(mockPR);

      // PR with more commits
      const updatedPR = {
        ...mockPR,
        commits: { nodes: [{ commit: {} }, { commit: {} }, { commit: {} }] },
      };

      const changes = followUpStore.detectChanges(mockPR.id, updatedPR);

      expect(changes.hasChanges).toBe(true);
      expect(changes.newCommits).toBe(2);
    });

    it('should detect new comments', () => {
      followUpStore.followPR(mockPR);

      // PR with more comments
      const updatedPR = {
        ...mockPR,
        comments: { totalCount: 10 },
      };

      const changes = followUpStore.detectChanges(mockPR.id, updatedPR);

      expect(changes.hasChanges).toBe(true);
      expect(changes.newComments).toBe(5);
    });

    it('should detect new reviews', () => {
      followUpStore.followPR(mockPR);

      // PR with more reviews
      const updatedPR = {
        ...mockPR,
        reviews: {
          nodes: [
            { author: { login: 'reviewer', avatarUrl: 'https://github.com/reviewer.png' }, state: 'APPROVED', comments: { totalCount: 2 } },
            { author: { login: 'reviewer2', avatarUrl: 'https://github.com/reviewer2.png' }, state: 'CHANGES_REQUESTED', comments: { totalCount: 0 } },
          ],
        },
      };

      const changes = followUpStore.detectChanges(mockPR.id, updatedPR);

      expect(changes.hasChanges).toBe(true);
      expect(changes.newReviews).toBe(1);
    });

    it('should return no changes when nothing changed', () => {
      followUpStore.followPR(mockPR);

      const changes = followUpStore.detectChanges(mockPR.id, mockPR);

      expect(changes.hasChanges).toBe(false);
      expect(changes.newCommits).toBe(0);
      expect(changes.newComments).toBe(0);
      expect(changes.newReviews).toBe(0);
    });

    it('should return no changes for non-followed PR', () => {
      const changes = followUpStore.detectChanges('non-existent', mockPR);

      expect(changes.hasChanges).toBe(false);
    });

    it('should detect new approved reviews', () => {
      followUpStore.followPR(mockPR);

      // PR with additional approved review
      const updatedPR = {
        ...mockPR,
        reviews: {
          nodes: [
            { author: { login: 'reviewer', avatarUrl: 'https://github.com/reviewer.png' }, state: 'APPROVED', comments: { totalCount: 2 } },
            { author: { login: 'reviewer2', avatarUrl: 'https://github.com/reviewer2.png' }, state: 'APPROVED', comments: { totalCount: 0 } },
          ],
        },
      };

      const changes = followUpStore.detectChanges(mockPR.id, updatedPR);

      expect(changes.hasChanges).toBe(true);
      expect(changes.newApproved).toBe(1);
      expect(changes.newChangesRequested).toBe(0);
    });

    it('should detect new changes requested reviews', () => {
      followUpStore.followPR(mockPR);

      // PR with changes requested review
      const updatedPR = {
        ...mockPR,
        reviews: {
          nodes: [
            { author: { login: 'reviewer', avatarUrl: 'https://github.com/reviewer.png' }, state: 'APPROVED', comments: { totalCount: 2 } },
            { author: { login: 'reviewer2', avatarUrl: 'https://github.com/reviewer2.png' }, state: 'CHANGES_REQUESTED', comments: { totalCount: 0 } },
          ],
        },
      };

      const changes = followUpStore.detectChanges(mockPR.id, updatedPR);

      expect(changes.hasChanges).toBe(true);
      expect(changes.newApproved).toBe(0);
      expect(changes.newChangesRequested).toBe(1);
    });

    it('should detect merge status change', () => {
      followUpStore.followPR(mockPR);

      const changes = followUpStore.detectChanges(mockPR.id, mockPR, 'CLEAN');

      expect(changes.hasChanges).toBe(true);
      expect(changes.mergeStatusChanged).toBe(true);
      expect(changes.newMergeStatus).toBe('CLEAN');
    });

    it('should detect PR merged', () => {
      followUpStore.followPR(mockPR);

      // PR that's now merged
      const mergedPR = {
        ...mockPR,
        state: 'MERGED',
      };

      const changes = followUpStore.detectChanges(mockPR.id, mergedPR);

      expect(changes.hasChanges).toBe(true);
      expect(changes.justMerged).toBe(true);
    });
  });

  describe('updatePRState', () => {
    it('should update the last known state', () => {
      followUpStore.followPR(mockPR);

      const updatedPR = {
        ...mockPR,
        title: 'Updated Title',
        commits: { nodes: [{ commit: {} }, { commit: {} }] },
      };

      followUpStore.updatePRState(mockPR.id, updatedPR);

      const info = followUpStore.getFollowedPRInfo(mockPR.id);
      expect(info?.title).toBe('Updated Title');
      expect(info?.lastKnownState.commitCount).toBe(2);
    });
  });

  describe('clearAllFollowed', () => {
    it('should remove all followed PRs', () => {
      followUpStore.followPR({ ...mockPR, id: 'PR_1' });
      followUpStore.followPR({ ...mockPR, id: 'PR_2' });
      expect(followUpStore.getFollowedCount()).toBe(2);

      followUpStore.clearAllFollowed();

      expect(followUpStore.getFollowedCount()).toBe(0);
      expect(followUpStore.getFollowedPRs()).toEqual([]);
    });
  });

  describe('reactive computeds', () => {
    it('followedCount should be reactive', () => {
      expect(followUpStore.followedCount.value).toBe(0);

      followUpStore.followPR(mockPR);
      expect(followUpStore.followedCount.value).toBe(1);

      followUpStore.unfollowPR(mockPR.id);
      expect(followUpStore.followedCount.value).toBe(0);
    });

    it('followedPRsList should be reactive', () => {
      expect(followUpStore.followedPRsList.value).toHaveLength(0);

      followUpStore.followPR(mockPR);
      expect(followUpStore.followedPRsList.value).toHaveLength(1);
    });
  });

  describe('persistence', () => {
    it('should persist followed PRs to localStorage', async () => {
      followUpStore.followPR(mockPR);

      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 600));

      const stored = localStorage.getItem('pr-manager-follow-up');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed.followedPRs[mockPR.id]).toBeDefined();
    });

    it('should load followed PRs from localStorage on init', async () => {
      // Pre-populate localStorage
      const storedData = {
        followedPRs: {
          'PR_stored': {
            prId: 'PR_stored',
            prNumber: 99,
            repoNameWithOwner: 'owner/repo',
            url: 'https://github.com/owner/repo/pull/99',
            title: 'Stored PR',
            authorLogin: 'user',
            authorAvatarUrl: 'https://github.com/user.png',
            followedAt: new Date().toISOString(),
            lastKnownState: { commitCount: 1, commentCount: 0, reviewCount: 0, approvedCount: 0, changesRequestedCount: 0, mergeStateStatus: null, isMerged: false, updatedAt: '' },
          },
        },
        lastPruned: new Date().toISOString(),
      };
      localStorage.setItem('pr-manager-follow-up', JSON.stringify(storedData));

      // Re-import store to load from localStorage
      vi.resetModules();
      followUpStore = await import('../../src/stores/followUpStore');

      expect(followUpStore.isFollowing('PR_stored')).toBe(true);
    });
  });
});
