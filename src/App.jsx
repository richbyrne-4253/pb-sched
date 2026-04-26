import { useState, useCallback } from "react";

const DEFAULT_PLAYERS = ["Rich", "Carol", "Steve", "Dale", "Dylan", "Tom"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function findValidTeams(playing, partnerMap) {
  const combos = [];
  for (let i = 0; i < playing.length - 1; i++)
    for (let j = i + 1; j < playing.length; j++)
      combos.push([playing[i], playing[j]]);
  const shuffled = shuffle(combos);
  for (const team1 of shuffled) {
    const team2 = playing.filter(p => !team1.includes(p));
    if ((partnerMap[team1[0]][team1[1]] || 0) >= 2) continue;
    if ((partnerMap[team2[0]][team2[1]] || 0) >= 2) continue;
    return [team1, team2];
  }
  return null;
}

function generateSchedule(players) {
  const MAX = 500000;
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
    let valid = true;

    for (let g = 1; g <= 9; g++) {
      const remaining = 10 - g;
      const mustPlay = new Set(lastSitters);
      players.forEach(p => {
        if (6 - gameCounts[p] >= remaining) mustPlay.add(p);
      });
      const canSit = players.filter(p => !mustPlay.has(p) && sitCounts[p] < 3);
      if (mustPlay.size > 4 || canSit.length < 2) { valid = false; break; }

      const sitters = shuffle(canSit).slice(0, 2);
      const playing = players.filter(p => !sitters.includes(p));
      const teams = findValidTeams(playing, partnerMap);
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
    }

    if (!valid) continue;

    // Final audit
    let passed = true;
    for (const p of players) {
      if (gameCounts[p] !== 6) { passed = false; break; }
      const pm = partnerMap[p];
      const total = Object.values(pm).reduce((s, v) => s + v, 0);
      const unique = Object.keys(pm).length;
      const twos = Object.values(pm).filter(v => v === 2).length;
      const ones = Object.values(pm).filter(v => v === 1).length;
      if (total !== 6 || unique !== 5 || twos !== 1 || ones !== 4) { passed = false; break; }
    }
    if (!passed) continue;

    // Column check
    for (const p of players) {
      const twosInCol = players.filter(o => o !== p && (partnerMap[o][p] || 0) === 2).length;
      if (twosInCol !== 1) { passed = false; break; }
    }
    if (!passed) continue;

    return { schedule, partnerMap, gameCounts, iterations: iter };
  }
  return null;
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

export default function App() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("schedule");

  const run = useCallback(() => {
    setRunning(true);
    setResult(null);
    setTimeout(() => {
      const res = generateSchedule(players);
      setResult(res);
      setRunning(false);
      setActiveTab("schedule");
    }, 50);
  }, [players]);

  const startEdit = (i) => { setEditingIdx(i); setEditVal(players[i]); };
  const saveEdit = () => {
    if (editVal.trim()) {
      const np = [...players];
      np[editingIdx] = editVal.trim();
      setPlayers(np);
    }
    setEditingIdx(null);
  };

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
              <div key={i}>
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

        {/* Results */}
        {result === null && !running && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-5xl mb-3">🏓</p>
            <p className="text-lg">Hit Generate to create your schedule!</p>
          </div>
        )}

        {result === false && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700 font-semibold">
            ✗ Too hard - no solution found after 500,000 iterations
          </div>
        )}

        {result && (
          <>
            {/* Iterations badge */}
            <div className="flex justify-center mb-4">
              <span className="bg-green-100 text-green-800 text-sm font-semibold px-4 py-1 rounded-full border border-green-300">
                ✓ Solution found in {result.iterations.toLocaleString()} iteration{result.iterations !== 1 ? "s" : ""}!
              </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              {["schedule", "partnerships", "verification"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${
                    activeTab === tab ? "bg-green-700 text-white" : "bg-white text-gray-600 hover:bg-gray-100 shadow"}`}>
                  {tab}
                </button>
              ))}
            </div>

            {/* SCHEDULE TAB */}
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

            {/* PARTNERSHIPS TAB */}
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

            {/* VERIFICATION TAB */}
            {activeTab === "verification" && (
              <div className="grid gap-3">
                {/* Games played */}
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

                {/* No consecutive sitouts */}
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

                {/* Partnership distribution */}
                <div className="bg-white rounded-2xl shadow p-4">
                  <h3 className="font-bold text-gray-700 mb-3">🤝 Partnerships (5 unique partners, 1 repeat each)</h3>
                  <div className="grid gap-3">
                    {players.map(p => {
                      const pm = result.partnerMap[p];
                      return (
                        <div key={p} className="text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-bold w-16 ${playerColors[p]}`}>{p}</span>
                            <span className="text-green-600 font-semibold">✓</span>
                            <span className="text-gray-400 text-xs">5 unique partners · 1 repeat</span>
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

                {/* All good banner */}
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
