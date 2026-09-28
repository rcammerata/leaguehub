# Hosting the website

There are two ways to give your league the website. Both show the same pages with the same data.

| | Apps Script (the default) | Host the page yourself |
| --- | --- | --- |
| Setup | Nothing extra | About 10 minutes |
| Address | `script.google.com/macros/s/…/exec` | Your own, like `ourleague.netlify.app` |
| Google's gray bar at the top | Yes | No |
| Opens instantly on repeat visits | Yes | Yes (the page remembers the last data) |
| Commissioner Tools | Yes | Yes |

---

## Option A: the Apps Script address

This is what [Setup](setup.md#4-publish-the-website) gives you: Apps Script publishes the website and the page comes with the latest data built in.

- Find the address anytime: **League Hub → Status and website address**, or in Apps Script under **Deploy → Manage deployments**.
- The address stays the same as long as you keep that deployment. When you [update League Hub](updating.md), edit the existing deployment (**Manage deployments** → pencil icon → **Version: New version** → **Deploy**) instead of making a new one, so the address doesn't change.
- To shorten it, put it behind a short link from any link shortener.
- To put it on a Google Site: in Google Sites, **Insert → Embed → By URL**, and paste the address.

## Option B: host the page yourself

The website is a single file. You can put it on any web host, and it reads your league's data from your Apps Script web app. So do Option A first: the Apps Script web app has to stay published.

1. **Get the page.** Download [dist/self-hosted/index.html](../dist/self-hosted/index.html) from this project. On GitHub, click **Download raw file** (the arrow icon at the top right of the file).
2. **Connect it to your league.** Open the file in a plain text editor (Notepad on Windows; TextEdit on a Mac after **Format → Make Plain Text**). Near the top, find this line:

   ```js
   var LEAGUE_HUB_FEED_URL = '';
   ```

   Paste your Apps Script web app address (it ends in `/exec`) between the quotes, and save:

   ```js
   var LEAGUE_HUB_FEED_URL = 'https://script.google.com/macros/s/AKfyc…/exec';
   ```

   Keep the file named `index.html`.
3. **Put it online.** Any static web host works. Two free ones:
   - **Netlify Drop**: put `index.html` in a folder of its own, go to [app.netlify.com/drop](https://app.netlify.com/drop), and drag the folder onto the page. You get an address right away. Make a free account to keep the site and rename it (**Site configuration → Change site name**).
   - **GitHub Pages**: make a new repository, upload `index.html`, then go to **Settings → Pages**, set **Branch** to `main` and `/ (root)`, and **Save**. The site is at `https://<your-username>.github.io/<repository>/` after a minute or two.
4. Open your new address. You should see your league. Share that address instead of the Apps Script one.

Both hosts let you use your own domain name. See their help pages if you want one.

### Good to know

- The page asks Apps Script for new data every few minutes while it's open, and saves the last data in the browser so it opens instantly next time.
- Scores never require uploading the page again, because they come from Apps Script. You only upload again when you update League Hub. That matters on hosts that count uploads: Netlify's free plan, for example, charges each deploy against a monthly allowance.
- Commissioner Tools work the same way. The passcode is checked by Apps Script, never by the page.
- If you ever make a **new** deployment in Apps Script, its address changes. Paste the new one into the page and upload it again. (Editing the existing deployment keeps the address.)
- When you update League Hub, download the new `self-hosted/index.html` too, and paste your address into it again.
