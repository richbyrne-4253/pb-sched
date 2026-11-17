// "Post to the group": hands the schedule on screen to the scheduling bot, which posts it in the
// chosen WhatsApp group. The page is public, so the bot only acts on a request signed with a key
// this browser was given once, through a setup link (…/#postkey=<key>). No key, no buttons.
//
// The request goes into the bot's public request queue; the bot checks the signature, posts, and
// writes the outcome back on the same row, which we poll.
const BASE = "https://bvbvpzofaiexrspoetek.supabase.co/rest/v1/ca_refresh_request";
const PUBLIC_KEY = "sb_publishable_Ah2HpzQlzDgT2ZvtAdsk2w_lFSiD4yH";
const STORE = "pbsched.postkey";
const HEADERS = { apikey: PUBLIC_KEY, "Content-Type": "application/json" };

// Pick the key up from a setup link, remember it on this device, and scrub it from the address bar.
export function loadPostKey() {
  try {
    const m = /[#&]postkey=([0-9a-f]{32,128})/i.exec(window.location.hash || "");
    if (m) {
      window.localStorage.setItem(STORE, m[1].toLowerCase());
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return window.localStorage.getItem(STORE) || "";
  } catch {
    return "";
  }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(key, ts, body) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(`${ts}.${body}`)));
}

// What the bot needs to write the post. `clock` is gameClock()'s result, or null when times are off.
export function buildPostPayload({ group, schedule, courtNames, clock, warmupMin, when, slot }) {
  return {
    group,
    when: when || "",
    courtNames: courtNames || [],
    warmup: clock && Number(warmupMin) > 0 ? { min: Number(warmupMin), starts: clock.sessionStart } : null,
    courtEnds: clock ? clock.sessionEnd : "",
    slot: slot || null,
    games: schedule.map((g, i) => ({ courts: g.courts, sitting: g.sitting || [], starts: clock ? clock.starts[i] : "", minutes: clock ? clock.minutes[i] : null })),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Send it and wait for the bot's answer. Resolves { ok, message }; never throws.
export async function postSchedule(key, payload, { onStatus = () => {} } = {}) {
  try {
    const ts = Date.now();
    const body = JSON.stringify(payload);
    const sig = await sign(key, ts, body);
    const res = await fetch(BASE, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "return=representation" },
      body: JSON.stringify({ scope: "post_rotation", slot: { ts, body, sig } }),
    });
    if (!res.ok) return { ok: false, message: `Could not reach Rally (${res.status}).` };
    const id = (await res.json())[0]?.id;
    if (id == null) return { ok: false, message: "Could not reach Rally." };
    onStatus("Sent to Rally — waiting for it to post…");
    for (let i = 0; i < 60; i++) {
      await sleep(3000);
      const r = await fetch(`${BASE}?id=eq.${encodeURIComponent(id)}&select=status,result`, { headers: HEADERS });
      const row = r.ok ? (await r.json())[0] : null;
      if (row && row.status === "done") return { ok: true, message: `Posted — ${row.result?.note || "queued"}.` };
      if (row && row.status === "error") return { ok: false, message: `Rally did not post it: ${row.result?.error || "unknown error"}.` };
    }
    return { ok: false, message: "Rally has not answered after 3 minutes. Check the group before pressing again." };
  } catch (e) {
    return { ok: false, message: `Could not send: ${e.message || e}.` };
  }
}
