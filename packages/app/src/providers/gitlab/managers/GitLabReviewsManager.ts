/**
 * GitLabReviewsManager - Manages review operations for GitLab
 * Implements IReviewsManager interface
 *
 * Note: GitLab handles reviews differently than GitHub:
 * - Reviews are represented by approvals and reviewer interactions
 * - Discussions/notes can contain review-like comments
 */

import type { Review } from '../../../model/types';
import type { IReviewsManager, ReviewStatus } from '../../interfaces';
import { CacheableManager } from '../../base/CacheableManager';
import { GitLabService } from '../GitLabService';
import { MR_APPROVALS_QUERY } from '../queries/mergeRequests';
import type { GitLabApprovalsResponse } from '../adapters/GitLabResponseAdapter';
import { GitLabResponseAdapter } from '../adapters/GitLabResponseAdapter';

export class GitLabReviewsManager extends CacheableManager<Review[]> implements IReviewsManager {
  private gitlabService: GitLabService;

  constructor(gitlabService: GitLabService) {
    super('GitLabReviewsManager');
    this.gitlabService = gitlabService;
  }

  /**
   * Get reviews for a specific merge request
   * In GitLab, reviews are represented by approvals and reviewer interactions
   */
  async getReviews(
    owner: string,
    repo: string,
    prNumber: number,
    useCache = true
  ): Promise<Review[]> {
    const projectPath = `${owner}/${repo}`;
    const cacheKey = `${projectPath}/${prNumber}`;

    return this.getOrFetch(
      cacheKey,
      async () => {
        const result = await this.gitlabService.executeQuery<GitLabApprovalsResponse>(
          MR_APPROVALS_QUERY,
          { projectPath, iid: String(prNumber) }
        );

        const mr = result.data.project.mergeRequest;
        return GitLabResponseAdapter.transformApprovalsToReviews(
          mr.approvedBy.nodes,
          mr.reviewers.nodes
        );
      },
      useCache
    );
  }

  /**
   * Get a summary of review states
   */
  getReviewStatus(reviews: Review[]): ReviewStatus {
    const status: ReviewStatus = {
      approved: 0,
      changesRequested: 0,
      commented: 0,
      pending: 0,
    };

    reviews.forEach((review) => {
      switch (review.state) {
        case 'APPROVED':
          status.approved++;
          break;
        case 'CHANGES_REQUESTED':
          status.changesRequested++;
          break;
        case 'COMMENTED':
          status.commented++;
          break;
        case 'PENDING':
          status.pending++;
          break;
      }
    });

    return status;
  }

  /**
   * Clear the reviews cache
   */
  clearReviewsCache(owner?: string, repo?: string, prNumber?: number): void {
    if (owner && repo && prNumber) {
      this.invalidate(`${owner}/${repo}/${prNumber}`);
    } else {
      this.clearCache();
    }
  }
}
