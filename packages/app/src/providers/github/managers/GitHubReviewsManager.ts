/**
 * GitHubReviewsManager - Manages review operations for GitHub
 * Implements IReviewsManager interface
 */

import type { Review } from '../../../model/types';
import type { IReviewsManager, ReviewStatus } from '../../interfaces';
import { CacheableManager } from '../../base/CacheableManager';
import { GitHubService } from '../GitHubService';
import { PR_REVIEWS_BY_ID_QUERY } from '../queries/pullRequests';
import type { GitHubReviewsResponse } from '../adapters/GitHubResponseAdapter';
import { GitHubResponseAdapter } from '../adapters/GitHubResponseAdapter';

export class GitHubReviewsManager extends CacheableManager<Review[]> implements IReviewsManager {
  private githubService: GitHubService;

  constructor(githubService: GitHubService) {
    super('GitHubReviewsManager');
    this.githubService = githubService;
  }

  /**
   * Get reviews for a specific pull request
   */
  async getReviews(
    owner: string,
    repo: string,
    prNumber: number,
    useCache = true
  ): Promise<Review[]> {
    const cacheKey = `${owner}/${repo}/${prNumber}`;

    return this.getOrFetch(
      cacheKey,
      async () => {
        const result = await this.githubService.executeQuery<GitHubReviewsResponse>(
          PR_REVIEWS_BY_ID_QUERY,
          { owner, repo, number: prNumber }
        );
        return GitHubResponseAdapter.transformReviews(result);
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
