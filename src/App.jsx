import { useState, useCallback, useMemo } from "react";
import { courtsFor, defaultGames, generateSchedule, buildPlayerGames } from "./scheduler.js";

// 8 players (4M + 4F) is the headline use case: 2 courts, coed or same-gender.
const DEFAULT_PLAYERS = ["Rich", "Tom", "Steve", "Mike", "Carol", "Julie", "Barbara", "Lisa"];
const DEFAULT_GENDERS = {
  Rich: "M", Tom: "M", Steve: "M", Mike: "M",
  Carol: "F", Julie: "F", Barbara: "F", Lisa: "F",
};

const MIN_PLAYERS = 6;
const MAX_PLAYERS = 8;
const MAX_PAIRS = 4;

const EMPTY_PAIRS = Array.from({ length: MAX_PAIRS }, () => ({ a: "", b: "" }));

export default function App() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [pairs, setPairs] = useState(EMPTY_PAIRS);
  const [coed, setCoed] = useState(false);
  const [genders, setGenders] = useState(DEFAULT_GENDERS);
  const [numGames, setNumGames] = useState(defaultGames(DEFAULT_PLAYERS.length));
  const [result, setResult] = useState(undefined);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("schedule");

  const courts = courtsFor(players.length);
  const sitPerGame = players.length - courts * 4;

  const usedInPairs = useMemo(() => {
    const used = new Map();
    pairs.forEach((p, i) => {
      if (p.a) used.set(p.a, i);
      if (p.b) used.set(p.b, i);
    });
    return used;
  }, [pairs]);

  const activePairs = useMemo(
    () => pairs.filter((p) => p.a && p.b).map((p) => [p.a, p.b]),
    [pairs]
  );

  const validate = () => {
    if (players.some((p) => !p.trim())) return "Every player needs a name.";
    if (new Set(players).size !== players.length) return "Player names must be unique.";
    if (!Number.isInteger(numGames) || numGames < 1 || numGames > 30)
      return "Games must be a whole number from 1 to 30.";

    for (let i = 0; i < pairs.length; i++) {
      const { a, b } = pairs[i];
      if ((a && !b) || (b && !a)) return `Couple ${i + 1}: pick both players or clear the row.`;
      if (a && b && a === b) return `Couple ${i + 1}: a player can't be paired with themselves.`;
    }
    const flat = activePairs.flat();
    if (new Set(flat).size !== flat.length) return "A player appears in more than one couple.";

    const males = players.filter((p) => genders[p] === "M").length;
    const females = players.filter((p) => genders[p] === "F").length;

    if (coed) {
      const missing = players.filter((p) => !genders[p]);
      if (missing.length) return `Set M/F for: ${missing.join(", ")}.`;
      if (males < 2 * courts || females < 2 * courts)
        return `Coed needs at least ${2 * courts} M and ${2 * courts} F (you have ${males} M, ${females} F).`;
      for (const [a, b] of activePairs)
        if (genders[a] === genders[b])
          return `Coed couple ${a} & ${b} are both ${genders[a]} — a couple must be 1 M + 1 F.`;
    }

    const segregate = !coed && courts === 2 && males === 4 && females === 4;
    if (segregate)
      for (const [a, b] of activePairs)
        if (genders[a] !== genders[b])
          return `Same-gender play keeps men and women on separate courts, so couple ${a} & ${b} can't be mixed.`;

    return null;
  };

  const run = useCallback(() => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setRunning(true);
    setResult(undefined);
    setTimeout(() => {
      const res = generateSchedule(players, { genders, numGames, coed, fixedPairs: activePairs });
      setResult(res);
      setRunning(false);
      setActiveTab("schedule");
    }, 50);
  }, [players, genders, numGames, coed, activePairs]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (i) => {
    setEditingIdx(i);
    setEditVal(players[i]);
  };
  const saveEdit = () => {
    if (editVal.trim()) {
      const oldName = players[editingIdx];
      const newName = editVal.trim();
      if (oldName !== newName) {
        const np = [...players];
        np[editingIdx] = newName;
        setPlayers(np);
        setPairs((prev) =>
          prev.map((p) => ({
            a: p.a === oldName ? newName : p.a,
            b: p.b === oldName ? newName : p.b,
          }))
        );
        setGenders((prev) => {
          if (!(oldName in prev)) return prev;
          const { [oldName]: g, ...rest } = prev;
          return { ...rest, [newName]: g };
        });
      }
    }
    setEditingIdx(null);
  };

  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS) return;
    let n = players.length + 1;
    let name = `Player ${n}`;
    while (players.includes(name)) name = `Player ${++n}`;
    const next = [...players, name];
    setPlayers(next);
    setNumGames(defaultGames(next.length));
  };

  const removePlayer = (i) => {
    if (players.length <= MIN_PLAYERS) return;
    const name = players[i];
    const next = players.filter((_, j) => j !== i);
    setPlayers(next);
    setNumGames(defaultGames(next.length));
    setPairs((prev) =>
      prev.map((p) => ({ a: p.a === name ? "" : p.a, b: p.b === name ? "" : p.b }))
    );
    setGenders((prev) => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
    if (editingIdx === i) setEditingIdx(null);
  };

  const setPair = (rowIdx, slot, name) =>
    setPairs((prev) => prev.map((p, i) => (i === rowIdx ? { ...p, [slot]: name } : p)));
  const clearPair = (rowIdx) =>
    setPairs((prev) => prev.map((p, i) => (i === rowIdx ? { a: "", b: "" } : p)));

  const setGender = (name, g) => setGenders((prev) => ({ ...prev, [name]: g }));

  const palette = [
    "text-blue-700", "text-pink-600", "text-green-700", "text-purple-700",
    "text-orange-600", "text-teal-700", "text-red-600", "text-indigo-700",
  ];
  const bgPalette = [
    "bg-blue-100", "bg-pink-100", "bg-green-100", "bg-purple-100",
    "bg-orange-100", "bg-teal-100", "bg-red-100", "bg-indigo-100",
  ];
  const playerColors = {};
  const playerBg = {};
  players.forEach((p, i) => {
    playerColors[p] = palette[i % palette.length];
    playerBg[p] = bgPalette[i % bgPalette.length];
  });

  const pairOptionsFor = (rowIdx, slot) => {
    const own = pairs[rowIdx][slot];
    return players.filter((p) => {
      if (p === own) return true;
      const usedRow = usedInPairs.get(p);
      if (usedRow === undefined) return true;
      return usedRow === rowIdx;
    });
  };

  const playsPerPlayer = numGames - Math.round((sitPerGame * numGames) / players.length);
  const subtitle =
    `${players.length} players · ${numGames} games · ${courts} court${courts > 1 ? "s" : ""}` +
    (coed ? " · coed (mixed teams)" : courts === 2 ? " · same-gender courts" : "");

  const TeamCell = (team) => (
    <>
      <span className={`font-semibold ${playerColors[team[0]]}`}>{team[0]}</span>
      <span className="text-gray-400 mx-1">&amp;</span>
      <span className={`font-semibold ${playerColors[team[1]]}`}>{team[1]}</span>
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-green-800">🏓 PB1 Pickleball Scheduler</h1>
          <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>
        </div>

        {/* Player Names */}
        <div className="bg-white rounded-2xl shadow p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-700">👥 Players (click a name to edit)</h2>
            <button
              onClick={addPlayer}
              disabled={players.length >= MAX_PLAYERS}
              className={`text-sm font-semibold px-3 py-1 rounded-lg border ${
                players.length >= MAX_PLAYERS
                  ? "text-gray-300 border-gray-200 cursor-not-allowed"
                  : "text-green-700 border-green-300 hover:bg-green-50"
              }`}
            >
              ＋ Add player
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {players.map((p, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-stretch gap-1">
                  {editingIdx === i ? (
                    <input
                      className="border-2 border-green-400 rounded-lg px-3 py-2 w-full text-sm font-medium focus:outline-none"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => startEdit(i)}
                      className={`flex-1 text-left px-3 py-2 rounded-lg text-sm font-semibold border-2 border-transparent hover:border-green-300 transition-colors ${playerBg[p]} ${playerColors[p]}`}
                    >
                      {p}
                    </button>
                  )}
                  <button
                    onClick={() => removePlayer(i)}
                    disabled={players.length <= MIN_PLAYERS}
                    className={`px-2 rounded-lg text-sm ${
                      players.length <= MIN_PLAYERS
                        ? "text-gray-200 cursor-not-allowed"
                        : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                    }`}
                    title="Remove player"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex gap-1">
                  {["M", "F"].map((g) => (
                    <button
                      key={g}
                      onClick={() => setGender(p, g)}
                      className={`flex-1 px-2 py-1 rounded text-xs font-bold border ${
                        genders[p] === g
                          ? g === "M"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-pink-500 text-white border-pink-500"
                          : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            {players.length} players →{" "}
            {courts === 2
              ? "2 courts, everyone plays every game"
              : `1 court, ${sitPerGame} sit out each game`}
            . M/F is used for coed teams and same-gender courts.
          </p>
        </div>

        {/* Options */}
        <div className="bg-white rounded-2xl shadow p-4 mb-4">
          <h2 className="font-bold text-gray-700 mb-3">⚙️ Schedule Options</h2>

          <div className="flex flex-wrap items-center gap-6 mb-4">
            <label className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Games</span>
              <input
                type="number"
                min={1}
                max={30}
                value={numGames}
                onChange={(e) => setNumGames(parseInt(e.target.value, 10) || 0)}
                className="border rounded-lg px-2 py-1 text-sm w-20 bg-white"
              />
              <span className="text-xs text-gray-400">≈ each plays {playsPerPlayer}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={coed}
                onChange={(e) => setCoed(e.target.checked)}
                className="w-4 h-4 accent-green-700"
              />
              <span className="text-sm font-medium text-gray-700">
                Coed — every team is 1 M + 1 F
              </span>
            </label>
          </div>

          <div className="text-xs font-semibold text-gray-500 mb-1">
            Fixed couples (optional, up to {MAX_PAIRS}) — these two always play together
          </div>
          <div className="text-xs text-gray-400 mb-2">
            Leave empty to rotate partners (everyone plays with many different people — the richer
            mix). Fill in couples to keep them together (e.g. 4 couples → every couple plays every
            other couple).
          </div>
          <div className="flex flex-col gap-2">
            {pairs.map((pair, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{rowIdx + 1}.</span>
                <select
                  value={pair.a}
                  onChange={(e) => setPair(rowIdx, "a", e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm flex-1 bg-white"
                >
                  <option value="">— player —</option>
                  {pairOptionsFor(rowIdx, "a").map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <span className="text-gray-400">+</span>
                <select
                  value={pair.b}
                  onChange={(e) => setPair(rowIdx, "b", e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm flex-1 bg-white"
                >
                  <option value="">— player —</option>
                  {pairOptionsFor(rowIdx, "b").map((p) => (
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

        {/* Generate */}
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

        {result === undefined && !running && !error && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-5xl mb-3">🏓</p>
            <p className="text-lg">Hit Generate to create your schedule!</p>
          </div>
        )}

        {result === null && !running && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700 font-semibold">
            ✗ Couldn't build a schedule with those settings. Try adjusting games, couples, or genders.
          </div>
        )}

        {result && (
          <>
            <div className="flex justify-center mb-4 gap-2 flex-wrap">
              <span className="bg-green-100 text-green-800 text-sm font-semibold px-4 py-1 rounded-full border border-green-300">
                ✓ Found in {result.iterations.toLocaleString()} iteration
                {result.iterations !== 1 ? "s" : ""}
              </span>
              <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-4 py-1 rounded-full border border-blue-300">
                {result.coed ? "Coed" : result.segregate ? "Same-gender courts" : "Open"}
              </span>
              {result.score === 0 && (
                <span className="bg-emerald-100 text-emerald-800 text-sm font-semibold px-4 py-1 rounded-full border border-emerald-300">
                  ★ Perfect balance
                </span>
              )}
            </div>

            <div className="flex gap-2 mb-4">
              {["schedule", "partnerships", "verification"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? "bg-green-700 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-100 shadow"
                  }`}
                >
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
                      {courts > 1 && <th className="p-3 text-left w-16">Court</th>}
                      <th className="p-3 text-left">Team 1</th>
                      <th className="p-3 text-center w-8">vs</th>
                      <th className="p-3 text-left">Team 2</th>
                      {sitPerGame > 0 && <th className="p-3 text-left">Sitting Out</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.schedule.map((g, gi) =>
                      g.courts.map((ct, ci) => (
                        <tr
                          key={`${g.game}-${ci}`}
                          className={`border-b ${gi % 2 === 0 ? "bg-white" : "bg-green-50"}`}
                        >
                          {ci === 0 && (
                            <td
                              rowSpan={g.courts.length}
                              className="p-3 text-center font-bold text-green-700 align-top"
                            >
                              {g.game}
                            </td>
                          )}
                          {courts > 1 && (
                            <td className="p-3 text-gray-500 font-medium">{ci + 1}</td>
                          )}
                          <td className="p-3">{TeamCell(ct[0])}</td>
                          <td className="p-3 text-center text-gray-400 font-bold">vs</td>
                          <td className="p-3">{TeamCell(ct[1])}</td>
                          {sitPerGame > 0 && ci === 0 && (
                            <td
                              rowSpan={g.courts.length}
                              className="p-3 text-gray-400 text-xs align-top"
                            >
                              {g.sitting.map((s, si) => (
                                <span key={si} className={`${playerColors[s]} font-medium`}>
                                  {s}
                                  {si < g.sitting.length - 1 ? ", " : ""}
                                </span>
                              ))}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "partnerships" && (
              <div className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="p-3 bg-green-50 border-b text-xs text-gray-500 flex gap-4 flex-wrap">
                  <span>
                    <span className="inline-block w-4 h-4 rounded bg-green-200 mr-1 align-middle"></span>
                    Once
                  </span>
                  <span>
                    <span className="inline-block w-4 h-4 rounded bg-yellow-200 mr-1 align-middle"></span>
                    Repeat partner
                  </span>
                  <span>
                    <span className="inline-block w-4 h-4 rounded bg-gray-100 mr-1 align-middle"></span>
                    Never partnered
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-green-700 text-white">
                        <th className="p-3 text-left">Player</th>
                        {players.map((p) => (
                          <th key={p} className="p-3 text-center font-semibold">{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((p1, i) => (
                        <tr key={p1} className={i % 2 === 0 ? "bg-white" : "bg-green-50"}>
                          <td className={`p-3 font-bold ${playerColors[p1]}`}>{p1}</td>
                          {players.map((p2) => {
                            if (p1 === p2)
                              return (
                                <td key={p2} className="p-3 text-center text-gray-300">—</td>
                              );
                            const count = result.partner[p1][p2] || 0;
                            const bg =
                              count >= 2
                                ? "bg-yellow-200 text-yellow-800 font-bold"
                                : count === 1
                                ? "bg-green-200 text-green-800"
                                : "text-gray-300";
                            return (
                              <td key={p2} className="p-3 text-center">
                                <span
                                  className={`inline-block w-7 h-7 rounded-full leading-7 text-sm font-semibold ${bg}`}
                                >
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
                  <h3 className="font-bold text-gray-700 mb-3">🎮 Games played</h3>
                  <div className="grid gap-2">
                    {players.map((p) => {
                      const games = buildPlayerGames(result.schedule)[p] || [];
                      const allGames = Array.from({ length: numGames }, (_, k) => k + 1);
                      const sits = allGames.filter((g) => !games.includes(g));
                      return (
                        <div key={p} className="flex items-center gap-2 text-sm flex-wrap">
                          <span className={`font-bold w-16 ${playerColors[p]}`}>{p}</span>
                          <span className="text-green-600 font-semibold">{games.length}×</span>
                          <div className="flex gap-1 flex-wrap">
                            {allGames.map((g) => (
                              <span
                                key={g}
                                className={`w-6 h-6 rounded text-xs flex items-center justify-center font-semibold ${
                                  games.includes(g)
                                    ? `${playerBg[p]} ${playerColors[p]}`
                                    : "bg-gray-100 text-gray-300"
                                }`}
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                          {sitPerGame > 0 && (
                            <span className="text-gray-400 text-xs">
                              sits: {sits.length ? sits.join(", ") : "none"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {sitPerGame > 0 && (
                  <div className="bg-white rounded-2xl shadow p-4">
                    <h3 className="font-bold text-gray-700 mb-3">⛔ No back-to-back sit-outs</h3>
                    <div className="grid gap-1">
                      {players.map((p) => {
                        const games = buildPlayerGames(result.schedule)[p] || [];
                        const sits = Array.from({ length: numGames }, (_, k) => k + 1)
                          .filter((g) => !games.includes(g))
                          .sort((a, b) => a - b);
                        const consec = sits.some((s, i) => i > 0 && s - sits[i - 1] === 1);
                        return (
                          <div key={p} className="flex items-center gap-2 text-sm">
                            <span className={`font-bold w-16 ${playerColors[p]}`}>{p}</span>
                            <span className={consec ? "text-red-500" : "text-green-600"}>
                              {consec ? "✗" : "✓"}
                            </span>
                            <span className="text-gray-500">
                              sits out: {sits.length ? sits.join(", ") : "never"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl shadow p-4">
                  <h3 className="font-bold text-gray-700 mb-3">🤝 Partner variety</h3>
                  <div className="grid gap-3">
                    {players.map((p) => {
                      const pm = result.partner[p];
                      const entries = Object.entries(pm).filter(([, c]) => c > 0);
                      return (
                        <div key={p} className="text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`font-bold w-16 ${playerColors[p]}`}>{p}</span>
                            <span className="text-gray-400 text-xs">
                              {entries.length} distinct partner{entries.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 pl-16">
                            {entries.sort().map(([partner, count]) => (
                              <span
                                key={partner}
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  count >= 2
                                    ? "bg-yellow-200 text-yellow-800"
                                    : "bg-green-100 text-green-700"
                                }`}
                              >
                                {partner}: {count > 1 ? `${count}×` : "1×"}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
