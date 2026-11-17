// Prefill from the next game on the books. The scheduling bot publishes a small `next_game`
// summary (players and court names) in its public snapshot; this reads the newest one. The key
// below is a publishable, read-only key — the same one the public dashboard page ships with.
// Pure helpers here so the roster maths is testable; the fetch is the only side effect.
const SNAPSHOT_URL =
  "https://bvbvpzofaiexrspoetek.supabase.co/rest/v1/ca_snapshot" +
  "?select=next_game:payload->next_game&order=generated_at.desc&limit=1";
const PUBLIC_KEY = "sb_publishable_Ah2HpzQlzDgT2ZvtAdsk2w_lFSiD4yH";
const GAME_MIN = 120;

export async function fetchNextGame() {
  const res = await fetch(SNAPSHOT_URL, { headers: { apikey: PUBLIC_KEY } });
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  const rows = await res.json();
  return (rows && rows[0] && rows[0].next_game) || null;
}

const pad2 = (n) => String(n).padStart(2, "0");

// Turn a published game into what the form needs, or null when it is unusable: nothing published,
// no players, or a game that is already over (the snapshot is only rebuilt a few times a day).
// `now` is a Date in the viewer's own time zone, which is the courts' time zone in practice.
export function prefillFrom(game, { min, max, women = [], now = new Date() } = {}) {
  if (!game || !Array.isArray(game.players) || !game.players.length || !game.date) return null;
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = Number.isFinite(game.startMin) ? game.startMin : 0;
  if (game.date < today || (game.date === today && startMin + GAME_MIN <= nowMin)) return null;

  const seen = new Set();
  const names = [];
  for (const raw of game.players) {
    const n = String(raw || "").trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    names.push(n);
  }
  const total = names.length;
  const players = names.slice(0, max);
  for (let i = players.length + 1; players.length < min; i++) {
    const filler = `Player ${i}`;
    if (!seen.has(filler.toLowerCase())) players.push(filler);
  }
  const womenSet = new Set(women.map((w) => w.toLowerCase()));
  const genders = {};
  players.forEach((p) => {
    genders[p] = womenSet.has(p.toLowerCase()) ? "F" : "M";
  });
  const [y, m, d] = game.date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
  const h = Math.floor(startMin / 60);
  const mm = startMin % 60;
  const time = `${((h + 11) % 12) + 1}${mm ? ":" + pad2(mm) : ""} ${h < 12 ? "AM" : "PM"}`;
  return {
    players,
    genders,
    courtNames: (game.courts || []).map((c) => String((c && c.name) || "")),
    startTime: `${pad2(h)}:${pad2(mm)}`,
    label: `${day} ${time}${game.club ? ` at ${game.club}` : ""}`,
    total,       // how many are on the booking
    dropped: Math.max(0, total - max),
    padded: Math.max(0, min - total),
  };
}
