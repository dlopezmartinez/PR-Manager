import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import type { PullRequestBasic } from '../model/types';

export interface UseLocalSearchOptions {
  debounceMs?: number;
}

export interface UseLocalSearchReturn {
  searchQuery: Ref<string>;
  filteredPRs: ComputedRef<PullRequestBasic[]>;
  isFiltering: ComputedRef<boolean>;
  resultCount: ComputedRef<number>;
  clearSearch: () => void;
}

function useDebouncedRef<T>(value: Ref<T>, delay: number): Ref<T> {
  const debouncedValue = ref(value.value) as Ref<T>;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  watch(value, (newValue) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      debouncedValue.value = newValue;
    }, delay);
  });

  return debouncedValue;
}

export function useLocalSearch(
  prs: Ref<PullRequestBasic[]> | ComputedRef<PullRequestBasic[]>,
  options: UseLocalSearchOptions = {}
): UseLocalSearchReturn {
  const { debounceMs = 300 } = options;

  const searchQuery = ref('');
  const debouncedQuery = useDebouncedRef(searchQuery, debounceMs);

  const filteredPRs = computed(() => {
    const query = debouncedQuery.value.toLowerCase().trim();

    if (!query) {
      return prs.value;
    }

    return prs.value.filter((pr) => {
      if (pr.title.toLowerCase().includes(query)) {
        return true;
      }

      if (pr.author.login.toLowerCase().includes(query)) {
        return true;
      }

      if (pr.repository.nameWithOwner.toLowerCase().includes(query)) {
        return true;
      }

      if (pr.number.toString().includes(query)) {
        return true;
      }

      if (pr.headRefName?.toLowerCase().includes(query)) {
        return true;
      }
      if (pr.baseRefName?.toLowerCase().includes(query)) {
        return true;
      }

      return false;
    });
  });

  const isFiltering = computed(() => {
    return searchQuery.value.trim().length > 0;
  });

  const resultCount = computed(() => {
    return filteredPRs.value.length;
  });

  function clearSearch() {
    searchQuery.value = '';
  }

  return {
    searchQuery,
    filteredPRs,
    isFiltering,
    resultCount,
    clearSearch,
  };
}
