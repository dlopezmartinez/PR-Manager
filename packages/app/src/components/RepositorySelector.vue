<template>
  <div class="repo-selector">
    <div class="selected-repos" v-if="selectedRepos.length > 0">
      <div
        v-for="repo in selectedRepos"
        :key="repo"
        class="repo-chip"
      >
        <span class="repo-name">{{ repo }}</span>
        <button
          class="remove-btn"
          @click="removeRepo(repo)"
          type="button"
          :title="`Remove ${repo}`"
        >
          <X :size="12" :stroke-width="2" />
        </button>
      </div>
    </div>

    <div class="search-container">
      <div class="search-input-wrapper">
        <Search :size="14" :stroke-width="2" class="search-icon" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          :placeholder="placeholder"
          class="search-input"
          @focus="showDropdown = true"
          @input="handleSearch"
          @keydown.enter.prevent="handleEnter"
          @keydown.escape="showDropdown = false"
          @keydown.down.prevent="navigateDown"
          @keydown.up.prevent="navigateUp"
        />
        <div v-if="isLoading" class="loading-spinner">
          <Loader2 :size="14" :stroke-width="2" class="spinner" />
        </div>
      </div>

      <Transition name="dropdown">
        <div
          v-if="showDropdown && (filteredRepos.length > 0 || isLoading || searchQuery)"
          class="dropdown"
        >
          <div v-if="isLoading && filteredRepos.length === 0" class="dropdown-message">
            <Loader2 :size="16" :stroke-width="2" class="spinner" />
            <span>Loading repositories...</span>
          </div>

          <div v-else-if="filteredRepos.length === 0 && searchQuery" class="dropdown-message">
            <span>No repositories found</span>
            <button
              v-if="isValidRepoFormat(searchQuery)"
              class="add-manual-btn"
              @click="addManualRepo"
              type="button"
            >
              Add "{{ searchQuery }}" manually
            </button>
          </div>

          <div v-else class="dropdown-list" ref="dropdownList">
            <button
              v-for="(repo, index) in filteredRepos"
              :key="repo.nameWithOwner"
              class="dropdown-item"
              :class="{
                selected: isSelected(repo.nameWithOwner),
                highlighted: highlightedIndex === index
              }"
              @click="toggleRepo(repo.nameWithOwner)"
              @mouseenter="highlightedIndex = index"
              type="button"
            >
              <div class="repo-info">
                <span class="repo-full-name">{{ repo.nameWithOwner }}</span>
                <span v-if="repo.description" class="repo-description">{{ repo.description }}</span>
              </div>
              <div class="repo-meta">
                <span v-if="repo.isPrivate" class="badge private">
                  <Lock :size="10" :stroke-width="2" />
                </span>
                <span v-if="repo.isArchived" class="badge archived">Archived</span>
                <span v-if="repo.starCount && repo.starCount > 0" class="stars">
                  <Star :size="10" :stroke-width="2" />
                  {{ formatStars(repo.starCount) }}
                </span>
              </div>
              <Check
                v-if="isSelected(repo.nameWithOwner)"
                :size="16"
                :stroke-width="2"
                class="check-icon"
              />
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <p class="hint">
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { X, Search, Loader2, Check, Lock, Star } from 'lucide-vue-next';
import type { RepositoryInfo } from '../model/types';

const props = withDefaults(defineProps<{
  modelValue: string[];
  placeholder?: string;
  hint?: string;
  fetchRepositories: (searchTerm?: string) => Promise<RepositoryInfo[]>;
}>(), {
  placeholder: 'Search repositories...',
  hint: 'Select repositories or type owner/repo to add manually',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
}>();

const searchQuery = ref('');
const searchInput = ref<HTMLInputElement>();
const dropdownList = ref<HTMLElement>();
const showDropdown = ref(false);
const isLoading = ref(false);
const highlightedIndex = ref(-1);

// Keep initial repos separate from search results
const initialRepos = ref<RepositoryInfo[]>([]);
const searchResults = ref<RepositoryInfo[]>([]);
const hasSearched = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const selectedRepos = computed(() => props.modelValue);

const filteredRepos = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  if (!query) {
    // No search - show initial repos (unselected only)
    return initialRepos.value
      .filter(r => !isSelected(r.nameWithOwner))
      .slice(0, 30);
  }

  // When searching, prioritize API results but also show local matches
  if (hasSearched.value && searchResults.value.length > 0) {
    // Merge API results with local matches, avoiding duplicates
    const resultSet = new Set<string>();
    const combined: RepositoryInfo[] = [];

    // Add API search results first (they're more relevant)
    for (const repo of searchResults.value) {
      if (!isSelected(repo.nameWithOwner) && !resultSet.has(repo.nameWithOwner)) {
        resultSet.add(repo.nameWithOwner);
        combined.push(repo);
      }
    }

    // Add local matches that weren't in API results
    for (const repo of initialRepos.value) {
      if (!isSelected(repo.nameWithOwner) && !resultSet.has(repo.nameWithOwner)) {
        const matches = repo.nameWithOwner.toLowerCase().includes(query) ||
          repo.name.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query);
        if (matches) {
          resultSet.add(repo.nameWithOwner);
          combined.push(repo);
        }
      }
    }

    return combined.slice(0, 25);
  }

  // While API is loading, show local matches
  return initialRepos.value
    .filter(r =>
      !isSelected(r.nameWithOwner) && (
        r.nameWithOwner.toLowerCase().includes(query) ||
        r.name.toLowerCase().includes(query) ||
        r.description?.toLowerCase().includes(query)
      )
    )
    .slice(0, 20);
});

