# Money

The Money page keeps the league's books. ESPN tracks the games, and League Hub tracks the money around them: who has paid their dues, what fees each team has run up, what it has won, and who pays or gets paid at the end. It's off until you turn it on.

**Contents**

- [How money works in League Hub](#how-money-works-in-league-hub)
- [Turn it on](#turn-it-on)
- [Dues](#dues)
- [Fees during the season](#fees-during-the-season)
- [Prizes](#prizes)
- [The settle-up](#the-settle-up)
- [Recording payments](#recording-payments)
- [A full example](#a-full-example)
- [Good to know](#good-to-know)

---

## How money works in League Hub

Like most leagues, money changes hands twice:

1. **Before the season: dues.** Each team pays the entry fee, plus its keeper fees in a keeper league.
2. **After the season: the settle-up.** Each team's pickup and trade fees are weighed against what it won (weekly high scores and season prizes). The league pays each team the difference, or the team pays the league.

If your league settles everything at the end instead (entry fee included), set **Entry fee is due** to **At the end of the season** on the Settings tab. Then there's just one settle-up.

## Turn it on

On the **Settings** tab, set **Money page** to **Yes**, then fill in the fees and prizes you use (see [Settings](settings.md#money)). Leave a fee at `0` if your league doesn't have it.

## Dues

A team's dues are:

- the **entry fee**,
- plus its **keeper fees** (keeper leagues only).

Keeper fees can be one amount for every keeper (`20`) or depend on where the player was drafted last season, like `1:50, 2:40, 3:30, K:50, UD:0`:

- `1`, `2`, `3`, … is the round the player was drafted in last season (shown on the website as R1, R2, R3, …),
- `K` is a player who was a keeper last season too,
- `UD` is a player nobody drafted last season (picked up during the season).

Rounds you leave out are free. The League page shows each keeper with its tag and fee.

The Money page lists every team that still owes dues, and how much. Once a team's payments cover its dues, it moves to the "Paid" list.

## Fees during the season

- **Pickup fee**: for each player a team adds (free agents and waiver claims, counted by ESPN), after its free pickups.
- **Trade fee**: for each trade a team makes. Both teams in a trade pay it.

These add up during the season and are settled after it, so nobody has to pay a couple of dollars every week.

## Prizes

**Weekly high score**: the week's top scorer wins the weekly prize. If two teams tie, they split it. By default only regular season weeks count. Set **Weekly prize weeks** to **Every week** to include the playoffs.

**Season prizes** are the rows of the Prizes table on the Settings tab. Each prize is either:

- **dollars**, like `300`: exactly that amount, or
- **a percent**, like `50%`: a share of what's left of the pot after the weekly prizes (for the whole season) and the dollar prizes.

The **pot** is every team's dues plus every fee. So if your percents add up to 100%, the prizes pay out the whole pot, no matter how many pickups there were. Percent prizes grow during the season as fees come in, and are final when the season ends.

League Hub fills in the winners as soon as they're decided (see [Settings](settings.md#prizes) for each rule). You can also type a team name for a prize you award yourself.

## The settle-up

For each team, the settle-up is:

**what it won** (weekly high scores and prizes) **− its pickup and trade fees**, plus anything it paid beyond its dues, minus anything the league already paid it.

- Above zero: **Gets**. The league pays the team that much.
- Below zero: **Pays**. The team pays the league that much.
- Zero: **Even** during the season, and **Settled** once it's done.

During the season, the Money page shows where each team stands **so far**. After the championship it's the final amount. Click a team to see how its number adds up.

## Recording payments

Every payment is one row on the **Payments** tab:

| Date | Team | Amount | Note | Season |
| --- | --- | --- | --- | --- |
| 2026-08-30 | Touchdown Turtles | 140 | Dues (entry + keeper), Venmo | |
| 2027-01-06 | Red Zone Rebels | -435 | Settle-up | |

- **Positive** amounts are money a team paid the league.
- **Negative** amounts are money the league paid a team (the settle-up, prizes paid early, refunds).
- **Team** must match a team's name on ESPN. The dropdown lists them. (A team's ESPN abbreviation or manager name works too.)
- **Season** is usually left blank. League Hub goes by the date, and payments in January and February count toward the season before (that's when most settle-ups happen). Type a year only for a payment that belongs to a different season than its date says. This way the tab keeps every season's payments, and a new season starts with a clean slate.

Money a team pays in covers its dues first. Anything more counts toward its settle-up.

You can also record payments from your phone: **Commissioner Tools** on the website → **Record a Payment**. It adds the same row to the Payments tab, and the team list shows what each team owes.

If a row's team doesn't match any team (for example after a team is renamed on ESPN), Commissioner Tools points it out. Fix the name on the Payments tab.

## A full example

A 10-team league with a $100 entry fee, $2 pickups after 5 free ones, $5 trades, a $20 weekly prize for 14 weeks, and the default prizes (50%, 25%, 10%, 15%).

**Before the season**, each team pays $100 in dues: **$1,000**.

**During the season**, teams run up **$150** in pickup and trade fees. The pot is $1,000 + $150 = **$1,150**.

- Weekly prizes: 14 weeks × $20 = **$280**.
- Left for the percent prizes: $1,150 − $280 = **$870**: Champion $435, Runner-up $217.50, Third place $87, Most points $130.50.
- $280 + $870 = $1,150, the whole pot.

**After the season**, one team made 8 pickups (3 over the free 5: $6) and 1 trade ($5), so its fees are $11. It won two weekly prizes ($40). Its settle-up is $40 − $11 = **Gets $29**. Pay it, record −29 on the Payments tab, and it shows **Settled**.

## Good to know

- Anyone with the website's link can see the Money page. If your league would rather keep money private, leave it off.
- League Hub never moves money. It only keeps track of it.
- The numbers update with everything else, every few minutes during games. A payment you add on the Payments tab shows up within a few minutes (or right away with **League Hub → Update now**).
- **League Hub → Status and website address** warns you if your prizes add up to more than the pot.
