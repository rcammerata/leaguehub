# Setting up League Hub

League Hub is for leagues that play on ESPN but want more than ESPN offers: dues and payouts tracked automatically, the league's own prizes and rules, league history, and one website for everyone. See [Who it's for](../README.md#who-its-for).

Setup takes about 15 minutes, and only the commissioner (or whoever runs the website) does it. League members don't need to do anything but open the link.

**How it fits together:** the spreadsheet holds your settings and payments, and a script inside it (Apps Script) reads your league from ESPN every few minutes and publishes the website. Nothing to install and no server.

Use a computer for setup. The Apps Script editor doesn't work well on phones.

**Contents**

1. [Make the spreadsheet](#1-make-the-spreadsheet)
2. [Add the League Hub code](#2-add-the-league-hub-code)
3. [Run Set up](#3-run-set-up)
4. [Publish the website](#4-publish-the-website)
5. [Share it with your league](#5-share-it-with-your-league)
6. [Optional extras](#6-optional-extras)

---

## 1. Make the spreadsheet

1. Go to [sheets.new](https://sheets.new) (or Google Drive → **New → Google Sheets**) while signed in to your Google account.
2. Give it a name, like "League Hub". Click "Untitled spreadsheet" at the top left to rename it.

A personal Google account works best. School and work accounts sometimes aren't allowed to publish public web pages (see [Troubleshooting](troubleshooting.md#the-website-asks-people-to-sign-in-to-google)).

## 2. Add the League Hub code

League Hub is two files: `Code.gs` (the part that talks to ESPN) and `Index.html` (the website).

1. In the spreadsheet, click **Extensions → Apps Script**. The Apps Script editor opens in a new tab with a file named `Code.gs`.
2. Click **Untitled project** at the top and rename it **League Hub**. (Google shows this name when it asks for permission.)
3. Open [dist/Code.gs](../dist/Code.gs) from this project. On GitHub, use the **Copy raw file** button (the two-squares icon at the top right of the file).
4. In the editor, click inside `Code.gs`, select everything (**Ctrl+A**, or **⌘+A** on a Mac), and paste (**Ctrl+V** or **⌘+V**) so League Hub replaces what was there.
5. Next to **Files** on the left, click **+** → **HTML**. Type **Index** as the name and press Enter. (The editor adds `.html`. The name must be exactly `Index`, with a capital I.)
6. Open [dist/Index.html](../dist/Index.html), copy it the same way, select everything in the new `Index.html` file and paste.
7. Click the **Save project** icon (the floppy disk), or press **Ctrl+S** / **⌘+S**.

You should now have two files: `Code.gs` and `Index.html`.

## 3. Run Set up

1. Go back to the spreadsheet tab and **reload the page**. After a few seconds a **League Hub** menu appears at the top, next to Help.
2. Click **League Hub → Set up (start here)**.
3. Google asks for permission the first time:
   1. **Authorization required** → click **OK** (or **Continue**) and pick your Google account.
   2. **Google hasn't verified this app** → click **Advanced**, then **Go to League Hub (unsafe)**.
      This warning appears for every script that isn't published on Google's marketplace. It's your own copy of the code, running in your own account.
   3. On the list of permissions, check **Select all** if you see checkboxes, then click **Allow** (or **Continue**). What each permission is for:
      - *See and edit the spreadsheet this app is installed in*: the Settings and Payments tabs. League Hub can't open your other files.
      - *Connect to an external service*: reading your league from ESPN.
      - *Allow this application to run when you are not present*: the timer that keeps scores up to date.
      - *Display and run third-party web content in prompts and sidebars*: League Hub's setup windows.
      - *Send email as you*: an optional note to **you** if updates stop working (for example, expired ESPN cookies). It never emails anyone else.
4. If nothing else happens after you click Allow, click **League Hub → Set up (start here)** again. (The first click sometimes only asks for permission.)
5. League Hub adds two tabs, **Settings** and **Payments**, and asks for your league:
   - On ESPN, open your league (on a computer, at [fantasy.espn.com](https://fantasy.espn.com)) and copy the address from the browser's address bar. It looks like `https://fantasy.espn.com/football/league?leagueId=12345678`.
   - Paste it into the box and click **OK**. Just the number (`12345678`) works too.
6. League Hub checks the league with ESPN:
   - **Public league**: you see "Connected" with your league's name. Continue with step 4 below.
   - **Private league**: League Hub asks for your ESPN cookies. Click **Yes** and follow [Private leagues](private-leagues.md). It takes about two minutes.

From now on the sheet updates your league's data by itself, every few minutes during games.

## 4. Publish the website

1. Go back to the Apps Script tab (or click **Extensions → Apps Script** again).
2. Click the blue **Deploy** button at the top right → **New deployment**.
3. Next to **Select type**, click the gear icon → **Web app**.
4. Fill it in:
   - **Description**: anything, like "League Hub".
   - **Execute as**: **Me** (your email address).
   - **Who has access**: **Anyone**. (Not "Anyone with Google account", or league members would have to sign in.)
5. Click **Deploy**. If Google asks to authorize again, allow it the same way as before.
6. Copy the **Web app** address (it ends in `/exec`) and open it in a new tab. That's your league's website.

"Execute as: Me" means the website runs as you, so it can read the league data your script saved. Visitors can only see the website. They can't see your spreadsheet or your Google account.

You can find this address again anytime: **League Hub → Status and website address**, or in Apps Script under **Deploy → Manage deployments**.

## 5. Share it with your league

- Send the link in your league's group chat.
- On an iPhone, open it in Safari, tap **Share → Add to Home Screen** to get an app-like icon. On Android, open it in Chrome, tap the **⋮** menu → **Add to Home screen**.
- The address is long. You can put it behind a short link (any link shortener works), or host the page at your own address. See [Hosting](hosting.md).

Google shows a small gray bar at the top of Apps Script websites ("This application was created by a Google Apps Script user"). That's normal. It goes away if you [host the page yourself](hosting.md#option-b-host-the-page-yourself).

## 6. Optional extras

- **Make it yours**: the **Settings** tab has the league name, accent color, how manager names show, your league's rules and more. See [Settings](settings.md).
- **Money page**: set **Money page** to **Yes** on the Settings tab and fill in your fees and prizes. See [Money](money.md).
- **Commissioner Tools**: click **League Hub → Commissioner passcode** and pick a passcode (8 or more characters). Then the link at the bottom of the website, "Commissioner Tools", lets you record payments, paste new ESPN cookies and update right away from your phone.
- **Check on it**: **League Hub → Status and website address** shows when the last update ran, whether it worked and your website's address.

That's it. When a new version of League Hub comes out, see [Updating](updating.md).
