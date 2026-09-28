# Updating League Hub

When a new version comes out, you replace the two files and publish a new version of the website. Your settings, payments, ESPN cookies, passcode and saved history stay as they are, and the website keeps its address.

See [CHANGELOG.md](../CHANGELOG.md) for what's new in each version. Your current version is at the bottom of **League Hub → Help**.

## Steps

1. **Replace Code.gs.** Open the new [dist/Code.gs](../dist/Code.gs) and copy it (on GitHub: **Copy raw file**). In the spreadsheet, click **Extensions → Apps Script**, open `Code.gs`, select everything (**Ctrl+A** / **⌘+A**) and paste.
2. **Replace Index.html** the same way, with the new [dist/Index.html](../dist/Index.html).
3. **Save** (**Ctrl+S** / **⌘+S**).
4. **Publish the new version of the website.** Click **Deploy → Manage deployments**, click the pencil icon, set **Version** to **New version**, and click **Deploy**.
   Don't use **New deployment** here: that makes a second website with a different address.
5. **Run Set up once.** Back in the spreadsheet, reload the page and click **League Hub → Set up (start here)**. It adds any new settings to the Settings tab (keeping all of yours) and restarts the timer. If Google asks for permission again, the new version needs something new. Allow it the same way as the first time.

If you [host the page yourself](hosting.md#option-b-host-the-page-yourself), also download the new `dist/self-hosted/index.html`, paste your Apps Script address into it again and upload it.

## If something goes wrong

- The website still looks old: make sure you did step 4 (a new version of the existing deployment), then reload the website.
- "Script function not found": `Code.gs` didn't save, or part of it is missing. Paste it again and save.
- Going back: every earlier version is on the project's Releases page (or in the Git history). Paste the older files the same way.
