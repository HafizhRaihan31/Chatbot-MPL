import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// LOAD JSON SEKALI SAJA (GRATIS, TANPA TOKEN)
function loadJSON(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", name), "utf8")
  );
}

const teams = loadJSON("teams.json");
const standings = loadJSON("standings.json");
const schedule = loadJSON("schedule.json");
const roster = loadJSON("teams_detail.json");

// SETUP GEMINI (HEMAT TOKEN)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });


// ------------------------------------------------------------------
// FUNGSI PENCARIAN DATA LOKAL (TANPA AI)
// ------------------------------------------------------------------

function findRoster(team) {
  const key = Object.keys(roster).find(t =>
    t.toLowerCase().includes(team.toLowerCase())
  );
  return key ? { team: key, players: roster[key] } : null;
}

function findSchedule(team) {
  return schedule.filter(
    m =>
      m.team1.toLowerCase().includes(team.toLowerCase()) ||
      m.team2.toLowerCase().includes(team.toLowerCase())
  );
}

function findStandings(team) {
  return standings.find(s =>
    s.team.toLowerCase().includes(team.toLowerCase())
  );
}


// ------------------------------------------------------------------
// ROUTE CHAT UTAMA (TOKENS SUPER HEMAT)
// ------------------------------------------------------------------
router.post("/", async (req, res) => {
  const q = (req.body.message || req.body.question || "").trim();

  if (!q)
    return res.status(400).json({ error: "Pertanyaan wajib diisi." });

  const lower = q.toLowerCase();


  // ================================================================
  // 1️⃣ PERTANYAAN ROSTER → JAWAB TANPA GEMINI
  // ================================================================
  if (lower.includes("roster") || lower.includes("pemain")) {
    const team = lower.replace("roster", "").replace("pemain", "").trim();
    const data = findRoster(team);

    if (data) {
      return res.json({
        answer: `Berikut roster ${data.team}:\n- ${data.players.join("\n- ")}`
      });
    }
  }


  // ================================================================
  // 2️⃣ PERTANYAAN JADWAL → JAWAB TANPA GEMINI
  // ================================================================
  if (lower.includes("jadwal") || lower.includes("kapan")) {
    const team = lower.replace("jadwal", "").replace("kapan main", "").trim();
    const matches = findSchedule(team);

    if (matches.length > 0) {
      return res.json({
        answer: matches
          .map(m => `${m.team1} vs ${m.team2} — ${m.date}`)
          .join("\n")
      });
    }
  }


  // ================================================================
  // 3️⃣ PERTANYAAN KLASEMEN → JAWAB TANPA GEMINI
  // ================================================================
  if (lower.includes("peringkat") || lower.includes("klasemen")) {
    const team = lower.replace("peringkat", "").replace("klasemen", "").trim();
    const row = findStandings(team);

    if (row) {
      return res.json({
        answer: `Peringkat ${row.team}: #${row.rank} (${row.wins}W - ${row.losses}L)`
      });
    }
  }


  // ================================================================
  // 4️⃣ SEMUA PERTANYAAN LAIN → BARU PAKAI GEMINI (HEMAT TOKEN)
  // ================================================================
  try {
    const result = await model.generateContent(q);
    return res.json({ answer: result.response.text() });

  } catch (err) {
    console.error("❌ Gemini Error:", err);

    if (err.message.includes("429"))
      return res.status(429).json({
        error: "Batas kuota API Gemini habis. Coba lagi besok."
      });

    return res.status(500).json({
        error: "Terjadi kesalahan server. Silakan coba lagi."
    });
  }
});

export default router;
