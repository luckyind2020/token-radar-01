[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/luckyind2020/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/luckyind2020/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

My entry for [token-radar-01](https://make.fun/bounty/token-radar-01) on make.fun:
a program that reads a sealed snapshot of every protocol DefiLlama tracks, ranks the ones that
record no token by what their launch would be worth, and hands in a web dashboard with the board,
a detail view for each protocol and the steps to farm it.

Referral code: `4ha9jy2z`

## The model (radar-2)

The board covers all 40 watchlist protocols plus every other pre-token protocol the house's own
watchlist rule keeps — 198 rows, the whole radar, not a sample. The multiple is the market's, not
a hand-picked constant: for each category, the median market-cap-to-TVL ratio of the live-token
protocols in that category (at least three of them, CEX excluded); a thin category falls back to
the global median. Then:

```
implied = round( tvl_usd x category-multiple x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

"No token" means the protocol's DefiLlama record carries no token — a record is not proof a token
does not exist. Implied values are the model's claim, never make.fun's.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only. The program writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` to the output directory. The dashboard is a static page with
no network: open `out/dashboard/index.html` in a browser.

## Layout

- `main.ts`: reads the snapshot, builds the board, writes the outputs and the dossier.
- `lib/model.ts`: the radar-2 model — the market multiples, the implied-value function, the farm plans.
- `dashboard/`: the page — sortable and filterable board, per-protocol detail view, live-token view.
- `vendor/makefun-board.ts`: make.fun's dossier library, copied from the kit unchanged.
- `screenshots/`: the board, a protocol's detail view and a filtered view.
- `LICENSE` (MIT): the entry's licence.

This entry is MIT licensed.
