import type { ViewConfig } from '../model/view-types';
import type { PullRequestBasic } from '../model/types';

export const VIEW_NOTIFICATIONS_ID = 'notifications';

export const VIEW_NOTIFICATIONS: ViewConfig = {
  id: VIEW_NOTIFICATIONS_ID,
  name: 'Notifications',
  icon: '🔔',
  queryBuilder: () => '',
  readonly: true,
  order: 0,
  applyExplicitReviewerFilter: false,
};

export const DEFAULT_VIEWS: ViewConfig[] = [VIEW_NOTIFICATIONS];

export function getDefaultView(id: string): ViewConfig | undefined {
  return DEFAULT_VIEWS.find((view) => view.id === id);
}

export function isDefaultView(id: string): boolean {
  return DEFAULT_VIEWS.some((view) => view.id === id);
}

export function isNotificationsView(id: string): boolean {
  return id === VIEW_NOTIFICATIONS_ID;
}
