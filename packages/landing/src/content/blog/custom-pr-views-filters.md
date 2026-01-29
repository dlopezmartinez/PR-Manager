---
title: "Organize Your PRs with Custom Views"
description: "Learn how to create custom views and filters in PR Manager to organize Pull Requests exactly how you want them. Examples and best practices included."
author: "PR Manager Team"
category: "guides"
tags: ["custom views", "filters", "organization", "productivity", "workflow", "code review"]
draft: false
---

When you're managing dozens or even hundreds of Pull Requests across multiple repositories, organization is everything. PR Manager's custom views let you slice and dice your PRs any way you need.

## What Are Custom Views?

A custom view is a saved combination of filters that shows you exactly the PRs you want to see. Think of them as smart folders for your Pull Requests.

Instead of scrolling through a long list of all PRs, you can create views like:

- "Needs My Review" - PRs waiting for your review
- "My Open PRs" - PRs you've authored that are still open
- "Approved & Ready" - PRs that are approved and ready to merge
- "Draft PRs" - Work in progress that's not ready for review

## Built-in Views

PR Manager comes with two built-in views that you can't delete:

### Notifications Inbox

Your notification inbox collects all PR-related events:
- New review requests
- Comments on your PRs
- Status changes
- PRs ready to merge

This is your go-to view for catching up on what's happened.

### Pinned PRs

Pin important PRs for quick access. This view shows all your pinned PRs, making it easy to keep critical work visible.

## Creating Your First Custom View

Let's walk through creating a view step by step:

### Step 1: Click the "+" Button

In the sidebar, click the **+** button to create a new view.

### Step 2: Choose a Template

PR Manager offers several templates to get you started quickly:

- **From scratch** - Start with no filters
- **My PRs** - PRs where you're the author
- **Repository** - PRs from a specific repository
- **Review requested** - PRs where your review is requested
- **By labels** - PRs with specific labels
- **Team PRs** - PRs from your team members
- **Advanced query** - Custom filtering

### Step 3: Configure Filters

Depending on your template, you can add and configure filters:

**Available filter types:**
- Draft PRs / Non-draft PRs
- PRs with or without comments
- Needs review (REVIEW_REQUIRED state)
- Approved PRs
- Changes requested
- My review requested
- Exclude your own PRs

### Step 4: Choose Sorting

Sort your PRs by:
- Recently updated (newest or oldest first)
- Created date (newest or oldest)
- Comment count (most or fewest)
- Title (A-Z or Z-A)

### Step 5: Save Your View

Give your view a name and save it. It will appear in your sidebar for quick access.

## Essential Views Every Developer Needs

Here are the views we recommend setting up:

### 1. "Needs My Review"

**Template:** Review requested
**Why:** This is probably your most important view. These are PRs actively waiting for you to review.

**Pro tip:** Check this view first thing every morning and after lunch.

### 2. "My Open PRs"

**Template:** My PRs
**Filter:** Open PRs only
**Why:** Track all your work in progress. See at a glance which of your PRs need attention or are ready to merge.

### 3. "Ready to Merge"

**Template:** From scratch
**Filters:** Approved + Open
**Why:** PRs that are approved and ready - the satisfying moment when you can hit merge.

### 4. "Draft PRs"

**Template:** From scratch
**Filter:** Draft only
**Why:** Keep track of work in progress across your team.

## Views for Tech Leads

If you're overseeing a team, here are additional views to consider:

### "Team Activity"

Use the Team PRs template to see all recent PR activity across your team. Great for daily standups and keeping track of what everyone's working on.

### "Repository Focus"

Create views for your most critical repositories. If you have a production service that needs extra attention, having a dedicated view helps you stay on top of changes.

## Tips for Effective Views

### Keep Views Focused

Each view should answer one question:
- "What needs my review right now?"
- "What are my open PRs?"
- "What's approved and ready to merge?"

Don't try to create one view that shows everything - that defeats the purpose.

### Use the Tabs

Your views appear as tabs at the top of PR Manager. You can quickly switch between them with a click, making it easy to check different contexts throughout your day.

### Review and Update

As projects evolve, some views become more or less useful. Periodically review your views and delete ones you don't use anymore.

## Combining Views with Notifications

Custom views and the notification system work together:

1. **Create focused views** for different aspects of your work
2. **Follow individual PRs** that need extra attention
3. **Check the notification inbox** for updates across all your PRs

This combination ensures you never miss important updates while keeping your daily workflow organized.

## Conclusion

Custom views transform PR Manager from a simple PR list into a personalized command center. Take 10 minutes to set up your essential views, and you'll save time every day.

[Download PR Manager](/download) and start organizing your PRs today.

---

Want to learn more? Check out our [roadmap for multi-provider support](/blog/github-gitlab-unified-dashboard) coming soon.
