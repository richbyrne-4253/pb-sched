import { useState, useCallback, useMemo } from "react";

const DEFAULT_PLAYERS = ["Rich", "Carol", "Tom", "Julie", "Steve", "Barbara"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function findValidTeams(playing, partnerMap, opts, lastPairKeys = new Set()) {
  const { coed, genders } = opts;
  const combos = [];
  for (let i = 0; i < playing.length - 1; i++)
    for (let j = i + 1; j < playing.length; j++)
      combos.push([playing[i], playing[j]]);
  const shuffled = shuffle(combos);
  let best = null;
  let bestScore = Infinity;
  for (const team1 of shuffled) {
    const team2 = playing.filter(p => !team1.includes(p));
    if (coed) {
      if (genders[team1[0]] === genders[team1[1]]) continue;
      if (genders[team2[0]] === genders[team2[1]]) continue;
    }
    if ((partnerMap[team1[0]][team1[1]] || 0) >= 2) continue;
    if ((partnerMap[team2[0]][team2[1]] || 0) >= 2) continue;
    let score = 0;
    if (lastPairKeys.has(pairKey(team1[0], team1[1]))) score++;
    if (lastPairKeys.has(pairKey(team2[0], team2[1]))) score++;
    if (score < bestScore) {
      bestScore = score;
      best = [team1, team2];
      if (score === 0) return best;
    }
  }
  return best;
}

function countConsecutiveRepeats(schedule) {
  let count = 0;
  for (let i = 1; i < schedule.length; i++) {
    const prev = new Set([
      pairKey(schedule[i - 1].team1[0], schedule[i - 1].team1[1]),
      pairKey(schedule[i - 1].team2[0], schedule[i - 1].team2[1]),
    ]);
    if (prev.has(pairKey(schedule[i].team1[0], schedule[i].team1[1]))) count++;
    if (prev.has(pairKey(schedule[i].team2[0], schedule[i].team2[1]))) count++;
  }
  return count;
}

function generateSchedule(players, opts = {}) {
  const { fixedPairs = [], coed = false, genders = {} } = opts;
  const MAX = 500000;
  const EXTRA_AFTER_FIRST = 20000;
  let best = null;
  let firstFoundIter = null;
  for (let iter = 1; iter <= MAX; iter++) {
    const schedule = [];
    const partnerMap = {};
    const gameCounts = {};
    const sitCounts = {};
    players.forEach(p => {
      partnerMap[p] = {};
      gameCounts[p] = 0;
      sitCounts[p] = 0;
    });
    let lastSitters = new Set();
    let lastPairKeys = new Set();
    let valid = true;

    for (let g = 1; g <= 9; g++) {
      const remaining = 10 - g;
      const mustPlay = new Set(lastSitters);
      players.forEach(p => {
        if (6 - gameCounts[p] >= remaining) mustPlay.add(p);
      });
      const canSit = players.filter(p => !mustPlay.has(p) && sitCounts[p] < 3);
      if (mustPlay.size > 4 || canSit.length < 2) { valid = false; break; }

      let sitters;
      if (coed) {
        // Coed needs 2M+2F on court → sitters must be 1M+1F.
        const canSitM = canSit.filter(p => genders[p] === "M");
        const canSitF = canSit.filter(p => genders[p] === "F");
        if (!canSitM.length || !canSitF.length) { valid = false; break; }
        sitters = [shuffle(canSitM)[0], shuffle(canSitF)[0]];
      } else {
        sitters = shuffle(canSit).slice(0, 2);
      }
      const playing = players.filter(p => !sitters.includes(p));
      const teams = findValidTeams(playing, partnerMap, { coed, genders }, lastPairKeys);
      if (!teams) { valid = false; break; }

      const [team1, team2] = teams;
      [[team1[0], team1[1]], [team2[0], team2[1]]].forEach(([a, b]) => {
        partnerMap[a][b] = (partnerMap[a][b] || 0) + 1;
        partnerMap[b][a] = (partnerMap[b][a] || 0) + 1;
      });
      playing.forEach(p => gameCounts[p]++);
      sitters.forEach(p => sitCounts[p]++);
      schedule.push({ game: g, team1, team2, sitting: sitters });
      lastSitters = new Set(sitters);
      lastPairKeys = new Set([
        pairKey(team1[0], team1[1]),
        pairKey(team2[0], team2[1]),
      ]);
    }

    if (!valid) continue;

    let passed = true;
    for (const p of players) {
      if (gameCounts[p] !== 6) { passed = false; break; }
      const pm = partnerMap[p];
      const total = Object.values(pm).reduce((s, v) => s + v, 0);
      const unique = Object.keys(pm).length;
      const twos = Object.values(pm).filter(v => v === 2).length;
      const ones = Object.values(pm).filter(v => v === 1).length;
      // Coed: only 3 opposite-gender partners exist, each played twice.
      // Open: 5 unique partners + 1 repeat — the original distribution.
      const ok = coed
        ? (total === 6 && unique === 3 && twos === 3 && ones === 0)
        : (total === 6 && unique === 5 && twos === 1 && ones === 4);
      if (!ok) { passed = false; break; }
    }
    if (!passed) continue;

    const expectedTwos = coed ? 3 : 1;
    for (const p of players) {
      const twosInCol = players.filter(o => o !== p && (partnerMap[o][p] || 0) === 2).length;
      if (twosInCol !== expectedTwos) { passed = false; break; }
    }
    if (!passed) continue;

    for (const [a, b] of fixedPairs) {
      if ((partnerMap[a][b] || 0) !== 2) { passed = false; break; }
    }
    if (!passed) continue;

    const consecutiveRepeats = countConsecutiveRepeats(schedule);
    if (!best || consecutiveRepeats < best.consecutiveRepeats) {
      best = { schedule, partnerMap, gameCounts, iterations: iter, coed, consecutiveRepeats };
      if (consecutiveRepeats === 0) return best;
    }
    if (firstFoundIter === null) firstFoundIter = iter;
    if (iter - firstFoundIter >= EXTRA_AFTER_FIRST) return best;
  }
  return best;
}

function buildPlayerGames(schedule) {
  const pg = {};
  schedule.forEach(g => {
    [...g.team1, ...g.team2].forEach(p => {
      if (!pg[p]) pg[p] = [];
      pg[p].push(g.game);
    });
  });
  return pg;
}

const EMPTY_PAIRS = [
  { a: "", b: "" },
  { a: "", b: "" },
  { a: "", b: "" },
];

export default function App() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [pairs, setPairs] = useState(EMPTY_PAIRS);
  const [coed, setCoed] = useState(false);
  const [genders, setGenders] = useState({});
  const [result, setResult] = useState(undefined);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("schedule");

  const usedInPairs = useMemo(() => {
    const used = new Map(); // name -> rowIdx
    pairs.forEach((p, i) => {
      if (p.a) used.set(p.a, i);
      if (p.b) used.set(p.b, i);
    });
    return used;
  }, [pairs]);

  const activePairs = useMemo(
    () => pairs.filter(p => p.a && p.b).map(p => [p.a, p.b]),
    [pairs]
  );

  const validate = () => {
    if (new Set(players).size !== players.length)
      return "Player names must be unique.";

    for (let i = 0; i < pairs.length; i++) {
      const { a, b } = pairs[i];
      if ((a && !b) || (b && !a))
        return `Pair ${i + 1}: pick both players or clear the row.`;
      if (a && b && a === b)
        return `Pair ${i + 1}: a player can't be paired with themselves.`;
    }
    const flat = activePairs.flat();
    if (new Set(flat).size !== flat.length)
      return "Same player appears in more than one pair.";

    if (coed) {
      const missing = players.filter(p => !genders[p]);
      if (missing.length) return `Set M/F for: ${missing.join(", ")}.`;
      const males = players.filter(p => genders[p] === "M").length;
      const females = players.filter(p => genders[p] === "F").length;
      if (males !== 3 || females !== 3)
        return `Coed needs 3 M + 3 F (you have ${males} M, ${females} F).`;
      for (const [a, b] of activePairs) {
        if (genders[a] === genders[b])
          return `Coed conflict: ${a} & ${b} are both ${genders[a]}. Either uncheck coed or change the pair.`;
      }
    }
    return null;
  };

  const run = useCallback(() => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setRunning(true);
    setResult(undefined);
    setTimeout(() => {
      const res = generateSchedule(players, { fixedPairs: activePairs, coed, genders });
      setResult(res);
      setRunning(false);
      setActiveTab("schedule");
    }, 50);
  }, [players, activePairs, coed, genders]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (i) => { setEditingIdx(i); setEditVal(players[i]); };
  const saveEdit = () => {
    if (editVal.trim()) {
      const oldName = players[editingIdx];
      const newName = editVal.trim();
      if (oldName !== newName) {
        const np = [...players];
        np[editingIdx] = newName;
        setPlayers(np);
        // Carry pair selections and gender across the rename so the user
        // doesn't lose settings just because they fixed a typo.
        setPairs(prev => prev.map(p => ({
          a: p.a === oldName ? newName : p.a,
          b: p.b === oldName ? newName : p.b,
        })));
        setGenders(prev => {
          if (!(oldName in prev)) return prev;
          const { [oldName]: g, ...rest } = prev;
          return { ...rest, [newName]: g };
        });
      }
    }
    setEditingIdx(null);
  };

  const setPair = (rowIdx, slot, name) => {
    setPairs(prev => prev.map((p, i) => i === rowIdx ? { ...p, [slot]: name } : p));
  };
  const clearPair = (rowIdx) =>
    setPairs(prev => prev.map((p, i) => i === rowIdx ? { a: "", b: "" } : p));

  const setGender = (name, g) => setGenders(prev => ({ ...prev, [name]: g }));

  const palette = [
    "text-blue-700", "text-pink-600", "text-green-700",
    "text-purple-700", "text-orange-600", "text-teal-700"
  ];
  const bgPalette = [
    "bg-blue-100", "bg-pink-100", "bg-green-100",
    "bg-purple-100", "bg-orange-100", "bg-teal-100"
  ];
  const playerColors = {};
  const playerBg = {};
  players.forEach((p, i) => {
    playerColors[p] = palette[i % palette.length];
    playerBg[p] = bgPalette[i % bgPalette.length];
  });

  // Options for a pair dropdown in row `rowIdx`, slot `slot`. Allowed values: own current value
  // (so it stays selected) plus any player not used in another row.
  const pairOptionsFor = (rowIdx, slot) => {
    const own = pairs[rowIdx][slot];
    return players.filter(p => {
      if (p === own) return true;
      const usedRow = usedInPairs.get(p);
      if (usedRow === undefined) return true;
      return usedRow === rowIdx;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 p-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-green-800">🏓 PB1 Pickleball Scheduler</h1>
          <p className="text-gray-500 mt-1 text-sm">6 players · 9 games · 1 court · all constraints met</p>
        </div>

        {/* Player Names */}
        <div className="bg-white rounded-2xl shadow p-4 mb-4">
          <h2 className="font-bold text-gray-700 mb-3">👥 Players (click a name to edit)</h2>
          <div className="grid grid-cols-3 gap-2">
            {players.map((p, i) => (
              <div key={i} className="flex flex-col gap-1">
                {editingIdx === i ? (
                  <input
                    className="border-2 border-green-400 rounded-lg px-3 py-2 w-full text-sm font-medium focus:outline-none"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={e => e.key === "Enter" && saveEdit()}
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => startEdit(i)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold border-2 border-transparent hover:border-green-300 transition-colors ${playerBg[p]} ${playerColors[p]}`}
                  >
                    {p}
                  </button>
                )}
                {coed && (
                  <div className="flex gap-1">
                    {["M", "F"].map(g => (
                      <button
                        key={g}
                        onClick={() => setGender(p, g)}
                        className={`flex-1 px-2 py-1 rounded text-xs font-bold border ${
                          genders[p] === g
                            ? (g === "M" ? "bg-blue-600 text-white border-blue-600" : "bg-pink-500 text-white border-pink-500")
                            : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pair / Coed Settings */}
        <div className="bg-white rounded-2xl shadow p-4 mb-4">
          <h2 className="font-bold text-gray-700 mb-3">⚙️ Schedule Options</h2>

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={coed}
              onChange={e => setCoed(e.target.checked)}
              className="w-4 h-4 accent-green-700"
            />
            <span className="text-sm font-medium text-gray-700">
              Force coed teams (1 M + 1 F per side)
            </span>
          </label>

          <div className="text-xs font-semibold text-gray-500 mb-2">
            Repeat pairs (optional, up to 3) — these duos will play together twice
          </div>
          <div className="flex flex-col gap-2">
            {pairs.map((pair, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{rowIdx + 1}.</span>
                <select
                  value={pair.a}
                  onChange={e => setPair(rowIdx, "a", e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm flex-1 bg-white"
                >
                  <option value="">— player —</option>
                  {pairOptionsFor(rowIdx, "a").map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <span className="text-gray-400">+</span>
                <select
                  value={pair.b}
                  onChange={e => setPair(rowIdx, "b", e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm flex-1 bg-white"
                >
                  <option value="">— player —</option>
                  {pairOptionsFor(rowIdx, "b").map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <button
                  onClick={() => clearPair(rowIdx)}
                  className="text-gray-400 hover:text-red-500 text-sm px-2"
                  title="Clear row"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={run}
          disabled={running}
          className={`w-full py-3 rounded-2xl font-bold text-lg shadow transition-all mb-6 ${
            running
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-green-700 text-white hover:bg-green-600 active:scale-95"
          }`}
        >
          {running ? "⏳ Generating..." : "🎯 Generate Schedule"}
        </button>

        {error && !running && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-center text-red-700 font-semibold">
            {error}
          </div>
        )}

        {/* Results */}
        {result === undefined && !running && !error && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-5xl mb-3">🏓</p>
            <p className="text-lg">Hit Generate to create your schedule!</p>
          </div>
        )}

        {result === null && !running && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700 font-semibold">
            ✗ Too hard - no solution found after 500,000 iterations
          </div>
        )}

        {result && (
          <>
            <div className="flex justify-center mb-4 gap-2 flex-wrap">
              <span className="bg-green-100 text-green-800 text-sm font-semibold px-4 py-1 rounded-full border border-green-300">
                ✓ Solution found in {result.iterations.toLocaleString()} iteration{result.iterations !== 1 ? "s" : ""}!
              </span>
              <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-4 py-1 rounded-full border border-blue-300">
                Back-to-back team repeats: {result.consecutiveRepeats}
              </span>
            </div>

            <div className="flex gap-2 mb-4">
              {["schedule", "partnerships", "verification"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${
                    activeTab === tab ? "bg-green-700 text-white" : "bg-white text-gray-600 hover:bg-gray-100 shadow"}`}>
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === "schedule" && (
              <div className="bg-white rounded-2xl shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-green-700 text-white">
                      <th className="p-3 text-center w-12">Game</th>
                      <th className="p-3 text-left">Team 1</th>
                      <th className="p-3 text-center w-8">vs</th>
                      <th className="p-3 text-left">Team 2</th>
                      <th className="p-3 text-left">Sitting Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.schedule.map((g, i) => (
                      <tr key={i} className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-green-50"}`}>
                        <td className="p-3 text-center font-bold text-green-700">{g.game}</td>
                        <td className="p-3">
                          <span className={`font-semibold ${playerColors[g.team1[0]]}`}>{g.team1[0]}</span>
                          <span className="text-gray-400 mx-1">&amp;</span>
                          <span className={`font-semibold ${playerColors[g.team1[1]]}`}>{g.team1[1]}</span>
                        </td>
                        <td className="p-3 text-center text-gray-400 font-bold">vs</td>
                        <td className="p-3">
                          <span className={`font-semibold ${playerColors[g.team2[0]]}`}>{g.team2[0]}</span>
                          <span className="text-gray-400 mx-1">&amp;</span>
                          <span className={`font-semibold ${playerColors[g.team2[1]]}`}>{g.team2[1]}</span>
                        </td>
                        <td className="p-3 text-gray-400 text-xs">
                          {g.sitting.map((s, si) => (
                            <span key={si} className={`${playerColors[s]} font-medium`}>
                              {s}{si < g.sitting.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "partnerships" && (
              <div className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="p-3 bg-green-50 border-b text-xs text-gray-500 flex gap-4">
                  <span><span className="inline-block w-4 h-4 rounded bg-green-200 mr-1 align-middle"></span>Played together once</span>
                  <span><span className="inline-block w-4 h-4 rounded bg-yellow-200 mr-1 align-middle"></span>Played together twice (repeat partner)</span>
                  <span><span className="inline-block w-4 h-4 rounded bg-gray-100 mr-1 align-middle"></span>Never partnered</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-green-700 text-white">
                        <th className="p-3 text-left">Player</th>
                        {players.map(p => (
                          <th key={p} className="p-3 text-center font-semibold">{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((p1, i) => (
                        <tr key={p1} className={i % 2 === 0 ? "bg-white" : "bg-green-50"}>
                          <td className={`p-3 font-bold ${playerColors[p1]}`}>{p1}</td>
                          {players.map(p2 => {
                            if (p1 === p2) return <td key={p2} className="p-3 text-center text-gray-300">—</td>;
                            const count = result.partnerMap[p1][p2] || 0;
                            const bg = count === 2 ? "bg-yellow-200 text-yellow-800 font-bold" : count === 1 ? "bg-green-200 text-green-800" : "text-gray-300";
                            return (
                              <td key={p2} className="p-3 text-center">
                                <span className={`inline-block w-7 h-7 rounded-full leading-7 text-sm font-semibold ${bg}`}>
                                  {count || "0"}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "verification" && (
              <div className="grid gap-3">
                <div className="bg-white rounded-2xl shadow p-4">
                  <h3 className="font-bold text-gray-700 mb-3">🎮 Games Played (each player: 6 games, 3 sit-outs)</h3>
                  <div className="grid gap-2">
                    {players.map(p => {
                      const games = buildPlayerGames(result.schedule)[p] || [];
                      const sits = [1,2,3,4,5,6,7,8,9].filter(g => !games.includes(g));
                      return (
                        <div key={p} className="flex items-center gap-2 text-sm">
                          <span className={`font-bold w-16 ${playerColors[p]}`}>{p}</span>
                          <span className="text-green-600 font-semibold">✓</span>
                          <div className="flex gap-1">
                            {[1,2,3,4,5,6,7,8,9].map(g => (
                              <span key={g} className={`w-6 h-6 rounded text-xs flex items-center justify-center font-semibold ${
                                games.includes(g) ? `${playerBg[p]} ${playerColors[p]}` : "bg-gray-100 text-gray-300"}`}>
                                {g}
                              </span>
                            ))}
                          </div>
                          <span className="text-gray-400 text-xs">sits: {sits.join(", ")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow p-4">
                  <h3 className="font-bold text-gray-700 mb-3">⛔ No Consecutive Sit-outs</h3>
                  <div className="grid gap-1">
                    {players.map(p => {
                      const games = buildPlayerGames(result.schedule)[p] || [];
                      const sits = [1,2,3,4,5,6,7,8,9].filter(g => !games.includes(g)).sort((a,b)=>a-b);
                      const consec = sits.some((s, i) => i > 0 && s - sits[i-1] === 1);
                      return (
                        <div key={p} className="flex items-center gap-2 text-sm">
                          <span className={`font-bold w-16 ${playerColors[p]}`}>{p}</span>
                          <span className={consec ? "text-red-500" : "text-green-600"}>{consec ? "✗" : "✓"}</span>
                          <span className="text-gray-500">sits out games: {sits.join(", ")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow p-4">
                  <h3 className="font-bold text-gray-700 mb-3">
                    🤝 Partnerships ({result.coed ? "3 unique partners, played twice each" : "5 unique partners, 1 repeat each"})
                  </h3>
                  <div className="grid gap-3">
                    {players.map(p => {
                      const pm = result.partnerMap[p];
                      return (
                        <div key={p} className="text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-bold w-16 ${playerColors[p]}`}>{p}</span>
                            <span className="text-green-600 font-semibold">✓</span>
                            <span className="text-gray-400 text-xs">
                              {result.coed ? "3 partners · each twice" : "5 unique partners · 1 repeat"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 pl-16">
                            {Object.entries(pm).sort().map(([partner, count]) => (
                              <span key={partner} className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                count === 2 ? "bg-yellow-200 text-yellow-800" : "bg-green-100 text-green-700"}`}>
                                {partner}: {count === 2 ? "2x ⭐" : "1x"}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-green-700 text-white rounded-2xl p-4 text-center font-bold text-lg">
                  ✓✓✓ ALL CONSTRAINTS SATISFIED ✓✓✓
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