function isSelected(repoName: string): boolean {
  return props.modelValue.includes(repoName);
}

function toggleRepo(repoName: string): void {
  if (isSelected(repoName)) {
    removeRepo(repoName);
  } else {
    addRepo(repoName);
  }
}

function addRepo(repoName: string): void {
  if (!isSelected(repoName)) {
    emit('update:modelValue', [...props.modelValue, repoName]);
    searchQuery.value = '';
    highlightedIndex.value = -1;
    hasSearched.value = false;
    searchResults.value = [];
  }
}

function removeRepo(repoName: string): void {
  emit('update:modelValue', props.modelValue.filter(r => r !== repoName));
}

function isValidRepoFormat(value: string): boolean {
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(value.trim());
}

function addManualRepo(): void {
  const repo = searchQuery.value.trim();
  if (isValidRepoFormat(repo)) {
    addRepo(repo);
  }
}

function handleSearch(): void {
  highlightedIndex.value = -1;

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  const query = searchQuery.value.trim();

  // If no query, show initial repos
  if (!query) {
    hasSearched.value = false;
    searchResults.value = [];
    return;
  }

  // Always search via API when user types (to find repos not in initial list)
  // Use debounce to avoid too many API calls
  if (query.length >= 2) {
    searchTimeout = setTimeout(async () => {
      await fetchSearchResults(query);
    }, 300);
  }
}

function handleEnter(): void {
  if (highlightedIndex.value >= 0 && highlightedIndex.value < filteredRepos.value.length) {
    toggleRepo(filteredRepos.value[highlightedIndex.value].nameWithOwner);
  } else if (isValidRepoFormat(searchQuery.value)) {
    addManualRepo();
  }
}

function navigateDown(): void {
  if (filteredRepos.value.length === 0) return;
  highlightedIndex.value = Math.min(highlightedIndex.value + 1, filteredRepos.value.length - 1);
  scrollToHighlighted();
}

function navigateUp(): void {
  if (filteredRepos.value.length === 0) return;
  highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
  scrollToHighlighted();
}

function scrollToHighlighted(): void {
  if (dropdownList.value && highlightedIndex.value >= 0) {
    const items = dropdownList.value.querySelectorAll('.dropdown-item');
    items[highlightedIndex.value]?.scrollIntoView({ block: 'nearest' });
  }
}

// Fetch initial repos (no search term)
async function fetchInitialRepos(): Promise<void> {
  isLoading.value = true;
  try {
    initialRepos.value = await props.fetchRepositories();
  } catch (error) {
    console.error('Failed to fetch repositories:', error);
  } finally {
    isLoading.value = false;
  }
}

// Fetch search results from API
async function fetchSearchResults(searchTerm: string): Promise<void> {
  isLoading.value = true;
  try {
    const results = await props.fetchRepositories(searchTerm);
    // Only update if the search term is still the same
    if (searchQuery.value.trim().toLowerCase() === searchTerm.toLowerCase()) {
      searchResults.value = results;
      hasSearched.value = true;
    }
  } catch (error) {
    console.error('Failed to search repositories:', error);
  } finally {
    isLoading.value = false;
  }
}

function formatStars(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

function handleClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target.closest('.repo-selector')) {
    showDropdown.value = false;
  }
}

// Load initial repos when component mounts
onMounted(async () => {
  document.addEventListener('click', handleClickOutside);
  await fetchInitialRepos();
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
});

// Reset highlighted index when dropdown visibility changes
watch(showDropdown, (visible) => {
  if (visible) {
    highlightedIndex.value = -1;
  }
});
</script>

<style scoped>
.repo-selector {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.selected-repos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.repo-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-accent-light);
  border: 1px solid var(--color-accent-primary);
  border-radius: var(--radius-xl);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-accent-primary);
}

.repo-name {
  font-weight: 500;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-accent-primary);
  cursor: pointer;
  opacity: 0.7;
  transition: all var(--transition-fast);
}

.remove-btn:hover {
  opacity: 1;
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
}

.search-container {
  position: relative;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 8px var(--spacing-sm) 8px 32px;
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
  transition: all var(--transition-fast);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 2px var(--color-accent-light);
}

.search-input::placeholder {
  color: var(--color-text-quaternary);
}

.loading-spinner {
  position: absolute;
  right: 10px;
}

.spinner {
  animation: spin 1s linear infinite;
  color: var(--color-text-tertiary);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg-themed);
  z-index: 100;
  max-height: 280px;
  overflow: hidden;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.dropdown-list {
  overflow-y: auto;
  max-height: 280px;
}

.dropdown-message {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.add-manual-btn {
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-accent-light);
  border: 1px solid var(--color-accent-primary);
  border-radius: var(--radius-xl);
  color: var(--color-accent-primary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.add-manual-btn:hover {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.dropdown-item:hover,
.dropdown-item.highlighted {
  background: var(--color-surface-hover);
}

.dropdown-item.selected {
  background: var(--color-accent-light);
}

.repo-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.repo-full-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo-description {
  font-size: 10px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 600;
}

.badge.private {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.badge.archived {
  background: var(--color-surface-secondary);
  color: var(--color-text-tertiary);
}

.stars {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--color-text-tertiary);
}

.check-icon {
  flex-shrink: 0;
  color: var(--color-accent-primary);
}

.hint {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin: 0;
}
</style>
