# How it works

**Contents**

- [The big picture](#the-big-picture)
- [When data updates](#when-data-updates)
- [Where the data comes from](#where-the-data-comes-from)
- [Live projections](#live-projections)
- [Win probability](#win-probability)
- [Tags on the website](#tags-on-the-website)
- [Google's limits](#googles-limits)
- [Security](#security)

---

## The big picture

```
 ESPN fantasy (your league)  ─┐
                              ├─►  your spreadsheet's script  ─►  saved league data  ─►  the website
 ESPN NFL scoreboard         ─┘    (a timer, every few minutes)     (script cache)        (anyone with the link)
```

1. A timer in your spreadsheet's Apps Script project runs every few minutes (the **Update every** setting).
2. When an update is due, it reads your league from ESPN, works out standings, playoffs, money and so on, and saves the result as one bundle of data.
3. The website is served by the same Apps Script project. Visitors get the saved data right away, so they never wait for ESPN, and ESPN sees the same few requests no matter how many people visit.
4. An open website checks for new data every few minutes by itself, and the refresh button at the top gets it right away.

Nothing runs on anyone else's computer or server. It's all in your Google account.

## When data updates

| When | How often |
| --- | --- |
| NFL games on, or kicking off within 15 minutes | Every **Update every** minutes (5 by default) |
| During the season, no games on | Every 30 minutes, then often again from about 15 minutes before each kickoff |
| Around your draft (3 hours before and after) | Every 5 minutes |
| Off-season | Every 2 hours |
| After you edit the Settings or Payments tab | At the timer's next run |
| **League Hub → Update now** or Commissioner Tools → Update Now | Right away |

## Where the data comes from

- **Your league**: ESPN's fantasy API, the same one ESPN's own website uses (`lm-api-reads.fantasy.espn.com`). ESPN doesn't document it, so League Hub reads it the way well-known open-source projects do (like [espn-api](https://github.com/cwendt94/espn-api)). Each update asks for the league (settings, teams, records, the schedule) and, during the season, this week's box scores. Injury tags come from the rosters (at most every 15 minutes). The draft, keepers, player names and past seasons are read once and saved.
- **NFL games**: ESPN's public NFL scoreboard, for each player's opponent, kickoff time, score, quarter and game clock. Read at most once per update, and once an hour when no games are on.

## Live projections

During games, each team's projection is League Hub's estimate of its final score, based on how much of each player's game is left.

For each starter:

- **A**: points so far this week (from ESPN),
- **P**: ESPN's projection for the player's whole game,
- **r**: the share of the player's game that's left, from the NFL game clock: regulation time left ÷ 60 minutes. It's 1 before kickoff and 0 once the game is final (or the player's team is on a bye). A game in overtime, or at 0:00 of the 4th quarter before it's official, counts as 1% left until it's marked final.

The player's live projection is:

- **Offense and kickers: A + r × P**. The points so far, plus the projection for the part of the game that's left.
- **Team defenses (D/ST): (1 − r) × A + r × P**. A defense's points can go down during a game (points allowed), so its projection slides from ESPN's projection toward its actual points as the game goes on.

The team's projection is the sum of its starters' projections. It never goes below the team's actual score, except while one of its defenses is playing (since that defense can still lose points).

If the game clock is ever missing or out of date, League Hub counts down from kickoff instead, assuming a game lasts about 3 hours 15 minutes.

For playoff rounds that last two weeks, the matchup's projection adds the points from the round's earlier week and estimates the later week from this week's projections.

## Win probability

The matchup page shows each team's chance to win (you can turn it off on the Settings tab). It's a simple model:

- Each starter who still has game left adds uncertainty: about **1.15 × P** points, scaled down by how much of the game is left (a finished player adds none).
- The two teams' uncertainties are combined, and the chance is how likely the team that's behind in projection is to make up the gap, using a bell curve.
- It's shown between 1% and 99% until the matchup is final.

It's meant for fun, not for betting.

## Tags on the website

- **Injury tags** (from ESPN): **Q** questionable, **D** doubtful, **O** out, **IR** injured reserve, **SSPD** suspended, **DTD** day-to-day.
- **Keeper tags**: **R3** means the player was drafted in round 3 last season, **K** means the player was a keeper last season too, **UD** means nobody drafted the player last season.
- **Crown**: next to the reigning champion. This season's champion once it's decided, otherwise last season's.

## Google's limits

Free Google accounts can use Apps Script within [daily quotas](https://developers.google.com/apps-script/guides/services/quotas). League Hub stays well inside them:

| Limit (free account) | League Hub's use |
| --- | --- |
| 20,000 web requests a day | A few hundred on a full NFL Sunday, far fewer on other days |
| 90 minutes of timer run time a day | Usually under 15 minutes. Most timer runs only check whether an update is due and take well under a second. |
| 500 KB of Script Properties | Under about 100 KB (saved seasons, the last good data, settings for private leagues) |

Google Workspace (work or school) accounts have higher limits.

## Security

- **ESPN cookies** (private leagues) are kept in Script Properties, sent only to ESPN, and never put on the sheet or the website. Anyone with edit access to the spreadsheet could see them, so only share edit access with people you trust with your ESPN login.
- **The commissioner passcode** is never stored. League Hub keeps a salted SHA-256 fingerprint of it and compares fingerprints. After 10 wrong passcodes, Commissioner Tools lock for 15 minutes.
- **The website's data** only includes what league members can see on ESPN, with manager names shortened or hidden if you choose. It never includes cookies, the passcode, email addresses or the spreadsheet's address.
- **The spreadsheet menu** (Set up, ESPN cookies, pause and so on) only works from the spreadsheet itself, never from the website, even though the website runs as your account.
- **Spreadsheet access**: League Hub can only open the spreadsheet it's in (Apps Script's `@OnlyCurrentDoc`). Team names from ESPN that start with `=`, `+`, `-` or `@` are written to the sheet as plain text, never as formulas.
