# Troubleshooting

Start with **League Hub → Status & Website Address** in the spreadsheet. It shows when the last update ran, whether it worked, anything wrong on the Settings tab, and the website's address.

**Contents**

- [Setup](#setup)
- [The Website](#the-website)
- [Scores & Data](#scores--data)
- [Starting Over](#starting-over)

---

## Setup

### The League Hub Menu Doesn't Show Up

- Reload the spreadsheet and wait a few seconds. The menu appears after the rest of the page.
- Make sure the League Hub code is in `Code.gs` and saved (**Extensions → Apps Script**: the file should start with "League Hub" in a comment, and there should be no "unsaved" dot next to its name).
- Still nothing? In Apps Script, pick **onOpen** in the function menu at the top (next to **Debug**) and click **Run**, then go back to the sheet.

### "Google hasn't verified this app"

That's expected. The script is your own copy, not an app from Google's marketplace. Click **Advanced → Go to League Hub (unsafe)**, then **Allow**. Details are in [Setup](setup.md#3-run-set-up).

### "You do not have permission to call …" or "Authorization is required"

A permission wasn't allowed (Google lets you uncheck some). Run **League Hub → Set Up** again and allow all of them. If Google doesn't ask again, remove League Hub at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) (**Third-party apps & services**), then run Set up again.

### "That Doesn't Look Like an ESPN League Address"

Paste the address of your league's page on ESPN. It contains `leagueId=` followed by a number, like `https://fantasy.espn.com/football/league?leagueId=12345678`. Just the number works too. League Hub is for ESPN **football** leagues only.

### "ESPN has no league with ID …"

Check the number on the Settings tab ("ESPN League ID or Link"). If you set **Season** to a year, make sure the league existed that year. With **Auto**, League Hub shows this year's season, or last year's if the league hasn't been renewed yet.

### "Your League Is Private"

Your league needs ESPN cookies. See [Private Leagues](private-leagues.md).

## The Website

### The Website Asks People to Sign In to Google

The web app's access has to be **Anyone**. In Apps Script: **Deploy → Manage deployments** → pencil icon → **Who has access: Anyone** → **Deploy**.

If **Anyone** isn't in the list, your Google account is a school or work account whose admin doesn't allow public web apps. Set up League Hub again with a personal Google account.

### "Almost Ready" on the Website

League Hub isn't connected to a league yet. Run **League Hub → Set Up** in the spreadsheet. On a page you host yourself, "Almost ready" means the Apps Script address isn't filled in (see [Hosting](hosting.md#option-b-host-the-page-yourself)).

### "Script function not found: doGet", or a Blank Page

The deployment is running old or missing code. Make sure `Code.gs` and the HTML file named exactly **Index** are saved, then publish a new version: **Deploy → Manage deployments** → pencil icon → **Version: New version** → **Deploy**.

### The Website Shows "Last updated … ago" with a Note

- "ESPN needs the commissioner to reconnect League Hub": your private league's cookies stopped working. Paste new ones ([Private Leagues](private-leagues.md#when-they-stop-working)).
- "ESPN isn't answering right now": ESPN is having trouble, or is briefly blocking requests. League Hub keeps trying and the note goes away by itself.

### My Change on the Settings Tab Doesn't Show

Changes show up at the next update, within a few minutes. Click **League Hub → Update Now** to see them right away. If a value isn't valid, **League Hub → Status & Website Address** lists it under "Check the Settings tab".

## Scores & Data

### Scores Aren't Updating

1. **League Hub → Status & Website Address**: is the last update recent, and did it work?
2. If it says updates are paused, click **League Hub → Resume Automatic Updates**.
3. Click **League Hub → Update Now**. If it fails, the message says why.
4. If the last update is old and nothing failed, the timer may be missing. In Apps Script, click **Triggers** (the alarm clock on the left): there should be one for `refreshLeague`. If not, run **League Hub → Set Up** again (it keeps your settings).

### Live Scores Are a Little Different from ESPN's

During games, ESPN updates its scores every minute or so, and League Hub every few minutes (the **Update Every (Minutes)** setting). Projections during games are League Hub's own estimate (see [How it Works](how-it-works.md#live-projections)). Final scores always match ESPN.

### A Player Shows "–" Instead of Points

The player's game hasn't started yet. The line under the name shows the kickoff time.

### The Wrong Season Is Showing

With **Season: Auto**, League Hub switches to the new season once you renew the league on ESPN (the website then shows the draft countdown). Click **League Hub → Update Now** to check right away. To keep showing a particular season, type its year in **Season**.

### League History Is Missing Seasons

- Seasons before 2018 need ESPN cookies, even for public leagues (ESPN's rule). See [Private Leagues](private-leagues.md).
- League Hub reads two past seasons per update, so a long history fills in over a few updates.
- A season ESPN hasn't finished (no final standings) is skipped.

### Keepers Don't Show Before the Draft

Before the draft, League Hub shows the keepers ESPN shares, which depends on the league's settings. After the draft, keepers always show (ESPN marks them in the draft results).

### The Draft Order Isn't Shown

It shows once the order is set on ESPN. Until then, League Hub uses the reverse of last season's final standings, if ESPN has them.

### Google Says a Quota or Limit Was Reached

Google limits how much a free account's scripts can do each day. League Hub normally uses a small part of it (see [How it Works](how-it-works.md#googles-limits)). If you run other scripts in the same account, set **Update Every (Minutes)** to 10 or 15 minutes.

## Starting Over

To stop League Hub completely: click **League Hub → Pause Automatic Updates**, then in Apps Script delete the deployment (**Deploy → Manage deployments → Archive**) and the timer (**Triggers** → ⋮ → **Delete trigger**). Deleting the spreadsheet removes everything.

To start fresh with the same spreadsheet, run **League Hub → Set Up** again. It keeps the Settings and Payments tabs and replaces the timer.
