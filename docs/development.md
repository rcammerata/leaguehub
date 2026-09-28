# Development

For people who want to change League Hub or help with it. Using League Hub doesn't need any of this.

## The project

```
apps-script/        The Apps Script code, one file per topic (the source of dist/Code.gs)
  Util.gs           small helpers
  Config.gs         the Settings tab: every setting, reading and checking values, building the tab
  Espn.gs           ESPN fantasy API requests, picking the season, testing a league ID and cookies
  Nfl.gs            ESPN's NFL scoreboard: opponent, kickoff, score, quarter, clock; share of the game left
  Live.gs           players, live projections and lineups for the current week
  Model.gs          builds the website's data (the "feed"): standings, results, playoffs, rules
  Keepers.gs        keepers, keeper tags and the draft page
  Money.gs          dues, fees, the pot, prizes, payments and the settle-up
  History.gs        past seasons from ESPN
  Feed.gs           the timer: when to update, caching, the last good copy, alert emails
  WebApp.gs         doGet (the website and ?format=json) and doPost
  Commissioner.gs   Commissioner Tools: passcode, payments, cookies, update now
  Setup.gs          the League Hub menu, Set up, the cookies window, Status, Help
  appsscript.json   manifest, for people who use clasp
site/index.html     the website: one HTML file with its CSS and JavaScript, no libraries
build.js            builds dist/ and docs/demo/ from the two folders above
dist/               what people copy (built, and committed so nobody needs to build anything)
docs/               the guides, the screenshots and the demo page
tests/              tests, the Apps Script stand-ins and the made-up sample league
tools/              the screenshot script
```

Apps Script runs every `.gs` file in one shared scope, in the order the files were added. `build.js` joins them into one `Code.gs` in a fixed order, so people only have to paste one file. No file uses another file's constants while loading (a test checks this by loading them in reverse order).

## Build and test

You need [Node.js](https://nodejs.org) 18 or newer.

```sh
node build.js              # dist/Code.gs, dist/Index.html, dist/self-hosted/index.html, docs/demo/index.html
node tests/run_tests.js    # the Apps Script code against the sample league (no packages needed)
```

The browser tests and screenshots use [Playwright](https://playwright.dev):

```sh
npm install
npx playwright install chromium
npm run test:browser       # the real page against the real scripts: Apps Script mode, self-hosted mode, the demo
npm run screenshots        # docs/images
```

Run `node build.js` after changing anything in `apps-script/` or `site/`, and commit the rebuilt `dist/` and `docs/demo/` with your change. A test fails if `dist/` is out of date.

## How the tests work

- `tests/gas_mocks.js` has small stand-ins for the Apps Script services League Hub uses (SpreadsheetApp, PropertiesService, CacheService, UrlFetchApp and so on), and runs the `.gs` files in a Node `vm` context with a frozen clock.
- `tests/fake_league.js` is a made-up 10-team league ("Sunday Funday League", real NFL player names, made-up managers) that answers League Hub's ESPN and NFL scoreboard requests. It covers four points of a season: `week5` (live games), `week16` (playoff semifinals), `complete` (season over) and `predraft` (the next season before its draft), plus a private-league mode, expired cookies and an NFL scoreboard outage.
- `tests/sample_feeds.js` builds the website's data for those four points, for the tests, the demo page and the screenshots. `node tests/sample_feeds.js` writes them to `tests/out/`.

## The website's data

`lhGetFeed()` (and `?format=json` on the web app) returns one JSON object. The main parts:

| Key | What's in it |
| --- | --- |
| `ok`, `error`, `problem`, `setup` | whether the data is usable; `problem` is `auth`, `notFound` or `other` |
| `generatedAt`, `status`, `stale` | when it was built; whether the last update worked; `stale` when it's the saved copy |
| `league` | name, season, `phase` (`predraft`, `season`, `complete`), ESPN link, accent color, scoring, keeper count |
| `schedule` | regular season weeks, playoff teams, matchup periods → NFL weeks |
| `teams`, `standings`, `divisions` | teams with records, points, seeds, transactions; the standings order |
| `week`, `current` | this week's label and round; every matchup with scores and projections |
| `detail` | every lineup this week (players with points, projection, share of game left, stats, injury tag) and the NFL games |
| `results`, `highs` | every finished week's games; weekly high scores |
| `playoffs`, `final` | the playoff picture or the bracket; champion, runner-up and third place |
| `money` | the pot, fees, prizes, and every team's dues and settle-up (only when the Money page is on) |
| `keepers`, `draft`, `history` | keepers with tags and fees; the draft date, type and order; past seasons |
| `rules`, `options`, `refresh` | the rules summary and custom rules; the website switches; how often to check for new data |

## Using clasp

If you prefer to edit locally, [clasp](https://github.com/google/clasp) can push the `apps-script/` folder (with `appsscript.json`) straight to a script project. Because Apps Script loads files in the order they were added, push `dist/Code.gs` instead of the separate files if anything behaves differently.

## Guidelines

- Keep everything a commissioner reads plain and short: the website, the Settings tab, the menu, the guides.
- The website stays one file with no libraries or build step of its own, so anyone can host it anywhere.
- New ESPN fields: read them defensively (ESPN's answers vary by league and season) and add them to the sample league with a test.
- Never send cookies, the passcode, email addresses or the spreadsheet's address to the website. There's a test for this.
