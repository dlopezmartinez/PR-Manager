---
title: "How to Set Up PR Manager in 5 Minutes"
description: "A quick step-by-step guide to downloading, installing, and configuring PR Manager with GitHub and GitLab. Get up and running quickly."
author: "PR Manager Team"
category: "guides"
tags: ["setup", "installation", "github", "gitlab", "getting started", "configuration", "tutorial"]
draft: false
---

Ready to take control of your Pull Requests? This guide will have you up and running with PR Manager quickly, whether you're on macOS or Windows.

## Step 1: Download PR Manager

Head to our [download page](/download) and grab the installer for your operating system.

### macOS

- Download the `.dmg` file
- Double-click to mount
- Drag PR Manager to your Applications folder

**Apple Silicon and Intel Macs** are both supported.

### Windows

- Download the `.exe` installer
- Run the installer
- Follow the installation wizard
- PR Manager will be added to your Start menu

## Step 2: Launch and Initial Setup

When you first open PR Manager, you'll see the welcome screen. Let's connect your account.

**Note:** Currently, you can connect **either** GitHub or GitLab to PR Manager. Multi-provider support (using both simultaneously) is coming in a future release.

### Connecting GitHub

1. In PR Manager, go to **Settings**
2. Click **Add Account** and choose **GitHub**
3. A browser window opens for authentication
4. Review the permissions and click **Authorize**
5. Return to PR Manager - you're connected!

**What permissions does PR Manager need?**

PR Manager requests read access to your repositories and PRs. For full functionality (approve, comment, merge), you'll need to grant write access.

### Connecting GitLab

1. In **Settings**, click **Add Account**
2. Choose **GitLab**
3. Enter your GitLab instance URL:
   - For GitLab.com: `https://gitlab.com`
   - For self-hosted: Your instance URL (e.g., `https://gitlab.company.com`)
4. Create a Personal Access Token in GitLab:
   - Go to GitLab > Preferences > Access Tokens
   - Name: "PR Manager"
   - Scopes: `read_api` (add `api` for write access)
   - Click **Create token**
   - Copy the token
5. Paste the token in PR Manager
6. Click **Connect**

**Self-hosted GitLab note:** Make sure your GitLab instance is accessible from your computer. If it's behind a VPN, connect to VPN first.

## Step 3: Your First View

Now that you're connected, let's create your first custom view.

### The "Needs My Review" View

This is the most useful view - PRs waiting for your attention:

1. Click the **+** button in the sidebar
2. Choose the **Review requested** template
3. Give it a name like "Needs My Review"
4. Click **Save**

Your new view appears as a tab. Click it to see PRs awaiting your review.

### The "My Open PRs" View

Track your own work:

1. Click **+** again
2. Choose the **My PRs** template
3. Name it "My Open PRs"
4. Save

## Step 4: Configure Notifications

Don't miss important updates. Let's set up notifications:

1. Click the **gear icon** (Settings)
2. Go to **Notifications**
3. Enable the notifications you want:
   - **New PRs** - Get notified when new PRs need your attention
   - **New comments** - Get notified when someone comments on your PRs

4. Configure auto-refresh:
   - Enable background polling to stay updated
   - Set your preferred refresh interval (30 seconds to 10 minutes)

5. Click **Save**

## Step 5: Explore the Interface

You're set up! Here's a quick tour:

### Sidebar / Tabs
- Your saved views appear as tabs
- Built-in views: Notifications and Pinned
- Click **+** to create new views

### PR Cards
- Each PR shows title, author, status, and CI status
- Hover to see quick actions (Approve, Request Changes, Comment)
- Click to expand details

### PR Details
- File changes, additions, and deletions
- Reviewers and their status
- Comments (expandable)
- CI/CD checks (expandable)
- Merge button when ready

### Settings
- Account management
- Display preferences (theme, zoom)
- Notification settings
- Follow-up preferences

## Optional: Fine-Tuning

### Display Preferences

Customize how PR Manager looks and behaves:

1. **Settings** > **Display**
2. Options:
   - Show/hide comments by default
   - Show/hide CI checks by default
   - Choose theme (System, Light, Dark)
   - Adjust zoom level (80% - 150%)

### Filtering Preferences

1. **Settings** > **Filtering**
2. Configure explicit reviewer behavior - show only PRs where you're directly requested, not just team requests

## Troubleshooting Common Issues

### "No PRs showing up"

- Check that your token has the correct permissions
- Try clicking **Refresh** in the app
- Verify your account connection in Settings

### "GitHub connection failed"

- Make sure you completed the OAuth flow in your browser
- Check if you have an ad blocker that might interfere
- Try disconnecting and reconnecting

### "GitLab token not working"

- Verify the token hasn't expired
- Confirm scopes include `read_api` at minimum
- For self-hosted, ensure the URL is correct (include `https://`)

### "Notifications not appearing"

- Check system notification settings for PR Manager
- On macOS: System Settings > Notifications > PR Manager
- On Windows: Settings > System > Notifications > PR Manager
- Ensure Do Not Disturb/Focus mode isn't blocking them

## What's Next?

You're all set up! Here are some next steps:

1. **Create more views** - Set up views for different projects or contexts
2. **Pin important PRs** - Keep critical PRs visible
3. **Follow PRs** - Get notified about specific PRs you care about
4. **Use quick actions** - Approve and comment without opening your browser

## Need Help?

If you run into issues, check our [blog](/blog) for more guides and tips.

Welcome to PR Manager! We're excited to help you manage your PRs more efficiently.

---

Ready to explore more features? Learn about [custom views](/blog/custom-pr-views-filters) or check out our [roadmap for multi-provider support](/blog/github-gitlab-unified-dashboard).
