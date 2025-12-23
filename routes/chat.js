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
   LOAD JSON HELPER
========================= */
function loadJSON(filename) {
  try {
    const filePath = path.join(__dirname, "..", "data", filename);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`❌ Gagal load ${filename}`);
    return null;
  }
}

/* =========================
   LOAD DATA
========================= */
const teams = loadJSON("teams.json") || [];
const standings = loadJSON("standings.json") || [];
const teamsDetail = loadJSON("teams_detail.json") || [];

// 🔥 WAJIB NORMALISASI (ANTI slice error)
const scheduleRaw = loadJSON("schedule.json") || [];
const schedule = Array.isArray(scheduleRaw)
  ? scheduleRaw
  : Object.values(scheduleRaw).flat();

/* =========================
   INTENT DETECTION
========================= */
function detectIntent(text) {
  const t = text.toLowerCase();
  if (t.includes("jadwal")) return "schedule";
  if (t.includes("klasemen")) return "standings";
  if (t.includes("pemain") || t.includes("roster")) return "roster";
  return "general";
}

/* =========================
   TEAM MATCHER
========================= */
function findTeam(text) {
  const t = text.toLowerCase();
  return teams.find(team =>
    (team.name || team.team || "").toLowerCase().includes(t)
  );
}

/* =========================
   GROQ FALLBACK (STABIL)
========================= */
async function askGroq(prompt) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY belum diset");
  }

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah chatbot resmi MPL Indonesia. Jawab singkat, faktual, dan profesional."
        },
        { role: "user", content: prompt }
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

    /* ===== JADWAL (JSON ONLY) ===== */
    if (intent === "schedule") {
      if (!schedule.length) {
        return res.json({ answer: "Data jadwal belum tersedia." });
      }

      const list = schedule.slice(0, 5).map(
        m => `${m.team1} vs ${m.team2} — ${m.date || "TBA"}`
      );

      return res.json({ answer: list.join("\n") });
    }

    /* ===== KLASMEN (JSON ONLY) ===== */
    if (intent === "standings") {
      if (!standings.length) {
        return res.json({ answer: "Data klasemen belum tersedia." });
      }

      const list = standings.slice(0, 8).map(
        (t, i) => `${i + 1}. ${t.team} (${t.points || "-"})`
      );

      return res.json({ answer: list.join("\n") });
    }

    /* ===== ROSTER (JSON ONLY) ===== */
    if (intent === "roster") {
      const team = findTeam(message);
      if (!team) {
        return res.json({ answer: "Tim tidak ditemukan." });
      }

      const roster = teamsDetail.find(
        t =>
          (t.team || "").toLowerCase() === team.name.toLowerCase()
      );

      if (!roster || !roster.players?.length) {
        return res.json({ answer: `Roster ${team.name} belum tersedia.` });
      }

      const players = roster.players
        .map(p => `${p.name} (${p.role || "-"})`)
        .join(", ");

      return res.json({
        answer: `Roster ${team.name}: ${players}`
      });
    }

    /* ===== FALLBACK KE GROQ ===== */
    const aiAnswer = await askGroq(message);
    return res.json({ answer: aiAnswer });

  } catch (err) {
    console.error("❌ Chat error:", err.message);
    return res.status(500).json({
      error: "Internal Server Error"
    });
  }
});

export default router;
