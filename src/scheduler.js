// Pure pickleball scheduling engine — no React, fully unit-testable.
//
// Roster size drives court count: 8 players → 2 courts (everyone plays every
// game), 6 or 7 → 1 court (the rest sit out). Modes:
//   - coed: every team is 1 M + 1 F
//   - same-gender (non-coed, 8 players, 4M+4F): men on one court, women on the other
//   - open: no gender constraint
// Fixed couples (up to 4) always play together whenever both are in a game;
// leaving them empty lets partners rotate for a richer mix.

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const courtsFor = (n) => (n === 8 ? 2 : 1);
export const defaultGames = (n) => (n === 8 ? 3 : n === 7 ? 7 : 9);

// Greedy matching that prefers partners who haven't played together yet.
// poolB given → cross-match A (men) with B (women); otherwise pair A with itself.
function greedyPairs(poolA, poolB, partner) {
  const pairs = [];
  if (poolB) {
    const men = shuffle(poolA);
    let women = shuffle(poolB);
    for (const m of men) {
      women.sort((x, y) => (partner[m][x] || 0) - (partner[m][y] || 0));
      const w = women[0];
      pairs.push([m, w]);
      women = women.filter((p) => p !== w);
    }
  } else {
    let rest = shuffle(poolA);
    while (rest.length) {
      const a = rest.shift();
      rest.sort((x, y) => (partner[a][x] || 0) - (partner[a][y] || 0));
      const b = rest.shift();
      pairs.push([a, b]);
    }
  }
  return pairs;
}

// Build one game (all courts) from the playing set. null on failure.
export function formGame(playing, genders, coed, segregate, fixedPairs, partner) {
  const courts = playing.length / 4;

  const used = new Set();
  const locked = [];
  for (const [a, b] of fixedPairs) {
    if (playing.includes(a) && playing.includes(b)) {
      locked.push([a, b]);
      used.add(a);
      used.add(b);
    }
  }
  const rest = playing.filter((p) => !used.has(p));

  let pairs = [...locked];
  if (coed) {
    const men = rest.filter((p) => genders[p] === "M");
    const women = rest.filter((p) => genders[p] === "F");
    if (men.length !== women.length) return null;
    pairs = pairs.concat(greedyPairs(men, women, partner));
  } else if (segregate) {
    const men = rest.filter((p) => genders[p] === "M");
    const women = rest.filter((p) => genders[p] === "F");
    if (men.length % 2 || women.length % 2) return null;
    pairs = pairs.concat(greedyPairs(men, null, partner));
    pairs = pairs.concat(greedyPairs(women, null, partner));
  } else {
    pairs = pairs.concat(greedyPairs(rest, null, partner));
  }

  let courtList;
  if (segregate) {
    const menPairs = pairs.filter((pr) => genders[pr[0]] === "M" && genders[pr[1]] === "M");
    const womenPairs = pairs.filter((pr) => genders[pr[0]] === "F" && genders[pr[1]] === "F");
    if (menPairs.length + womenPairs.length !== pairs.length) return null;
    courtList = [];
    for (let i = 0; i < menPairs.length; i += 2) courtList.push([menPairs[i], menPairs[i + 1]]);
    for (let i = 0; i < womenPairs.length; i += 2) courtList.push([womenPairs[i], womenPairs[i + 1]]);
  } else {
    const sp = shuffle(pairs);
    courtList = [];
    for (let i = 0; i < sp.length; i += 2) courtList.push([sp[i], sp[i + 1]]);
  }

  if (courtList.length !== courts) return null;
  for (const c of courtList) if (c.length !== 2 || !c[0] || !c[1]) return null;
  return courtList;
}

// Pick this game's sitters: balance sit counts, never sit two games in a row.
export function chooseSitters(players, genders, coed, courts, sitCounts, lastSitters) {
  const sitPerGame = players.length - courts * 4;
  if (sitPerGame <= 0) return [];

  const pickLowest = (pool, k) => {
    const elig = pool.filter((p) => !lastSitters.has(p));
    if (elig.length < k) return null;
    const sorted = shuffle(elig).sort((a, b) => sitCounts[a] - sitCounts[b]);
    return sorted.slice(0, k);
  };

  if (coed) {
    const men = players.filter((p) => genders[p] === "M");
    const women = players.filter((p) => genders[p] === "F");
    const sitM = men.length - 2 * courts;
    const sitF = women.length - 2 * courts;
    if (sitM < 0 || sitF < 0) return null;
    const sm = pickLowest(men, sitM);
    const sf = pickLowest(women, sitF);
    if (!sm || !sf) return null;
    return [...sm, ...sf];
  }
  return pickLowest(players, sitPerGame);
}

