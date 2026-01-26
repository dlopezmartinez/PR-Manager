<template>
  <div class="dialog-overlay" @click.self="$emit('cancel')">
    <div class="dialog-content">
      <div class="dialog-header">
        <h2>{{ isEditing ? 'Edit View' : 'Create Custom View' }}</h2>
        <button class="close-btn" @click="$emit('cancel')" title="Close">
          <X :size="16" :stroke-width="2" />
        </button>
      </div>

      <div class="dialog-body">
        <div class="step-indicator" v-if="!isEditing">
          <div class="step" :class="{ active: currentStep === 1, completed: currentStep > 1 }">
            <span class="step-number">1</span>
            <span class="step-label">Choose type</span>
          </div>
          <div class="step-line" :class="{ active: currentStep >= 2 }"></div>
          <div class="step" :class="{ active: currentStep === 2 }">
            <span class="step-number">2</span>
            <span class="step-label">Configure</span>
          </div>
        </div>

        <div v-if="currentStep === 1" class="step-content">
          <p class="step-intro">Start with a template or create from scratch</p>

          <div class="templates-grid">
            <button
              class="template-card"
              :class="{ selected: selectedTemplate === 'scratch' }"
              @click="selectTemplate('scratch')"
            >
              <div class="template-card-icon">
                <Sparkles :size="24" :stroke-width="1.5" />
              </div>
              <div class="template-card-content">
                <h4>Start from scratch</h4>
                <p>Build your own custom view with full control</p>
              </div>
            </button>

            <button
              class="template-card"
              :class="{ selected: selectedTemplate === 'my-prs' }"
              @click="selectTemplate('my-prs')"
            >
              <div class="template-card-icon">
                <User :size="24" :stroke-width="1.5" />
              </div>
              <div class="template-card-content">
                <h4>My PRs</h4>
                <p>PRs you've created (open, closed, or all)</p>
              </div>
            </button>

            <button
              class="template-card"
              :class="{ selected: selectedTemplate === 'repo-specific' }"
              @click="selectTemplate('repo-specific')"
            >
              <div class="template-card-icon">
                <FolderGit2 :size="24" :stroke-width="1.5" />
              </div>
              <div class="template-card-content">
                <h4>Repository PRs</h4>
                <p>All PRs from specific repositories</p>
              </div>
            </button>

            <button
              class="template-card"
              :class="{ selected: selectedTemplate === 'review-requested' }"
              @click="selectTemplate('review-requested')"
            >
              <div class="template-card-icon">
                <Eye :size="24" :stroke-width="1.5" />
              </div>
              <div class="template-card-content">
                <h4>Review requested</h4>
                <p>PRs where you're requested as reviewer</p>
              </div>
            </button>

            <button
              class="template-card"
              :class="{ selected: selectedTemplate === 'by-label' }"
              @click="selectTemplate('by-label')"
            >
              <div class="template-card-icon">
                <Tag :size="24" :stroke-width="1.5" />
              </div>
              <div class="template-card-content">
                <h4>By labels</h4>
                <p>Filter PRs by specific labels (bug, urgent, etc.)</p>
              </div>
            </button>

            <button
              class="template-card"
              :class="{ selected: selectedTemplate === 'team-prs' }"
              @click="selectTemplate('team-prs')"
            >
              <div class="template-card-icon">
                <Users :size="24" :stroke-width="1.5" />
              </div>
              <div class="template-card-content">
                <h4>Team PRs</h4>
                <p>PRs from specific team members</p>
              </div>
            </button>

            <button
              v-if="!isGitLab"
              class="template-card"
              :class="{ selected: selectedTemplate === 'advanced' }"
              @click="selectTemplate('advanced')"
            >
              <div class="template-card-icon">
                <Code :size="24" :stroke-width="1.5" />
              </div>
              <div class="template-card-content">
                <h4>Advanced query</h4>
                <p>Write a custom {{ providerName }} search query</p>
              </div>
            </button>
          </div>
        </div>

        <div v-if="currentStep === 2" class="step-content">
          <div class="form-row">
            <div class="form-group flex-grow">
              <label for="view-name">View name</label>
              <input
                id="view-name"
                v-model="formData.name"
                type="text"
                placeholder="e.g., Urgent PRs"
                required
              />
            </div>
            <div class="form-group icon-group">
              <label for="view-icon">Icon</label>
              <input
                id="view-icon"
                v-model="formData.icon"
                type="text"
                placeholder="🔥"
                maxlength="2"
                class="icon-input"
              />
            </div>
          </div>

          <div v-if="showRepositorySelector" class="form-group">
            <label>Repositories</label>
            <RepositorySelector
              v-model="selectedRepositories"
              :fetch-repositories="fetchRepositories"
              placeholder="Search repositories..."
              hint="Select repositories to filter PRs. Leave empty to search all."
            />
          </div>

          <div v-if="showLabelsInput" class="form-group">
            <label for="view-labels">Labels</label>
            <input
              id="view-labels"
              v-model="labelsInput"
              type="text"
              placeholder="e.g., bug, urgent, security"
            />
            <span class="hint">Comma-separated list of labels to filter by</span>
          </div>

          <div v-if="showAuthorsInput" class="form-group">
            <label for="view-authors">Authors</label>
            <input
              id="view-authors"
              v-model="authorsInput"
              type="text"
              placeholder="e.g., username1, username2"
            />
            <span class="hint">Comma-separated list of {{ providerName }} usernames</span>
          </div>

          <div v-if="showAdvancedQuery && !isGitLab" class="form-group">
            <label for="custom-query">{{ providerName }} search query</label>
            <textarea
              id="custom-query"
              v-model="formData.customQuery"
              placeholder="is:pr is:open review-requested:{{username}}"
              rows="4"
              class="code-input"
            />
            <span class="hint">
              Use <code>{{username}}</code> for your {{ providerName }} username.
              <a
                href="https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests"
                target="_blank"
                rel="noopener"
              >
                Learn query syntax
              </a>
            </span>
          </div>

          <div v-if="showQuickFilters" class="quick-filters">
            <h4>Filters</h4>
            <div class="filter-grid">
              <div class="filter-item">
                <label for="view-state">PR State</label>
                <select id="view-state" v-model="formData.state">
                  <option value="open">Open only</option>
                  <option :value="undefined">Any state</option>
                  <option value="closed">Closed only</option>
                </select>
              </div>

              <div class="filter-item">
                <label for="view-sort">Sort by</label>
                <select id="view-sort" v-model="formData.sortBy">
                  <option value="updated">Recently updated</option>
                  <option value="created">Recently created</option>
                </select>
              </div>
            </div>

            <div class="checkbox-filters">
              <label class="checkbox-label">
                <input type="checkbox" v-model="includeDrafts" />
                <span>Include draft PRs</span>
              </label>

              <label class="checkbox-label">
                <input type="checkbox" v-model="formData.applyExplicitReviewerFilter" />
                <span>Explicit reviewer only (exclude team assignments)</span>
              </label>
            </div>
          </div>

          <div v-if="queryPreview" class="query-preview">
            <h4>
              <Code :size="14" :stroke-width="2" />
              Generated query
            </h4>
            <code>{{ queryPreview }}</code>
          </div>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>
      </div>

      <div class="dialog-footer">
        <button v-if="currentStep === 2 && !isEditing" class="btn btn-text" @click="currentStep = 1">
          <ChevronLeft :size="16" :stroke-width="2" />
          Back
        </button>
        <div class="footer-spacer"></div>
        <button class="btn btn-secondary" @click="$emit('cancel')">Cancel</button>
        <button
          v-if="currentStep === 1"
          class="btn btn-primary"
          @click="goToStep2"
          :disabled="!selectedTemplate"
        >
          Continue
          <ChevronRight :size="16" :stroke-width="2" />
        </button>
        <button
          v-else
          class="btn btn-primary"
          @click="handleSave"
          :disabled="!isValid"
        >
          {{ isEditing ? 'Save changes' : 'Create view' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  X, ChevronLeft, ChevronRight, Sparkles, FolderGit2, Eye, Tag, Users, Code, User
} from 'lucide-vue-next';
import RepositorySelector from './RepositorySelector.vue';
import type { ViewConfig, ViewEditorFormData } from '../model/view-types';
import type { PullRequestBasic, RepositoryInfo } from '../model/types';
import { useGitProvider } from '../composables/useGitProvider';
import { configStore } from '../stores/configStore';

type TemplateType = 'scratch' | 'my-prs' | 'repo-specific' | 'review-requested' | 'by-label' | 'team-prs' | 'advanced';

const props = defineProps<{
  view?: ViewConfig;
}>();

const emit = defineEmits<{
  (e: 'save', view: ViewConfig): void;
  (e: 'cancel'): void;
}>();

const { pullRequests } = useGitProvider();

// Provider-specific helpers
const isGitLab = computed(() => configStore.providerType === 'gitlab');
const providerName = computed(() => isGitLab.value ? 'GitLab' : 'GitHub');
const prTerminology = computed(() => isGitLab.value ? 'Merge Request' : 'Pull Request');

const isEditing = computed(() => !!props.view);
const currentStep = ref(isEditing.value ? 2 : 1);
const selectedTemplate = ref<TemplateType | null>(isEditing.value ? 'scratch' : null);

const formData = ref<ViewEditorFormData>({
  name: props.view?.name || '',
  icon: props.view?.icon || '',
  customQuery: '',
  repositories: [],
  labels: [],
  authors: [],
  isDraft: undefined,
  state: 'open',
  reviewStatus: undefined,
  sortBy: 'updated',
  applyExplicitReviewerFilter: props.view?.applyExplicitReviewerFilter ?? false,
});

const selectedRepositories = ref<string[]>([]);
const labelsInput = ref('');
const authorsInput = ref('');
const includeDrafts = ref(false);
const error = ref('');

const showRepositorySelector = computed(() =>
  ['scratch', 'repo-specific', 'by-label', 'team-prs'].includes(selectedTemplate.value || '')
);

const showLabelsInput = computed(() =>
  ['scratch', 'by-label'].includes(selectedTemplate.value || '')
);

const showAuthorsInput = computed(() =>
  ['scratch', 'team-prs'].includes(selectedTemplate.value || '')
);

const showAdvancedQuery = computed(() =>
  selectedTemplate.value === 'advanced'
);

const showQuickFilters = computed(() =>
  !['advanced'].includes(selectedTemplate.value || '')
);

const isMyPrsTemplate = computed(() =>
  selectedTemplate.value === 'my-prs'
);

const isValid = computed(() => {
  if (!formData.value.name.trim()) return false;
  if (selectedTemplate.value === 'advanced' && !formData.value.customQuery?.trim()) return false;
  return true;
});

const queryPreview = computed(() => {
  if (selectedTemplate.value === 'advanced') {
    return formData.value.customQuery || '';
  }
  return buildQueryTemplate(formData.value);
});

function selectTemplate(template: TemplateType): void {
  selectedTemplate.value = template;

  // Pre-fill based on template
  switch (template) {
    case 'my-prs':
      formData.value.name = 'My PRs';
      formData.value.icon = '📝';
      formData.value.customQuery = 'is:pr author:{{username}}';
      break;
    case 'repo-specific':
      formData.value.name = '';
      formData.value.icon = '📁';
      break;
    case 'review-requested':
      formData.value.name = 'Review Requested';
      formData.value.icon = '👀';
      formData.value.customQuery = 'is:pr is:open review-requested:{{username}}';
      break;
    case 'by-label':
      formData.value.name = '';
      formData.value.icon = '🏷️';
      break;
    case 'team-prs':
      formData.value.name = 'Team PRs';
      formData.value.icon = '👥';
      break;
    case 'advanced':
      formData.value.name = '';
      formData.value.icon = '⚙️';
      formData.value.customQuery = 'is:pr is:open involves:{{username}}';
      break;
    case 'scratch':
    default:
      formData.value.name = '';
      formData.value.icon = '📋';
      break;
  }
}

function goToStep2(): void {
  if (selectedTemplate.value) {
    currentStep.value = 2;
  }
}

function parseCommaSeparated(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildQueryTemplate(data: ViewEditorFormData): string {
  if (selectedTemplate.value === 'my-prs') {
    const parts: string[] = ['is:pr', 'author:{{username}}'];

    if (data.state) parts.push(`is:${data.state}`);

    if (!includeDrafts.value) {
      parts.push('-is:draft');
    }

    return parts.join(' ');
  }

  if (data.customQuery && data.customQuery.trim() && selectedTemplate.value === 'advanced') {
    return data.customQuery.trim();
  }

  if (selectedTemplate.value === 'review-requested') {
    const parts: string[] = ['is:pr', 'review-requested:{{username}}'];
    if (data.state) parts.push(`is:${data.state}`);
    if (!includeDrafts.value) parts.push('-is:draft');
    return parts.join(' ');
  }

  const parts: string[] = ['is:pr'];

  if (data.state) parts.push(`is:${data.state}`);

  if (!includeDrafts.value) {
    parts.push('-is:draft');
  }

  if (selectedRepositories.value.length > 0) {
    parts.push(...selectedRepositories.value.map((r) => `repo:${r}`));
  }

  const labels = parseCommaSeparated(labelsInput.value);
  if (labels.length > 0) {
    parts.push(...labels.map((l) => `label:${l}`));
  }

  const authors = parseCommaSeparated(authorsInput.value);
  if (authors.length > 0) {
    parts.push(...authors.map((a) => `author:${a}`));
  }

  if (authors.length === 0) {
    parts.push('involves:{{username}}');
  }

  return parts.join(' ');
}

function buildFilterFunction(data: ViewEditorFormData): ((pr: PullRequestBasic, username: string) => boolean) | undefined {
  if (data.reviewStatus && !data.customQuery) {
    return (pr: PullRequestBasic, username: string) => {
      if (data.reviewStatus === 'pending') {
        return pr.myReviewStatus === 'pending';
      } else if (data.reviewStatus === 'approved') {
        return pr.reviews?.nodes?.some(
          (review) => review.author?.login === username && review.state === 'APPROVED'
        ) || false;
      } else if (data.reviewStatus === 'changes-requested') {
        return pr.reviews?.nodes?.some(
          (review) => review.author?.login === username && review.state === 'CHANGES_REQUESTED'
        ) || false;
      }
      return true;
    };
  }
  return undefined;
}

function buildSorterFunction(data: ViewEditorFormData): ((a: PullRequestBasic, b: PullRequestBasic) => number) | undefined {
  if (data.sortBy === 'created') {
    return (a: PullRequestBasic, b: PullRequestBasic) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    };
  }
  return undefined;
}

async function fetchRepositories(searchTerm?: string): Promise<RepositoryInfo[]> {
  try {
    return await pullRequests.getRepositories(searchTerm, 50);
  } catch (error) {
    console.error('Failed to fetch repositories:', error);
    return [];
  }
}

function handleSave(): void {
  error.value = '';

  if (!isValid.value) {
    error.value = 'Please fill in all required fields';
    return;
  }

  // Update form data from inputs
  formData.value.repositories = selectedRepositories.value;
  formData.value.labels = parseCommaSeparated(labelsInput.value);
  formData.value.authors = parseCommaSeparated(authorsInput.value);
  formData.value.isDraft = includeDrafts.value ? true : undefined;

  // Generate view ID
  const viewId = props.view?.id || `custom-${Date.now()}`;

  // Build query template
  const queryTemplate = buildQueryTemplate(formData.value);

  // Create ViewConfig
  const newView: ViewConfig = {
    id: viewId,
    name: formData.value.name,
    icon: formData.value.icon,
    queryBuilder: (username: string) => queryTemplate.replace(/\{\{username\}\}/g, username),
    filter: buildFilterFunction(formData.value),
    sorter: buildSorterFunction(formData.value),
    deduplicate: false,
    pageSize: 20,
    readonly: false,
    order: props.view?.order || 999,
    applyExplicitReviewerFilter: formData.value.applyExplicitReviewerFilter,
  };

  emit('save', newView);
}

onMounted(() => {
  if (isEditing.value && props.view) {
    selectedTemplate.value = 'scratch';
  }
});
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  will-change: opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  isolation: isolate;
}

