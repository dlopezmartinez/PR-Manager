/**
 * GitLab GraphQL Mutations for Merge Request Actions
 */

// Approve a merge request
export const APPROVE_MERGE_REQUEST_MUTATION = `
  mutation ApproveMergeRequest($projectPath: ID!, $iid: String!) {
    mergeRequestSetAssignees(input: {
      projectPath: $projectPath,
      iid: $iid
    }) {
      mergeRequest {
        id
        approved
      }
      errors
    }
  }
`;

// Note: GitLab approval is done via REST API, not GraphQL
// We'll use REST for approve/unapprove

// Add a note (comment) to a merge request
export const CREATE_NOTE_MUTATION = `
  mutation CreateNote($noteableId: NoteableID!, $body: String!) {
    createNote(input: {
      noteableId: $noteableId,
      body: $body
    }) {
      note {
        id
        body
        createdAt
        author {
          id
          username
          name
          avatarUrl
        }
      }
      errors
    }
  }
`;

// Accept (merge) a merge request
export const ACCEPT_MERGE_REQUEST_MUTATION = `
  mutation AcceptMergeRequest($projectPath: ID!, $iid: String!, $squash: Boolean, $squashCommitMessage: String) {
    mergeRequestAccept(input: {
      projectPath: $projectPath,
      iid: $iid,
      squash: $squash,
      squashCommitMessage: $squashCommitMessage
    }) {
      mergeRequest {
        id
        state
        mergedAt
        webUrl
      }
      errors
    }
  }
`;

// Update merge request (for setting draft status, etc.)
export const UPDATE_MERGE_REQUEST_MUTATION = `
  mutation UpdateMergeRequest($projectPath: ID!, $iid: String!, $draft: Boolean) {
    mergeRequestUpdate(input: {
      projectPath: $projectPath,
      iid: $iid,
      draft: $draft
    }) {
      mergeRequest {
        id
        draft
        state
      }
      errors
    }
  }
`;
