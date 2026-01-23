import type { IPullRequestManager } from '../providers/interfaces';
import type { PullRequestBasic, PageInfo } from '../model/types';
import type { ViewConfig } from '../model/view-types';
import { configStore } from '../stores/configStore';

export interface ViewData {
  prs: PullRequestBasic[];
  pageInfo: PageInfo;
}

const DEFAULT_SORTER = (a: PullRequestBasic, b: PullRequestBasic): number => {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
};

export class ViewAdapter {
  private manager: IPullRequestManager;

  constructor(manager: IPullRequestManager) {
    this.manager = manager;
  }

  async getViewData(
    view: ViewConfig,
    username?: string,
    limit?: number,
    after?: string
  ): Promise<ViewData> {
    const userTarget = username || (await this.manager.getCurrentUser());
    const pageLimit = limit || view.pageSize || 20;

    const queries = this.buildQueries(view, userTarget);

    const results = await Promise.all(
      queries.map((query) => this.manager.listPullRequests(query, pageLimit, after))
    );

    let allPrs = results.flatMap((r) => r.prs);

    if (view.deduplicate && queries.length > 1) {
      allPrs = this.deduplicatePRs(allPrs);
    }

    allPrs = this.computeReviewStatus(allPrs, userTarget);

    const shouldApplyExplicitFilter =
      view.applyExplicitReviewerFilter !== undefined
        ? view.applyExplicitReviewerFilter
        : configStore.explicitReviewerOnly;

    if (shouldApplyExplicitFilter) {
      allPrs = this.applyExplicitReviewerFilter(allPrs, userTarget);
    }

    if (view.filter) {
      allPrs = allPrs.filter((pr) => view.filter!(pr, userTarget));
    }

    const sorter = view.sorter || DEFAULT_SORTER;
    allPrs.sort(sorter);

    const combinedPageInfo = results[0]?.pageInfo || {
      hasNextPage: false,
      endCursor: null,
    };

    return {
      prs: allPrs,
      pageInfo: combinedPageInfo,
    };
  }

  private buildQueries(view: ViewConfig, username: string): string[] {
    const queryResult = view.queryBuilder(username);
    return Array.isArray(queryResult) ? queryResult : [queryResult];
  }

  private deduplicatePRs(prs: PullRequestBasic[]): PullRequestBasic[] {
    const uniqueMap = new Map<string, PullRequestBasic>();

    for (const pr of prs) {
      if (!uniqueMap.has(pr.id)) {
        uniqueMap.set(pr.id, pr);
      }
    }

    return Array.from(uniqueMap.values());
  }

  /**
   * Compute myReviewStatus for PRs.
   * Possible values:
   * - 'author': User is the PR author
   * - 'pending': User is requested as reviewer and hasn't made a formal review yet
   * - 'reviewed': User has submitted a formal review (APPROVED or CHANGES_REQUESTED)
   * - 'none': No special relationship
   */
  private computeReviewStatus(prs: PullRequestBasic[], username: string): PullRequestBasic[] {
    return prs.map((pr) => {
      const isAuthored = pr.author?.login === username;

      const isPendingReview =
        pr.reviewRequests?.nodes?.some(
          (req) =>
            req.requestedReviewer.__typename === 'User' &&
            req.requestedReviewer.login === username
        ) || false;

      const hasFormalReview =
        pr.reviews?.nodes?.some(
          (review) =>
            review.author?.login === username &&
            (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED')
        ) || false;

      let myReviewStatus: 'author' | 'pending' | 'reviewed' | 'none';

      if (isAuthored) {
        myReviewStatus = 'author';
      } else if (isPendingReview && !hasFormalReview) {
        myReviewStatus = 'pending';
      } else if (hasFormalReview) {
        myReviewStatus = 'reviewed';
      } else {
        myReviewStatus = 'none';
      }

      return {
        ...pr,
        myReviewStatus,
      };
    });
  }

  private applyExplicitReviewerFilter(
    prs: PullRequestBasic[],
    username: string
  ): PullRequestBasic[] {
    return prs.filter((pr) => {
      if (pr.author?.login === username) {
        return true;
      }

      const isExplicitReviewer =
        pr.reviewRequests?.nodes?.some(
          (req) =>
            req.requestedReviewer.__typename === 'User' &&
            req.requestedReviewer.login === username
        ) || false;

      return isExplicitReviewer;
    });
  }

  async getDashboardData(username?: string, limit = 20, after?: string): Promise<ViewData> {
    const userTarget = username || (await this.manager.getCurrentUser());

    const authoredQuery = `is:pr is:open author:${userTarget}`;
    const reviewRequestedQuery = `is:pr is:open review-requested:${userTarget}`;
    const reviewedByQuery = `is:pr is:open reviewed-by:${userTarget}`;

    const [authoredResult, reviewRequestedResult, reviewedByResult] = await Promise.all([
      this.manager.listPullRequests(authoredQuery, limit, after),
      this.manager.listPullRequests(reviewRequestedQuery, limit, after),
      this.manager.listPullRequests(reviewedByQuery, limit, after),
    ]);

    const allPrs = [
      ...authoredResult.prs,
      ...reviewRequestedResult.prs,
      ...reviewedByResult.prs,
    ];

    const uniquePrs = this.deduplicatePRs(allPrs);

    const prsWithStatus = this.computeReviewStatus(uniquePrs, userTarget);

    prsWithStatus.sort(DEFAULT_SORTER);

    const combinedPageInfo =
      authoredResult.pageInfo.hasNextPage
        ? authoredResult.pageInfo
        : reviewRequestedResult.pageInfo;

    return {
      prs: prsWithStatus,
      pageInfo: combinedPageInfo,
    };
  }
}
