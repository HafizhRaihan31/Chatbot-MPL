import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const router = Router();

/* =========================
   PATH FIX
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   LOAD JSON SAFE
========================= */
function loadJSON(file) {
  try {
    const p = path.join(__dirname, "..", "data", file);
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

const teams = loadJSON("teams.json");
const standings = loadJSON("standings.json");
const scheduleRaw = loadJSON("schedule.json");
const teamsDetail = loadJSON("teams_detail.json");

const schedule = Array.isArray(scheduleRaw)
  ? scheduleRaw
  : Object.values(scheduleRaw || {}).flat();

/* =========================
   ROLE & SINONIM
========================= */
const ROLE_ALIASES = {
  COACH: ["coach", "pelatih"],
  JUNGLE: ["jungler", "jungle"],
  GOLD: ["gold", "gold lane", "goldlaner"],
  MID: ["mid", "mid lane", "midlaner"],
  EXP: ["exp", "exp lane", "explane"],
  ROAM: ["roam", "roamer", "support"],
};

/* =========================
   HELPER DETECT
========================= */
function normalize(text) {
  return text.toLowerCase();
}

function detectRole(text) {
  const t = normalize(text);
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.some(a => t.includes(a))) return role;
  }
  return null;
}

function detectTeam(text) {
  const t = normalize(text);
  return teams.find(team =>
    (team.name || team.team || "")
      .toLowerCase()
      .includes(t.split(" ").find(w => w.length >= 3))
  );
}

function isMPLRelated(text) {
  const t = normalize(text);
  return (
    teams.some(tm => t.includes(tm.name.toLowerCase())) ||
    Object.values(ROLE_ALIASES).flat().some(r => t.includes(r)) ||
    t.includes("mpl") ||
    t.includes("jadwal") ||
    t.includes("klasemen")
  );
}

/* =========================
   GROQ POLISH (STRICT)
========================= */
async function polishWithGroq(text) {
  if (!process.env.GROQ_API_KEY) return text;

  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Perbaiki bahasa agar natural dan profesional. DILARANG menambah fakta atau informasi baru.",
          },
          { role: "user", content: text },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.data.choices[0].message.content;
  } catch {
    return text;
  }
}

/* =========================
   MAIN CHAT
========================= */
router.post("/", async (req, res) => {
  const message = (req.body.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "Pesan tidak boleh kosong." });
  }

  /* ==== OUT OF SCOPE ==== */
  if (!isMPLRelated(message)) {
    return res.json({
      answer: "Maaf, saya hanya melayani pertanyaan seputar MPL Indonesia.",
    });
  }

  const role = detectRole(message);
  const team = detectTeam(message);

  /* =========================
     ROLE / COACH QUERY
  ========================= */
  if (role && team) {
    const detail = teamsDetail.find(d =>
      d.team?.toLowerCase().includes(team.name.toLowerCase())
    );

    if (!detail || !Array.isArray(detail.players)) {
      return res.json({
        answer: `Data tim ${team.name} belum tersedia.`,
      });
    }

    const players = detail.players.filter(p =>
      p.role?.toUpperCase().includes(role)
    );

    if (!players.length) {
      return res.json({
        answer: `Data ${role.toLowerCase()} tim ${team.name} belum tersedia.`,
      });
    }

    const names = players.map(p => p.name).join(", ");
    const raw = `Untuk tim ${team.name}, posisi ${role.toLowerCase()} diisi oleh ${names}.`;

    return res.json({
      answer: await polishWithGroq(raw),
    });
  }

  /* =========================
     ROSTER TEAM
  ========================= */
  if (team && message.toLowerCase().includes("pemain")) {
    const detail = teamsDetail.find(d =>
      d.team?.toLowerCase().includes(team.name.toLowerCase())
    );

    if (!detail?.players?.length) {
      return res.json({
        answer: `Roster tim ${team.name} belum tersedia.`,
      });
    }

    const list = detail.players
      .map(p => `${p.name} (${p.role})`)
      .join(", ");

    return res.json({
      answer: await polishWithGroq(
        `Roster pemain tim ${team.name} saat ini adalah: ${list}.`
      ),
    });
  }

  /* =========================
     STANDINGS
  ========================= */
  if (message.toLowerCase().includes("klasemen")) {
    const text = standings
      .slice(0, 8)
      .map((s, i) => `${i + 1}. ${s.team} (${s.points} poin)`)
      .join("\n");

    return res.json({
      answer: await polishWithGroq(
        `Berikut klasemen MPL Indonesia saat ini:\n${text}`
      ),
    });
  }

  /* =========================
     SCHEDULE
  ========================= */
  if (message.toLowerCase().includes("jadwal")) {
    const list = schedule.slice(0, 5);

    const text = list
      .map(m => `${m.team1} vs ${m.team2} — ${m.date || "TBA"}`)
      .join("\n");

    return res.json({
      answer: await polishWithGroq(
        `Berikut jadwal pertandingan MPL terdekat:\n${text}`
      ),
    });
  }

  /* =========================
     FALLBACK (MPL ONLY)
  ========================= */
  return res.json({
    answer:
      "Pertanyaan Anda terkait MPL Indonesia, namun saya belum dapat memahaminya dengan baik. Silakan gunakan format seperti: siapa jungler ONIC, siapa coach RRQ, atau jadwal MPL hari ini.",
  });
});

export default router;
