# Private leagues: ESPN cookies

ESPN only shows a private league to its members. So League Hub reads your private league the way your own browser does: with the two cookies ESPN saves when you log in, called **espn_s2** and **SWID**. You copy them once and League Hub keeps them. They usually keep working for about a year.

Public leagues don't need any of this. Not sure which yours is? Run **League Hub → Set up**. It tells you if the league is private.

You need a computer for this (phone browsers can't show cookies). It takes about two minutes.

**Contents**

- [Copy the cookies](#copy-the-cookies): [Chrome or Edge](#chrome-or-edge) · [Safari](#safari) · [Firefox](#firefox)
- [Paste them into League Hub](#paste-them-into-league-hub)
- [When they stop working](#when-they-stop-working)
- [Keeping them safe](#keeping-them-safe)

---

## Copy the cookies

First, go to [fantasy.espn.com](https://fantasy.espn.com), log in with an ESPN account that's in the league (yours is fine) and open your league. Then follow the steps for your browser.

### Chrome or Edge

1. Right-click anywhere on the page and click **Inspect**. (Or press **F12**, or **⌘+Option+I** on a Mac.) A panel opens.
2. At the top of the panel, click **Application**. If you don't see it, click **»** to find it.
3. On the left, under **Storage**, open **Cookies** and click **https://fantasy.espn.com**.
4. In the **Filter** box, type `espn_s2`. Double-click the long text in the **Value** column to select it, and copy it (**Ctrl+C** or **⌘+C**). Paste it somewhere for a moment, like a note.
5. In the Filter box, type `SWID` and copy its Value the same way. It looks like `{1A2B3C4D-...}`, with the curly brackets.

### Safari

1. Turn on Safari's developer tools: **Safari → Settings → Advanced** → check **Show features for web developers** (older versions: **Show Develop menu in menu bar**).
2. On the ESPN page, click **Develop → Show Web Inspector**.
3. Click the **Storage** tab, open **Cookies**, and click **fantasy.espn.com**.
4. Find **espn_s2** and **SWID** in the list, and copy each one's **Value**.

### Firefox

1. Press **F12** (or **⌘+Option+I** on a Mac), then click the **Storage** tab.
2. Open **Cookies** on the left and click **https://fantasy.espn.com**.
3. Find **espn_s2** and **SWID**, and copy each one's **Value**.

## Paste them into League Hub

**In the spreadsheet:** click **League Hub → ESPN cookies (private leagues)**, paste **SWID** and **espn_s2** into the two boxes and click **Save**. (During Set up, this window opens by itself.)

**Or on the website:** open **Commissioner Tools** (link at the bottom of the website; needs the [commissioner passcode](setup.md#6-optional-extras)) and use the ESPN Cookies form. This works from a phone once you have the values.

League Hub tests them with ESPN first and only saves them if ESPN accepts them. If it says ESPN didn't accept them, copy them again while logged in and retry. The usual mistakes are copying the cookie's name instead of its value, or missing part of the long espn_s2 value.

## When they stop working

Cookies end when ESPN ends that login, usually after about a year, or sooner if you log out of ESPN in that browser. When that happens:

- The website keeps showing the last scores it had, with a note that scores couldn't update.
- If **Email me when something breaks** is **Yes** on the Settings tab, you get an email (at most one a day).
- **League Hub → Status and website address** shows "failed: ESPN needs a login".

To fix it, copy fresh cookies (steps above) and paste them in. Updates start again right away.

## Keeping them safe

These two cookies are a login to your ESPN account, so treat them like a password:

- League Hub keeps them in the script's private storage (Script Properties). They're never put on the spreadsheet, never shown on the website and never sent anywhere but ESPN.
- Anyone you give **edit** access to the spreadsheet can open its Apps Script project and could see them. Only share edit access with people you'd trust with your ESPN login. View-only access is fine.
- To remove them, open **Extensions → Apps Script → Project Settings** (the gear icon), and under **Script Properties** delete **LH_ESPN_S2** and **LH_ESPN_SWID**. Logging out of ESPN in the browser you copied them from also ends them.
