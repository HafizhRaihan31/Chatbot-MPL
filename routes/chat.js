import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const router = Router();

/* ===============================
   FIX __dirname
================================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===============================
   LOAD JSON (AMAN)
================================ */
function loadJSON(filename) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "data", filename), "utf-8")
    );
  } catch {
    return [];
  }
}

const teams = loadJSON("teams.json");
const teamsDetail = loadJSON("teams_detail.json");
const standings = loadJSON("standings.json");
const scheduleRaw = loadJSON("schedule.json");

const schedule = Array.isArray(scheduleRaw)
  ? scheduleRaw
  : Object.values(scheduleRaw || {}).flat();

/* ===============================
   DOMAIN GUARD (ANTI OFF-TOPIC)
================================ */
function isMPLRelated(text) {
  const keywords = [
    "mpl", "jadwal", "klasemen",
    "pemain", "roster",
    "coach", "pelatih",
    "rrq", "ae", "alter ego",
    "btr", "bigetron",
    "evos", "onic", "geek"
  ];

  return keywords.some(k => text.toLowerCase().includes(k));
}

/* ===============================
   INTENT DETECTION (SINONIM)
================================ */
function detectIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("jadwal")) return "schedule";
  if (t.includes("klasemen")) return "standings";
  if (t.includes("pemain") || t.includes("roster")) return "roster";

  // 🔥 coach = pelatih
  if (t.includes("coach") || t.includes("pelatih")) return "coach";

  return "unknown";
}

/* ===============================
   NORMALISASI NAMA TIM
================================ */
function normalizeTeamName(text) {
  const map = {
    "btr": "bigetron",
    "bigetron": "bigetron",
    "ae": "alter ego",
    "alter ego": "alter ego",
    "rrq": "rrq",
    "onic": "onic",
    "evos": "evos",
    "geek": "geek"
  };

  const lower = text.toLowerCase();
  for (const key in map) {
    if (lower.includes(key)) return map[key];
  }
  return lower;
}

/* ===============================
   CARI TIM
================================ */
function findTeam(text) {
  const normalized = normalizeTeamName(text);
  return teams.find(t =>
    (t.name || t.team || "").toLowerCase().includes(normalized)
  );
}

/* ===============================
   GROQ POLISHER (STRICT MODE)
================================ */
async function polishWithGroq(text) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return text;

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
              "Tugasmu hanya memperhalus bahasa. DILARANG menambah fakta, nama, atau informasi baru."
          },
          {
            role: "user",
            content: text
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data.choices[0].message.content.trim();
  } catch {
    return text;
  }
}

/* ===============================
   MAIN ROUTE
================================ */
router.post("/", async (req, res) => {
  const message = (req.body.message || "").trim();

  if (!message) {
    return res.json({ answer: "Silakan masukkan pertanyaan." });
  }

  // 🚫 BLOK PERTANYAAN NON-MPL
  if (!isMPLRelated(message)) {
    return res.json({
      answer: "Maaf, saya hanya melayani pertanyaan seputar MPL Indonesia."
    });
  }

  const intent = detectIntent(message);
  let rawAnswer = "";

  /* ========= ROSTER ========= */
  if (intent === "roster") {
    const team = findTeam(message);
    if (!team) {
      return res.json({ answer: "Tim tidak ditemukan." });
    }

    const detail = teamsDetail.find(d =>
      d.team?.toLowerCase().includes(team.name.toLowerCase())
    );

    if (!detail || !detail.players?.length) {
      return res.json({
        answer: `Data roster ${team.name} belum tersedia.`
      });
    }

    rawAnswer =
      `Roster ${team.name} saat ini:\n` +
      detail.players
        .map(p => `- ${p.name} (${p.role || "pemain"})`)
        .join("\n");
  }

  /* ========= COACH ========= */
  else if (intent === "coach") {
    const team = findTeam(message);
    if (!team || !team.coach) {
      return res.json({
        answer: "Data coach tim tersebut belum tersedia."
      });
    }

    rawAnswer = `Pelatih (coach) tim ${team.name} saat ini adalah ${team.coach}.`;
  }

  /* ========= STANDINGS ========= */
  else if (intent === "standings") {
    if (!standings.length) {
      return res.json({ answer: "Data klasemen belum tersedia." });
    }

    rawAnswer =
      "Klasemen MPL terbaru:\n" +
      standings
        .slice(0, 8)
        .map((t, i) => `${i + 1}. ${t.team} (${t.points} poin)`)
        .join("\n");
  }

  /* ========= SCHEDULE ========= */
  else if (intent === "schedule") {
    if (!schedule.length) {
      return res.json({ answer: "Data jadwal belum tersedia." });
    }

    rawAnswer =
      "Jadwal pertandingan MPL terdekat:\n" +
      schedule
        .slice(0, 5)
        .map(m => `- ${m.team1} vs ${m.team2} (${m.date || "TBA"})`)
        .join("\n");
  }

  /* ========= UNKNOWN ========= */
  else {
    return res.json({
      answer: "Pertanyaan tidak dikenali dalam konteks MPL."
    });
  }

  // ✨ POLISH (TANPA UBAH FAKTA)
  const finalAnswer = await polishWithGroq(rawAnswer);

  return res.json({ answer: finalAnswer });
});

export default router;
