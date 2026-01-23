import type { Review } from '../../model/types';

export interface ReviewStatus {
  approved: number;
  changesRequested: number;
  commented: number;
  pending: number;
}

export interface IReviewsManager {
  getReviews(
    owner: string,
    repo: string,
    prNumber: number,
    useCache?: boolean
  ): Promise<Review[]>;
  getReviewStatus(reviews: Review[]): ReviewStatus;
  clearReviewsCache(owner?: string, repo?: string, prNumber?: number): void;
  clearCache(): void;
}