.dialog-content {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg-themed);
  border: 1px solid var(--color-border-secondary);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg) var(--spacing-xl);
  border-bottom: 1px solid var(--color-border-secondary);
}

.dialog-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--color-text-tertiary);
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  transition: color var(--transition-fast);
}

.close-btn:hover {
  color: var(--color-text-primary);
}

.dialog-body {
  padding: var(--spacing-xl);
  overflow-y: auto;
  flex: 1;
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xl);
}

.step {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--color-text-tertiary);
}

.step.active {
  color: var(--color-accent-primary);
}

.step.completed {
  color: var(--color-success);
}

.step-number {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-surface-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.step.active .step-number {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
}

.step.completed .step-number {
  background: var(--color-success);
  color: var(--color-text-inverted);
}

.step-label {
  font-size: 13px;
  font-weight: 500;
}

.step-line {
  width: 40px;
  height: 2px;
  background: var(--color-border-secondary);
}

.step-line.active {
  background: var(--color-accent-primary);
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.step-intro {
  margin: 0;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
}

.template-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--color-surface-primary);
  border: 2px solid var(--color-border-secondary);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
}

.template-card:hover {
  border-color: var(--color-border-primary);
  background: var(--color-surface-hover);
}

.template-card.selected {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-light);
}

.template-card-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-surface-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
}