export function buildOnce(players, genders, numGames, coed, segregate, fixedPairs, courts) {
  const schedule = [];
  const partner = {};
  const opponent = {};
  const sitCounts = {};
  players.forEach((p) => {
    partner[p] = {};
    opponent[p] = {};
    sitCounts[p] = 0;
  });
  let lastSitters = new Set();

  for (let g = 1; g <= numGames; g++) {
    const sitters = chooseSitters(players, genders, coed, courts, sitCounts, lastSitters);
    if (sitters === null) return null;
    const sitSet = new Set(sitters);
    const playing = players.filter((p) => !sitSet.has(p));

    const courtList = formGame(playing, genders, coed, segregate, fixedPairs, partner);
    if (!courtList) return null;

    courtList.forEach(([t1, t2]) => {
      partner[t1[0]][t1[1]] = (partner[t1[0]][t1[1]] || 0) + 1;
      partner[t1[1]][t1[0]] = (partner[t1[1]][t1[0]] || 0) + 1;
      partner[t2[0]][t2[1]] = (partner[t2[0]][t2[1]] || 0) + 1;
      partner[t2[1]][t2[0]] = (partner[t2[1]][t2[0]] || 0) + 1;
      for (const a of t1) for (const b of t2) {
        opponent[a][b] = (opponent[a][b] || 0) + 1;
        opponent[b][a] = (opponent[b][a] || 0) + 1;
      }
    });

    sitters.forEach((p) => sitCounts[p]++);
    schedule.push({ game: g, courts: courtList, sitting: sitters });
    lastSitters = sitSet;
  }
  return { schedule, partner, opponent, sitCounts };
}

export function scoreSchedule({ schedule, partner, opponent, sitCounts }, players, numGames) {
  let score = 0;
  for (const p of players)
    for (const q of Object.keys(partner[p]))
      if (p < q && partner[p][q] > 1) score += (partner[p][q] - 1) * 10;
  for (const p of players)
    for (const q of Object.keys(opponent[p]))
      if (p < q && opponent[p][q] > 1) score += (opponent[p][q] - 1) * 2;
  for (let i = 1; i < schedule.length; i++) {
    const prev = new Set();
    schedule[i - 1].courts.forEach((ct) => ct.forEach((t) => prev.add(pairKey(t[0], t[1]))));
    schedule[i].courts.forEach((ct) =>
      ct.forEach((t) => {
        if (prev.has(pairKey(t[0], t[1]))) score += 5;
      })
    );
  }
  const gp = players.map((p) => numGames - sitCounts[p]);
  if (Math.max(...gp) - Math.min(...gp) > 1) score += 100;
  const sc = players.map((p) => sitCounts[p]);
  if (Math.max(...sc) - Math.min(...sc) > 1) score += 60;
  return score;
}

export function generateSchedule(players, opts = {}) {
  const { genders = {}, numGames = 3, coed = false, fixedPairs = [] } = opts;
  const courts = courtsFor(players.length);
  const males = players.filter((p) => genders[p] === "M").length;
  const females = players.filter((p) => genders[p] === "F").length;
  const segregate = !coed && courts === 2 && males === 4 && females === 4;

  const start = Date.now();
  const MAX = 120000;
  const STALL = 25000;
  const TIME = 2500;
  let best = null;
  let bestScore = Infinity;
  let lastImprove = 0;

  for (let iter = 1; iter <= MAX; iter++) {
    const built = buildOnce(players, genders, numGames, coed, segregate, fixedPairs, courts);
    if (built) {
      const s = scoreSchedule(built, players, numGames);
      if (s < bestScore) {
        bestScore = s;
        best = { ...built, iterations: iter, coed, segregate, courts, numGames, score: s };
        lastImprove = iter;
        if (s === 0) break;
      }
    }
    if (iter - lastImprove > STALL) break;
    if (Date.now() - start > TIME) break;
  }
  return best;
}

export function buildPlayerGames(schedule) {
  const pg = {};
  schedule.forEach((g) => {
    g.courts.forEach((ct) =>
      ct.forEach((team) =>
        team.forEach((p) => {
          if (!pg[p]) pg[p] = [];
          pg[p].push(g.game);
        })
      )
    );
  });
  return pg;
}
