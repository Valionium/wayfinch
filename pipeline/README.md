# The weekly place packs

Map data from OpenStreetMap for ten countries, rebuilt by itself every Tuesday and put on a public data address. It costs nothing and needs no person.

## What runs

- **Weekly (Tuesday, early morning UTC):** `Place packs` builds each country, merges them, publishes, and checks the published data from outside.
- **Twice a month:** `Keep alive` switches the weekly schedule back on if GitHub paused it. It makes no commits.
- **Needs only two secrets** in the repository settings: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## If GitHub emails you: "Weekly place packs need a look"

One or more countries kept last week's data. Riders only see an older date; nothing is broken. Open the issue and read which country and since when. If the same country shows up three weeks in a row, ask a helper or tool to read the failed job's log (Actions → Place packs → the red run).

## If the log says the token was rejected

Make a new token and paste it over the old secret. On `https://dash.cloudflare.com` go to My Profile → API Tokens → Create Token → Create Custom Token. Name it `wayfinch-github-actions`, give it one right only (Account · Cloudflare Pages · Edit), leave the time limit empty. Then in GitHub open Settings → Secrets and variables → Actions and replace `CLOUDFLARE_API_TOKEN`. Never paste the token into a chat, file or email.

## If the schedule is paused

The Actions tab shows "disabled" for Place packs. Open Actions → Place packs → **Enable workflow**. One click.

## Adding a country

One new row in `pipeline/config.ts`, with its sentinel places. Then run the workflow by hand for that country.

## Commands

| Command | Does |
| --- | --- |
| `node pipeline/country.ts <CC> --built-on <date>` | classify one country (needs osmium) |
| `node pipeline/merge.ts --build-id <id> --built-at <time>` | merge the country files into one build |
| `node pipeline/publish-prepare.ts` | prepare the folder and store the archive |
| `node pipeline/check-live.ts <address> <build-id>` | read the published data back |
| `node pipeline/report.ts` | open or update the failure issue |

Data © OpenStreetMap contributors, under the ODbL licence.
