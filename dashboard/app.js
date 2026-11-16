// Token Radar's dashboard, radar-2. It reads window.RADAR (written beside dashboard/ by main.ts)
// and draws the ranked board, a filterable table, a per-protocol detail dialog with the model's own
// inputs and the protocol's farm plan, and the market multiples the model used. No network: every
// byte it shows is in data.js. The farm plan is the same derivation main.ts writes to board.json:
// category, chains, TVL and age decide the action, the capital, the hold and every cost and time.
// No name is special-cased.
(function () {
  'use strict';

  const DATA = window.RADAR;
  if (!DATA) return;
  const mount = document.getElementById('board');
  const view = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    const a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  };
  const pct = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  };
  const age = (days) => {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  };
  const mult = (n) => 'x' + n.toFixed(3);

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  const impliedOf = (row, model) => {
    const change = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    const clamped = Math.min(model.growth_cap, Math.max(model.growth_floor, change));
    const growthMult = 1 + (clamped / 100) * model.growth_weight;
    const ageDays = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    const maturity = model.maturity_floor + (Math.min(Math.max(ageDays, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity));
  };

  // Build one element: h(tag, attrs, children). Attributes named onClick and the like become
  // listeners; 'class', 'text' and 'html' are handled directly; the rest are set as attributes.
  const h = (tag, attrs, children) => {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value === null || value === undefined) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value);
      }
    }
    const kids = children === undefined || children === null ? [] : Array.isArray(children) ? children : [children];
    const pushChild = (child) => {
      if (child === null || child === undefined) return;
      if (Array.isArray(child)) { child.forEach(pushChild); return; }
      if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    };
    for (const child of kids) pushChild(child);
    return node;
  };

  // The farm plan, step for step the same derivation as lib/model.ts farmSteps: same branches, same
  // capitals, same holds, same costs and times, so the page's plan and board.json's plan agree.
  const mainChain = (p) => (p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain');
  const capitalFor = (p) => {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  };
  const holdFor = (ageDays) => {
    if (ageDays === null || ageDays === undefined) return 30;
    if (ageDays < 180) return 60;
    if (ageDays < 365) return 45;
    return 30;
  };
  const hasAny = (text, words) => words.some((w) => text.indexOf(w) >= 0);
  // Each entry: the category words that select it, and the action it writes. The order is the
  // model's order: the first match wins.
  const ACTIONS = [
    { words: ['lend', 'cdp', 'collateral'], make: (p, cap, chain) => 'Put $' + cap + ' of USDC into ' + p.name + ' on ' + chain + ' as a supply, then borrow $20 of a stablecoin against it and pay it back the next week.' },
    { words: ['dex', 'leveraged farm'], make: (p, cap, chain) => 'Add $' + cap + ' of liquidity to ' + p.name + "'s biggest pool on " + chain + ' and swap $10 through that pool once a week.' },
    { words: ['yield', 'yield aggregator'], make: (p, cap, chain) => 'Put $' + cap + ' of USDC into ' + p.name + "'s largest vault on " + chain + ' and leave the vault shares staked.' },
    { words: ['staking', 'restak', 'staking pool'], make: (p, cap) => 'Stake $' + cap + " of the chain's staking asset through " + p.name + ' and hold the receipt token in the same wallet.' },
    { words: ['perpetual', 'derivative', 'options', 'basis'], make: (p, cap) => 'Deposit $' + cap + ' of USDC as margin on ' + p.name + ' and open a single hedged trade of about $10 notional.' },
    { words: ['prediction'], make: (p, cap) => 'Fund ' + p.name + ' with $' + cap + ' and take one market position, then settle it before that market closes.' },
    { words: ['curator', 'allocator', 'risk'], make: (p, cap, chain) => 'Deposit $' + cap + ' into a ' + p.name + ' vault on ' + chain + ' and hold the vault shares until the end of the hold.' },
    { words: ['stable'], make: (p, cap, chain) => 'Mint or deposit $' + cap + ' of the stable asset through ' + p.name + ' on ' + chain + ' and keep it in the same wallet.' },
    { words: ['rwa'], make: (p, cap, chain) => 'Mint $' + cap + ' of the yield-bearing asset ' + p.name + ' issues on ' + chain + ' and hold it for the full period.' },
    { words: ['insurance'], make: (p, cap, chain) => 'Buy $' + cap + ' of cover from ' + p.name + ' on ' + chain + ' and keep the policy live for the full hold.' },
    { words: ['bridge', 'cross chain'], make: (p, cap, chain) => 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + p.name + ' and spend the bridged funds in its app once.' },
    { words: ['index'], make: (p, cap, chain) => 'Buy $' + cap + ' of ' + p.name + "'s index token on " + chain + ' and hold it for the full period.' },
    { words: ['launchpad'], make: (p, cap, chain) => 'Stake $' + cap + ' in ' + p.name + "'s launch pool on " + chain + ' and join one sale while it is open.' },
    { words: ['payment'], make: (p, cap, chain) => 'Send $' + cap + ' of USDC through ' + p.name + ' on ' + chain + ' and keep the receipt for your farm log.' },
    { words: ['ai', 'agent'], make: (p, cap, chain) => 'Deposit $' + cap + ' into ' + p.name + ' on ' + chain + ' and finish one of its agent tasks end to end.' },
    { words: ['nft'], make: (p, cap, chain) => 'List or buy one low-priced item through ' + p.name + ' on ' + chain + ' and keep the wallet active.' },
    { words: ['privacy'], make: (p, cap, chain) => 'Deposit $' + cap + " through " + p.name + "'s private pool on " + chain + ' and withdraw it once after a week.' },
  ];
  const WEEKLIES = [
    { words: ['lend', 'cdp', 'collateral'], text: 'Do one qualifying action a week: a supply, a borrow or a repayment.' },
    { words: ['dex', 'leveraged farm'], text: 'Swap $10 through the pool once a week so the wallet shows steady volume.' },
    { words: ['perpetual', 'derivative', 'options', 'basis'], text: 'Open and close one small trade a week so the wallet shows steady volume.' },
    { words: ['prediction'], text: 'Take one small market position a week and settle it before the market closes.' },
    { words: ['bridge', 'cross chain'], text: 'Bridge a small amount once a week so the wallet shows repeated crossings.' },
    { words: ['staking', 'restak'], text: 'Claim or restake the staking rewards once a week so the wallet shows repeated activity.' },
  ];
  const actionFor = (p, cap, chain) => {
    const c = (p.category || '').toLowerCase();
    const hit = ACTIONS.find((a) => hasAny(c, a.words));
    if (hit) return hit.make(p, cap, chain);
    return 'Deposit $' + cap + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
  };
  const weeklyFor = (p) => {
    const c = (p.category || '').toLowerCase();
    const hit = WEEKLIES.find((w) => hasAny(c, w.words));
    return hit ? hit.text : 'Do one qualifying action a week: a deposit, a borrow, a swap or a vote.';
  };
  const stepText = (step) => {
    let s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  };
  const farmSteps = (p) => {
    const chain = mainChain(p);
    const cap = capitalFor(p);
    const hold = holdFor(p.age_days);
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, cap, chain), cost: '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days so the activity lands in more than one snapshot.', cost: 'the $' + cap + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Log the wallet, the dates and every transaction, so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ].map(stepText);
  };

  const readHash = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('q')) view.q = params.get('q');
    if (params.get('p')) view.selected = params.get('p');
    if (params.get('category')) view.category = params.get('category');
    if (params.get('chain')) view.chain = params.get('chain');
    if (params.get('w') === '1') view.watchOnly = true;
  };
  const writeHash = () => {
    const params = new URLSearchParams();
    if (view.q) params.set('q', view.q);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.chain !== 'all') params.set('chain', view.chain);
    if (view.watchOnly) params.set('w', '1');
    if (view.selected) params.set('p', view.selected);
    const next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const onWatchlist = (slug) => (DATA.watchlist_slugs ? DATA.watchlist_slugs.indexOf(slug) >= 0 : false);
  const visibleRows = () => {
    const q = view.q.trim().toLowerCase();
    return DATA.rows.filter((r) => {
      if (view.category !== 'all' && r.category !== view.category) return false;
      if (view.chain !== 'all' && !(r.chains || []).some((c) => c === view.chain)) return false;
      if (view.watchOnly && !onWatchlist(r.slug)) return false;
      if (!q) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  };
  const sortValue = (row, key) => {
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'tvl') return row.tvl_usd;
    if (key === 'growth') return row.change_7d === null ? -Infinity : row.change_7d;
    if (key === 'age') return row.age_days === null ? Infinity : row.age_days;
    if (key === 'multiple') return row.multiple;
    return row.implied_value_usd;
  };
  const orderedRows = (list) => list.slice().sort((a, b) => {
    const av = sortValue(a, view.sort);
    const bv = sortValue(b, view.sort);
    if (av < bv) return -view.dir;
    if (av > bv) return view.dir;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });

  const topBar = () => h('header', { class: 'top' }, [
    h('div', { class: 'brand' }, [h('span', { class: 'mark' }), h('span', { class: 'brand-name', text: 'Token Radar' })]),
    h('div', { class: 'top-meta' }, [
      h('span', { text: 'Snapshot ' + DATA.as_of }),
      h('span', { text: 'DefiLlama protocol index' }),
      h('span', { text: DATA.model_version + ' model' }),
    ]),
  ]);

  const intro = () => {
    const top = DATA.rows[0];
    return h('section', { class: 'lede' }, [
      h('div', null, [
        h('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        h('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor — the whole radar, ' + DATA.board_size + ' rows, not a sample. Implied value is a model, not a promise.' }),
      ]),
      h('div', { class: 'facts' }, [
        h('div', { class: 'fact' }, [h('span', { text: 'Watchlist covered' }), h('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })]),
        h('div', { class: 'fact' }, [h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(DATA.board_size) })]),
        h('div', { class: 'fact' }, [h('span', { text: 'Top implied value' }), h('b', { text: top ? money(top.implied_value_usd) : 'n/a' }), h('small', { text: top ? top.name : '' })]),
        h('div', { class: 'fact' }, [h('span', { text: 'Live-token set aside' }), h('b', { text: String(DATA.live_size) }), h('small', { text: 'market cap, not a model' })]),
      ]),
    ]);
  };

  const filterBar = () => {
    const categories = Array.from(new Set(DATA.rows.map((r) => r.category || 'Other'))).sort();
    const chains = Array.from(new Set(DATA.rows.reduce((acc, r) => acc.concat(r.chains || []), []))).sort();
    const search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: view.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', () => { view.q = search.value; writeHash(); render(); });
    const cat = h('select', { id: 'category', 'aria-label': 'Filter by category' }, [
      h('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => h('option', { value: c, text: c, selected: c === view.category ? 'selected' : null })),
    ]);
    cat.addEventListener('change', () => { view.category = cat.value; writeHash(); render(); });
    const chain = h('select', { id: 'chain', 'aria-label': 'Filter by chain' }, [
      h('option', { value: 'all', text: 'All chains' }),
      chains.map((c) => h('option', { value: c, text: c, selected: c === view.chain ? 'selected' : null })),
    ]);
    chain.addEventListener('change', () => { view.chain = chain.value; writeHash(); render(); });
    const watch = h('input', { type: 'checkbox', id: 'watchonly', checked: view.watchOnly ? 'checked' : null });
    watch.addEventListener('change', () => { view.watchOnly = watch.checked; writeHash(); render(); });
    const pre = h('button', { type: 'button', 'aria-pressed': view.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: () => { view.tab = 'pre-token'; render(); } });
    const live = h('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: () => { view.tab = 'live'; render(); } });
    return h('div', { class: 'controls' }, [
      h('div', { class: 'field' }, [h('label', { for: 'q', text: 'Search' }), search]),
      h('div', { class: 'field' }, [h('label', { for: 'category', text: 'Category' }), cat]),
      h('div', { class: 'field' }, [h('label', { for: 'chain', text: 'Chain' }), chain]),
      h('label', { class: 'check', for: 'watchonly' }, [watch, 'Watchlist only']),
      h('div', { class: 'field' }, [h('span', { class: 'sub', text: 'Token status' }), h('div', { class: 'tabs' }, [pre, live])]),
      h('span', { class: 'count', text: view.tab === 'pre-token' ? visibleRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' }),
    ]);
  };

  const sortHead = (key, label) => h('th', { scope: 'col' }, [
    h('button', { type: 'button', onclick: () => { if (view.sort === key) view.dir = -view.dir; else { view.sort = key; view.dir = -1; } render(); } }, [
      label,
      view.sort === key ? h('span', { 'aria-hidden': 'true', text: view.dir < 0 ? ' v' : ' ^' }) : null,
    ]),
  ]);

  const chainLabel = (r) => (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain');

  const boardTable = () => {
    const list = orderedRows(visibleRows());
    if (list.length === 0) {
      return h('div', { class: 'panel' }, [h('div', { class: 'empty' }, [
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        h('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: () => { view.q = ''; view.category = 'all'; view.chain = 'all'; view.watchOnly = false; writeHash(); render(); } }),
      ])]);
    }
    const max = list[0].implied_value_usd || 1;
    const body = h('tbody');
    list.forEach((r) => {
      const growth = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      const growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const tr = h('tr', {
        'data-selected': view.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => openDetail(r.slug),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      }, [
        h('td', { class: 'num', text: String(r.rank) }),
        h('td', null, [h('div', { class: 'name' }, [
          h('b', null, [r.name, onWatchlist(r.slug) ? h('span', { class: 'badge', text: 'watchlist' }) : null]),
          h('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + chainLabel(r) }),
        ])]),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: 'num ' + growthClass, text: growth }),
        h('td', { class: 'num', text: age(r.age_days) }),
        h('td', { class: 'num', text: mult(r.multiple) }),
        h('td', null, [h('div', { class: 'implied' }, [
          h('div', { class: 'bar', 'aria-hidden': 'true' }, [h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })]),
          h('span', { class: 'num', text: money(r.implied_value_usd) }),
        ])]),
        h('td', null, [h('span', { class: 'status', text: 'no token' })]),
      ]);
      body.appendChild(tr);
    });
    return h('div', { class: 'panel' }, [
      h('div', { class: 'table-wrap' }, [
        h('table', null, [
          h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, [h('tr', null, [
            sortHead('implied', 'Rank'),
            sortHead('name', 'Protocol'),
            sortHead('tvl', 'TVL'),
            sortHead('growth', '7d'),
            sortHead('age', 'Age'),
            sortHead('multiple', 'Multiple'),
            sortHead('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' }),
          ])]),
          body,
        ]),
      ]),
    ]);
  };

  const liveTable = () => {
    const body = h('tbody');
    DATA.live.forEach((r) => {
      body.appendChild(h('tr', null, [
        h('td', { class: 'num', text: 'live' }),
        h('td', null, [h('div', { class: 'name' }, [h('b', { text: r.name }), h('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + chainLabel(r) })])]),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: pct(r.change_7d) }),
        h('td', { class: 'num', text: money(r.mcap_usd) }),
        h('td', null, [h('span', { class: 'status live', text: 'already trades' })]),
      ]));
    });
    return h('div', { class: 'panel' }, [
      h('div', { class: 'table-wrap' }, [
        h('table', null, [
          h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap-to-TVL ratios are what the model prices the pre-token board with.' }),
          h('thead', null, [h('tr', null, [h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }), h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'Token' })])]),
          body,
        ]),
      ]),
    ]);
  };

  const modelPanel = () => {
    const m = DATA.model;
    const multRows = Object.keys(DATA.multiples || {}).map((c) => {
      const e = DATA.multiples[c];
      return { category: c, multiple: e.multiple, n: e.live_count };
    }).sort((a, b) => b.multiple - a.multiple);
    const multBody = h('tbody');
    multRows.forEach((r) => {
      multBody.appendChild(h('tr', null, [
        h('td', { text: r.category }),
        h('td', { class: 'num', text: mult(r.multiple) }),
        h('td', { class: 'num', text: String(r.n) }),
      ]));
    });
    return h('section', { class: 'panel model' }, [
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. The multiple is the market\u2019s, not a hand-picked constant: for each category, the median market-cap-to-TVL ratio of the live-token protocols in that category (at least ' + m.min_live_for_category + ' of them, CEX excluded). A thin category falls back to the global median of ' + mult(DATA.global_multiple) + ' over ' + DATA.global_live_count + ' live protocols. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { class: 'formula' }, [
        'implied = round( tvl_usd x category-multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )',
      ]),
      h('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol the house\u2019s watchlist rule keeps, whatever its TVL, and the live-token protocols are set aside with their market caps shown.' }),
      h('div', { class: 'table-wrap' }, [
        h('table', { class: 'mult-table' }, [
          h('caption', { class: 'sub', text: 'Market multiples by category, read off the snapshot\u2019s live protocols.' }),
          h('thead', null, [h('tr', null, [h('th', { scope: 'col', text: 'Category' }), h('th', { scope: 'col', text: 'Multiple' }), h('th', { scope: 'col', text: 'Live protocols' })])]),
          multBody,
        ]),
      ]),
    ]);
  };

  const dialog = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', () => { view.selected = null; writeHash(); });

  const openDetail = (slug) => {
    const row = DATA.rows.filter((r) => r.slug === slug)[0];
    if (!row) return;
    view.selected = slug;
    writeHash();
    dialog.textContent = '';
    const steps = farmSteps(row);
    const recomputed = impliedOf(row, DATA.model);
    const multNote = row.multiple_fallback
      ? 'Global median over ' + DATA.global_live_count + ' live protocols (thin category)'
      : 'Median of ' + row.multiple_live_count + ' live ' + (row.category || 'Other') + ' protocols';
    dialog.appendChild(h('div', { class: 'detail-head' }, [
      h('div', null, [
        h('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (onWatchlist(row.slug) ? ' · watchlist' : '') }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') }),
      ]),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: () => dialog.close() }),
    ]));
    dialog.appendChild(h('section', { class: 'detail-section' }, [
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'equation' }, [
        h('div', null, [h('span', { text: 'TVL' }), h('b', { class: 'num', text: money(row.tvl_usd) })]),
        h('div', null, [h('span', { text: 'Market multiple' }), h('b', { class: 'num', text: mult(row.multiple) }), h('span', { class: 'sub', text: multNote })]),
        h('div', null, [h('span', { text: 'Seven-day growth' }), h('b', { class: 'num', text: pct(row.change_7d) })]),
        h('div', null, [h('span', { text: 'Age with no token' }), h('b', { class: 'num', text: age(row.age_days) })]),
        h('div', null, [h('span', { text: 'Growth multiplier' }), h('b', { class: 'num', text: String(row.growth_multiplier) })]),
        h('div', null, [h('span', { text: 'Maturity multiplier' }), h('b', { class: 'num', text: String(row.maturity_multiplier) })]),
        h('div', null, [h('span', { text: 'Implied value' }), h('b', { class: 'num', text: money(row.implied_value_usd) })]),
      ]),
      h('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + money(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
    ]));
    dialog.appendChild(h('section', { class: 'detail-section' }, [
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, steps.map((s) => {
        const at = s.indexOf(' Cost: ');
        const action = at >= 0 ? s.slice(0, at) : s;
        const tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, [h('b', { text: action }), h('span', { class: 'cost', text: tail })]);
      })),
    ]));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  };

  const render = () => {
    mount.textContent = '';
    const shell = h('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(intro());
    shell.appendChild(filterBar());
    shell.appendChild(view.tab === 'pre-token' ? boardTable() : liveTable());
    if (view.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(h('p', { class: 'foot', text: '“No token” means the protocol\u2019s DefiLlama record carries no token — a record is not proof a token does not exist. Implied values are the model\u2019s claim, never make.fun\u2019s. Snapshot ' + DATA.as_of + ', ' + DATA.source + '.' }));
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) mount.appendChild(dialog);
    if (view.selected) openDetail(view.selected);
  };

  readHash();
  render();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
  // Debug hook for the entry's own checks: the farm plan and the recompute, callable from a test.
  window.__radarTest = { farmSteps: farmSteps, impliedOf: impliedOf };
})();
