/**
 * GitLab GraphQL Mutations for Merge Request Actions
 */

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
