import { Router } from "express";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

const router = Router();

/* =========================
   LOAD JSON
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadJSON = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", name), "utf-8"));

const teamsDetail = loadJSON("teams_detail.json");
const standings = loadJSON("standings.json");
const scheduleRaw = loadJSON("schedule.json");

const schedule = Array.isArray(scheduleRaw)
  ? scheduleRaw
  : Object.values(scheduleRaw || {}).flat();

/* =========================
   UTIL
========================= */
const clean = (t) =>
  t.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

/* Levenshtein (typo tolerance ringan) */
function distance(a, b) {
  if (!a || !b) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/* =========================
   ALIAS
========================= */
const TEAM_ALIAS = {
  AE: ["ae", "alter", "alter ego", "alterego"],
  RRQ: ["rrq", "rex", "rrq hosh"],
  ONIC: ["onic", "onic esports"],
  BTR: ["btr", "bigetron"],
  EVOS: ["evos"],
  AURA: ["aura"],
  GEEK: ["geek"],
  DEWA: ["dewa"]
};

const ROLE_ALIAS = {
  COACH: ["coach", "pelatih", "kepala pelatih"],
  "AST. COACH": ["assistant coach", "asisten pelatih"],
  JUNGLE: ["jungler", "jungle", "jg"],
  MID: ["mid", "midlane", "mid lane"],
  GOLD: ["gold", "gold lane", "marksman", "mm"],
  EXP: ["exp", "exp lane"],
  ROAM: ["roam", "roamer", "support"]
};

const PLAYER_KEYWORDS = [
  "pemain",
  "player",
  "roster",
  "skuad",
  "anggota",
  "lineup"
];

/* =========================
   MATCHER
========================= */
function matchAlias(text, map) {
  for (const key in map) {
    for (const a of map[key]) {
      if (text.includes(a)) return key;
      if (distance(text, a) <= 1) return key;
    }
  }
  return null;
}

/* =========================
   GROQ POLISHER
========================= */
async function polish(text) {
  if (!process.env.GROQ_API_KEY) return text;
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content:
              "Perhalus kalimat berikut agar natural dan singkat. Jangan menambah atau mengubah informasi."
          },
          { role: "user", content: text }
        ],
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data.choices[0].message.content;
  } catch {
    return text;
  }
}

/* =========================
   MAIN ROUTE
========================= */
router.post("/", async (req, res) => {
  const msg = clean(req.body.message || "");
  if (!msg) return res.json({ answer: "Pesan kosong." });

  /* 🔒 FILTER NON MPL */
  if (
    !/(mpl|rrq|onic|alter|btr|evos|aura|dewa|geek|jadwal|klasemen|coach|pelatih|pemain|roster|jungler|gold|mid|exp|roam)/.test(
      msg
    )
  ) {
    return res.json({
      answer: "Maaf, saya hanya melayani pertanyaan seputar MPL Indonesia."
    });
  }

  const team = matchAlias(msg, TEAM_ALIAS);
  const role = matchAlias(msg, ROLE_ALIAS);

  /* ===== ROLE QUERY ===== */
  if (team && role) {
    const t = teamsDetail.find((x) => x.team === team);
    if (!t) return res.json({ answer: "Tim tidak ditemukan." });

    const found = t.players.filter((p) =>
      p.role.toUpperCase().includes(role)
    );

    if (!found.length) {
      return res.json({
        answer: `Data ${role.toLowerCase()} tim ${team} belum tersedia.`
      });
    }

    const names = found.map((p) => p.name).join(", ");
    return res.json({
      answer: await polish(`${role} tim ${team} adalah ${names}.`)
    });
  }

  /* ===== SEMUA PEMAIN ===== */
  if (team && !role && PLAYER_KEYWORDS.some((k) => msg.includes(k))) {
    const t = teamsDetail.find((x) => x.team === team);
    if (!t) return res.json({ answer: "Tim tidak ditemukan." });

    const players = t.players.filter(
      (p) =>
        !p.role.toUpperCase().includes("COACH") &&
        !p.role.toUpperCase().includes("ANALYST")
    );

    const list = players
      .map((p) => `• ${p.name} (${p.role})`)
      .join("\n");

    return res.json({
      answer: await polish(`Daftar pemain tim ${team}:\n${list}`)
    });
  }

  /* ===== KLASMEN (FIX FINAL – TANPA UBAH FLOW) ===== */
  if (msg.includes("klasemen")) {
    const valid = standings.filter(
      (t) => t.matchPoint
    );

    const text = valid
      .slice(0, 8)
      .map((t, i) => {
        const teamName =
          t.teamName ||
          t.team ||
          t.team_name ||
          "Tim Tidak Diketahui";

        return `${i + 1}. ${teamName} (${t.matchPoint})`;
      })
      .join("\n");

    return res.json({
      answer: `Klasemen MPL saat ini:\n${text}`
    });
  }

  /* ===== JADWAL HARI INI ===== */
  if (msg.includes("jadwal")) {
    const today = new Date().toLocaleDateString("id-ID");
    const todayMatches = schedule.filter(
      (m) => m.date === today
    );

    if (!todayMatches.length) {
      return res.json({
        answer: "Tidak ada pertandingan MPL hari ini."
      });
    }

    const text = todayMatches
      .map((m) => `${m.team1} vs ${m.team2}`)
      .join("\n");

    return res.json({
      answer: `Jadwal MPL hari ini:\n${text}`
    });
  }

  /* ===== FALLBACK ===== */
  return res.json({
    answer:
      "Format belum dikenali.\nContoh:\n• siapa jungler ONIC\n• siapa pelatih Alter Ego\n• siapa pemain RRQ\n• jadwal MPL hari ini\n• klasemen MPL"
  });
});

export default router;
