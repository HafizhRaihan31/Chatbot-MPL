import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const router = Router();

/* =========================
   FIX __dirname (ESM)
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   LOAD JSON FILES
========================= */
function loadJSON(filename) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "data", filename), "utf-8")
    );
  } catch (err) {
    console.error(`❌ Gagal load ${filename}`);
    return [];
  }
}

const teams = loadJSON("teams.json");
const standings = loadJSON("standings.json");
const schedule = loadJSON("schedule.json");
const teamsDetail = loadJSON("teams_detail.json");

/* =========================
   INTENT DETECTION
========================= */
function detectIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("jadwal")) return "schedule";
  if (t.includes("klasemen")) return "standings";
  if (t.includes("pemain") || t.includes("roster")) return "roster";
  if (t.includes("coach")) return "coach";

  return "general";
}

/* =========================
   HELPER
========================= */
function findTeam(text) {
  return teams.find(t =>
    (t.name || t.team || "")
      .toLowerCase()
      .includes(text.toLowerCase())
  );
}

/* =========================
   GROQ FALLBACK
========================= */
async function askGroq(prompt) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return res.data.choices[0].message.content;
}

/* =========================
   MAIN ROUTE
========================= */
router.post("/", async (req, res) => {
  try {
    const message = (req.body.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "Message kosong" });
    }

    const intent = detectIntent(message);

    /* ===== ROSTER ===== */
    if (intent === "roster") {
      const team = findTeam(message);
      if (team) {
        const detail = teamsDetail.find(t =>
          (t.team || "").toLowerCase().includes(team.name.toLowerCase())
        );

        if (detail?.players?.length) {
          const players = detail.players
            .map(p => `${p.name} (${p.role})`)
            .join(", ");

          return res.json({
            answer: `Roster ${team.name}: ${players}`,
          });
        }
      }
    }

    /* ===== COACH ===== */
    if (intent === "coach") {
      const team = findTeam(message);
      if (team) {
        const detail = teamsDetail.find(t =>
          (t.team || "").toLowerCase().includes(team.name.toLowerCase())
        );

        if (detail?.coach) {
          return res.json({
            answer: `Coach ${team.name} adalah ${detail.coach}`,
          });
        }
      }
    }

    /* ===== SCHEDULE ===== */
    if (intent === "schedule") {
      const team = findTeam(message);
      const list = team
        ? schedule.filter(m =>
            `${m.team1} ${m.team2}`
              .toLowerCase()
              .includes(team.name.toLowerCase())
          )
        : schedule.slice(0, 5);

      if (list.length) {
        return res.json({
          answer: list
            .map(m => `${m.team1} vs ${m.team2} — ${m.date || "TBA"}`)
            .join("\n"),
        });
      }
    }

    /* ===== STANDINGS ===== */
    if (intent === "standings" && standings.length) {
      return res.json({
        answer: standings
          .slice(0, 8)
          .map((t, i) => `${i + 1}. ${t.team} (${t.points} pts)`)
          .join("\n"),
      });
    }

    /* ===== GROQ FALLBACK ===== */
    const groqAnswer = await askGroq(
      `Kamu adalah chatbot resmi MPL Indonesia.
Jawab singkat dan sopan.

Pertanyaan:
${message}`
    );

    return res.json({ answer: groqAnswer });

  } catch (err) {
    console.error("❌ Chat error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Groq API error" });
  }
});

export default router;
