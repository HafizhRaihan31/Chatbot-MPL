import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const router = Router();

/* =========================
   FIX __dirname
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   LOAD JSON (SAFE)
========================= */
function loadJSON(name) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "data", name), "utf-8")
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

/* =========================
   DOMAIN GUARD (ANTI NGASAL)
========================= */
function isMPLRelated(text) {
  const keywords = [
    "mpl", "jadwal", "klasemen", "pemain", "roster",
    "coach", "rrq", "ae", "evos", "onic", "geek"
  ];
  return keywords.some(k => text.toLowerCase().includes(k));
}

/* =========================
   INTENT DETECTION
========================= */
function detectIntent(text) {
  const t = text.toLowerCase();
  if (t.includes("jadwal")) return "schedule";
  if (t.includes("klasemen")) return "standings";
  if (t.includes("pemain") || t.includes("roster")) return "roster";
  if (t.includes("coach")) return "coach";
  return "unknown";
}

/* =========================
   FIND TEAM
========================= */
function findTeam(text) {
  return teams.find(t =>
    text.toLowerCase().includes((t.name || t.team || "").toLowerCase())
  );
}

/* =========================
   GROQ POLISHER (STRICT)
========================= */
async function polishWithGroq(rawText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return rawText;

  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content:
              "Kamu hanya memperhalus bahasa. DILARANG menambah fakta, nama, atau data baru."
          },
          {
            role: "user",
            content: rawText
          }
        ],
        temperature: 0.2
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
    return rawText;
  }
}

/* =========================
   MAIN ROUTE
========================= */
router.post("/", async (req, res) => {
  const message = (req.body.message || "").trim();

  if (!message) {
    return res.json({ answer: "Silakan masukkan pertanyaan." });
  }

  /* 🚫 BLOCK OFF-TOPIC */
  if (!isMPLRelated(message)) {
    return res.json({
      answer: "Maaf, saya hanya melayani pertanyaan seputar MPL Indonesia."
    });
  }

  const intent = detectIntent(message);
  let rawAnswer = "";

  /* =========================
     ROSTER
  ========================= */
  if (intent === "roster") {
    const team = findTeam(message);
    if (!team) {
      return res.json({ answer: "Tim tidak ditemukan." });
    }

    const detail = teamsDetail.find(d =>
      d.team?.toLowerCase().includes(team.name.toLowerCase())
    );

    if (!detail || !detail.players?.length) {
      return res.json({ answer: `Roster ${team.name} belum tersedia.` });
    }

    rawAnswer =
      `Roster ${team.name} saat ini adalah:\n` +
      detail.players
        .map(p => `- ${p.name} (${p.role || "pemain"})`)
        .join("\n");
  }

  /* =========================
     COACH
  ========================= */
  else if (intent === "coach") {
    const team = findTeam(message);
    if (!team || !team.coach) {
      return res.json({ answer: "Data coach tidak ditemukan." });
    }

    rawAnswer = `Coach tim ${team.name} adalah ${team.coach}.`;
  }

  /* =========================
     STANDINGS
  ========================= */
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

  /* =========================
     SCHEDULE
  ========================= */
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

  /* =========================
     UNKNOWN INTENT
  ========================= */
  else {
    return res.json({
      answer: "Pertanyaan tidak dikenali dalam konteks MPL."
    });
  }

  /* ✨ POLISH WITH GROQ */
  const finalAnswer = await polishWithGroq(rawAnswer);

  return res.json({ answer: finalAnswer });
});

export default router;
