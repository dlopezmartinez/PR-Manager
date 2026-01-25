/**
 * Tests for useViewPolling composable
 * Tests view-aware polling interface and basic behavior
 *
 * Note: Full integration testing of Vue watchers and debouncing
 * should be done in component integration tests where Vue's
 * reactivity system is properly initialized.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';

// Mock view store
const mockActiveViewId = ref('my-prs');
const mockViews = ref([
  { id: 'my-prs', name: 'My PRs', queryBuilder: () => 'is:pr' },
  { id: 'review-requested', name: 'Review Requested', queryBuilder: () => 'is:pr' },
]);

vi.mock('../../src/stores/viewStore', () => ({
  viewStore: {
    get activeViewId() {
      return mockActiveViewId.value;
    },
    set activeViewId(val: string) {
      mockActiveViewId.value = val;
    },
    views: mockViews.value,
  },
  activeView: {
    get value() {
      return mockViews.value.find(v => v.id === mockActiveViewId.value) || mockViews.value[0];
    },
  },
}));

// Mock config store
vi.mock('../../src/stores/configStore', () => ({
  configStore: {
    pollingEnabled: true,
    pollingInterval: 60,
    backgroundPolling: true,
    username: 'testuser',
  },
}));

// Mock usePolling
const mockIsPolling = ref(false);
const mockNextPollIn = ref(0);
const mockLastPollTime = ref<Date | null>(null);
const mockStartPolling = vi.fn();
const mockStopPolling = vi.fn();
const mockRestartPolling = vi.fn();
const mockPollNow = vi.fn().mockResolvedValue(undefined);
let capturedOnPoll: (() => Promise<void>) | null = null;

vi.mock('../../src/composables/usePolling', () => ({
  usePolling: (options: { onPoll: () => Promise<void> }) => {
    capturedOnPoll = options.onPoll;
    return {
      isPolling: mockIsPolling,
      nextPollIn: mockNextPollIn,
      lastPollTime: mockLastPollTime,
      startPolling: mockStartPolling,
      stopPolling: mockStopPolling,
      restartPolling: mockRestartPolling,
      pollNow: mockPollNow,
    };
  },
}));

// Mock useGitProvider
const mockPullRequests = ref([]);
vi.mock('../../src/composables/useGitProvider', () => ({
  useGitProvider: () => ({
    pullRequests: mockPullRequests,
  }),
}));

// Mock ViewAdapter
const mockGetViewData = vi.fn().mockResolvedValue({
  prs: [],
  pageInfo: { hasNextPage: false, endCursor: null },
});

class MockViewAdapter {
  getViewData = mockGetViewData;
}

vi.mock('../../src/adapters/ViewAdapter', () => ({
  ViewAdapter: MockViewAdapter,
}));

// Mock useViewState
const mockViewState = {
  prs: ref([]),
  pageInfo: ref({ hasNextPage: false, endCursor: null }),
  lastFetched: ref<Date | null>(null),
  error: ref(''),
};

vi.mock('../../src/composables/useViewState', () => ({
  useViewState: () => mockViewState,
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  pollingLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useViewPolling', () => {
  let useViewPolling: typeof import('../../src/composables/useViewPolling').useViewPolling;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();

    // Reset mock state
    mockActiveViewId.value = 'my-prs';
    mockIsPolling.value = false;
    mockViewState.prs.value = [];
    mockViewState.error.value = '';
    mockViewState.lastFetched.value = null;
    capturedOnPoll = null;

    // Clear mock call history
    mockStartPolling.mockClear();
    mockStopPolling.mockClear();
    mockRestartPolling.mockClear();
    mockPollNow.mockClear();
    mockGetViewData.mockClear();

    mockGetViewData.mockResolvedValue({
      prs: [{ id: 1, title: 'Test PR' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    // Re-import to get fresh state
    const module = await import('../../src/composables/useViewPolling');
    useViewPolling = module.useViewPolling;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should return polling control functions', () => {
      const result = useViewPolling();

      expect(result.isPolling).toBeDefined();
      expect(result.nextPollIn).toBeDefined();
      expect(result.lastPollTime).toBeDefined();
      expect(result.startPolling).toBeInstanceOf(Function);
      expect(result.stopPolling).toBeInstanceOf(Function);
      expect(result.restartPolling).toBeInstanceOf(Function);
      expect(result.refreshActiveView).toBeInstanceOf(Function);
    });

    it('should initialize usePolling with refreshActiveView callback', () => {
      useViewPolling();

      expect(capturedOnPoll).toBeInstanceOf(Function);
    });
  });

  describe('refreshActiveView', () => {
    it('should fetch data for active view', async () => {
      const { refreshActiveView } = useViewPolling();

      await refreshActiveView();

      expect(mockGetViewData).toHaveBeenCalled();
    });

    it('should update view state with fetched data', async () => {
      const { refreshActiveView } = useViewPolling();

      await refreshActiveView();

      expect(mockViewState.prs.value).toEqual([{ id: 1, title: 'Test PR' }]);
      expect(mockViewState.lastFetched.value).toBeInstanceOf(Date);
      expect(mockViewState.error.value).toBe('');
    });

    it('should handle fetch errors gracefully', async () => {
      mockGetViewData.mockRejectedValueOnce(new Error('Network error'));

      const { refreshActiveView } = useViewPolling();

      await refreshActiveView();

      expect(mockViewState.error.value).toBe('Network error');
    });

    it('should set generic error message for non-Error objects', async () => {
      mockGetViewData.mockRejectedValueOnce('String error');

      const { refreshActiveView } = useViewPolling();

      await refreshActiveView();

      expect(mockViewState.error.value).toBe('Polling failed');
    });
  });

  describe('polling lifecycle', () => {
    it('should pass through startPolling', () => {
      const { startPolling } = useViewPolling();

      startPolling();

      expect(mockStartPolling).toHaveBeenCalled();
    });

    it('should pass through stopPolling', () => {
      const { stopPolling } = useViewPolling();

      stopPolling();

      expect(mockStopPolling).toHaveBeenCalled();
    });

    it('should pass through restartPolling', () => {
      const { restartPolling } = useViewPolling();

      restartPolling();

      expect(mockRestartPolling).toHaveBeenCalled();
    });
  });

  describe('reactive state', () => {
    it('should expose isPolling state', () => {
      const { isPolling } = useViewPolling();

      mockIsPolling.value = true;

      expect(isPolling.value).toBe(true);
    });

    it('should expose nextPollIn countdown', () => {
      const { nextPollIn } = useViewPolling();

      mockNextPollIn.value = 45;

      expect(nextPollIn.value).toBe(45);
    });

    it('should expose lastPollTime', () => {
      const { lastPollTime } = useViewPolling();

      const now = new Date();
      mockLastPollTime.value = now;

      expect(lastPollTime.value).toBe(now);
    });
  });

  describe('integration with usePolling', () => {
    it('should configure usePolling with correct options', () => {
      useViewPolling();

      // Verify the callback was captured
      expect(capturedOnPoll).not.toBeNull();
    });

    it('should call refreshActiveView when onPoll is invoked', async () => {
      useViewPolling();

      // Invoke the captured callback
      await capturedOnPoll!();

      // Should have fetched data
      expect(mockGetViewData).toHaveBeenCalled();
    });
  });
});
