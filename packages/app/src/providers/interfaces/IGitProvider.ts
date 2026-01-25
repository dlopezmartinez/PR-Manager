import type { IPullRequestManager } from './IPullRequestManager';
import type { IReviewsManager } from './IReviewsManager';
import type { ICommentsManager } from './ICommentsManager';
import type { IChecksManager } from './IChecksManager';
import type { IActionsManager } from './IActionsManager';
import type { ProviderType } from '../../model/provider-types';

export interface IGitProvider {
  readonly type: ProviderType;
  readonly pullRequests: IPullRequestManager;
  readonly reviews: IReviewsManager;
  readonly comments: ICommentsManager;
  readonly checks: IChecksManager;
  readonly actions: IActionsManager;

  isReady(): boolean;
  clearAllCaches(): void;
  supportsOperation(operation: string): boolean;
}