.template-card.selected .template-card-icon {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
}

.template-card-content h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.template-card-content p {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

.form-row {
  display: flex;
  gap: var(--spacing-md);
}

.flex-grow {
  flex: 1;
}

.icon-group {
  width: 80px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.form-group input[type='text'],
.form-group select,
.form-group textarea {
  padding: 10px 12px;
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: var(--font-family);
  background: var(--color-surface-primary);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast);
}

.form-group input[type='text']:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 3px var(--color-accent-light);
}

.icon-input {
  text-align: center;
  font-size: 18px !important;
}

.code-input {
  font-family: var(--font-family-mono, monospace);
  font-size: 12px !important;
  resize: vertical;
}

.hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

.hint code {
  background: var(--color-surface-secondary);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  font-size: 10px;
}

.hint a {
  color: var(--color-accent-primary);
  text-decoration: none;
}

.hint a:hover {
  text-decoration: underline;
}

.quick-filters {
  background: var(--color-surface-primary);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
}

.quick-filters h4 {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-item label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.filter-item select {
  padding: 8px 10px;
  font-size: 12px;
}

.checkbox-filters {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.checkbox-label input {
  cursor: pointer;
}

.query-preview {
  background: var(--color-surface-secondary);
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.query-preview h4 {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin: 0 0 var(--spacing-xs) 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.query-preview code {
  display: block;
  font-family: var(--font-family-mono, monospace);
  font-size: 11px;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.error-message {
  background: var(--color-error-bg);
  color: var(--color-error);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 13px;
  margin-top: var(--spacing-md);
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg) var(--spacing-xl);
  border-top: 1px solid var(--color-border-secondary);
}

.footer-spacer {
  flex: 1;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
}

.btn-text {
  background: none;
  color: var(--color-text-secondary);
  padding: 10px 12px;
}

.btn-text:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-hover);
}

.btn-secondary {
  background: var(--color-surface-secondary);
  color: var(--color-text-primary);
}

.btn-secondary:hover {
  background: var(--color-surface-hover);
}

.btn-primary {
  background: var(--color-accent-primary);
  color: var(--color-text-inverted);
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
