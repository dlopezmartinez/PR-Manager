---
title: "Quick Actions: Approve, Comment, and Merge Without Leaving the App"
description: "Learn how PR Manager's quick actions let you approve PRs, request changes, add comments, and merge - all without opening your browser."
author: "PR Manager Team"
category: "features"
tags: ["quick actions", "productivity", "approve", "merge", "comment", "code review", "workflow"]
draft: false
---

One of the biggest time-wasters in PR management is the constant back-and-forth to the browser. Open GitHub, wait for the page to load, find the review button, submit... Now imagine doing that 20 times a day.

PR Manager's quick actions let you take action on PRs directly from the app - no browser required.

## Available Quick Actions

PR Manager supports four essential actions that cover 95% of what you need to do with PRs:

### 1. Approve

The green checkmark. When a PR looks good, click **Approve** and you're done. No page loads, no waiting.

**When to use:**
- The code is good and ready to merge
- You've reviewed the changes and have no concerns
- You want to signal your approval quickly

### 2. Request Changes

When something needs to be fixed, click **Request Changes** and add your feedback. The PR author will be notified that changes are needed.

**When to use:**
- You've found bugs or issues in the code
- The implementation doesn't match requirements
- There are style or best practice concerns

**Note:** Request Changes requires a comment explaining what needs to change. This ensures the author knows exactly what to fix.

### 3. Comment

Add a comment without approving or requesting changes. Perfect for asking questions, making suggestions, or leaving feedback that doesn't block the PR.

**When to use:**
- You have questions about the implementation
- You want to suggest alternatives (but they're not required)
- You're leaving a note for other reviewers
- You want to discuss something before making a decision

### 4. Merge

When a PR is approved and all checks pass, merge it directly from PR Manager. Choose your merge method (merge commit, squash, or rebase) and click merge.

**When to use:**
- The PR is approved
- CI/CD checks are passing
- You're ready to ship the changes

## How to Use Quick Actions

Quick actions appear on each PR card when you hover over it. You'll see three buttons:

- **✓** (green) - Approve
- **✗** (red) - Request Changes
- **💬** (blue) - Comment

For merging, open the PR details and use the merge button when the PR is ready.

## The Workflow in Action

Here's what a typical review workflow looks like with quick actions:

### Scenario: Morning PR Review

1. Open PR Manager and go to your "Needs My Review" view
2. See 5 PRs waiting for your review
3. First PR: Quick code fix, looks good → Click **Approve**
4. Second PR: Has a bug → Click **Request Changes**, explain the issue
5. Third PR: Need clarification → Click **Comment** with your question
6. Fourth PR: Approved yesterday, CI passed → Click **Merge**
7. Fifth PR: Complex change, needs deeper review → Open in browser for detailed review

Total time: A few minutes instead of opening 5 browser tabs and navigating through 5 different pages.

## When to Use Browser vs. Quick Actions

Quick actions are perfect for:
- Simple reviews where you can see the code changes clearly
- Approving PRs you've already reviewed
- Leaving quick comments or questions
- Merging approved PRs

Use the browser when:
- You need to do a line-by-line code review
- You want to leave inline comments on specific code lines
- You need to view the full diff in detail
- Complex PRs that need careful examination

**Pro tip:** Use the "Open in browser" option in PR Manager to quickly jump to the PR page when you need more detail.

## Merge Options

When merging a PR, you can choose:

- **Merge commit** - Creates a merge commit preserving all original commits
- **Squash and merge** - Combines all commits into one
- **Rebase and merge** - Rebases commits onto the base branch

The available options depend on what your repository allows.

## CI/CD Awareness

PR Manager shows you the CI/CD status for each PR:

- **Green check** - All checks passing
- **Red X** - Checks failing
- **Yellow clock** - Checks in progress

You can only merge PRs when CI checks are passing (unless the repository allows bypassing).

## Review Status at a Glance

Each PR card shows its review status:

- **Approved** (green) - Someone approved this PR
- **Changes Requested** (red) - Changes were requested
- **Pending** (yellow) - Waiting for review

This helps you quickly scan your PR list and see what needs attention.

## Putting It All Together

Quick actions shine when combined with PR Manager's other features:

1. **Create a "Needs My Review" view** - See all PRs waiting for you
2. **Use quick actions** to process simple reviews quickly
3. **Pin complex PRs** that need more time
4. **Follow PRs** you've reviewed to get notified when they're updated
5. **Merge from the app** when PRs are ready

This workflow keeps you in flow state instead of context-switching between browser tabs.

## Start Using Quick Actions Today

Quick actions are one of PR Manager's most time-saving features. Download the app and see how much faster your PR workflow can be.

[Download PR Manager](/download)

---

Want to organize your PRs better? Check out our guide on [custom views and filters](/blog/custom-pr-views-filters).
