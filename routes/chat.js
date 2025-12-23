// routes/chat.js
import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

// =============================
// FIX __dirname
// =============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================
// LOAD JSON DATA
// =============================
function loadJSON(filename) {
  try {
    const filePath = path.join(__dirname, "..", "data", filename);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`❌ Gagal load ${filename}:`, err.message);
    return [];
  }
}

const teams = loadJSON("teams.json");
const standings = loadJSON("standings.json");
const scheduleRaw = loadJSON("schedule.json");
const teamsDetail = loadJSON("teams_detail.json");

// =============================
// NORMALISASI JADWAL
// =============================
function normalizeSchedule(data) {
  if (Array.isArray(data)) return data;
  if (!data) return [];
  return Object.values(data).flat();
}

const schedule = normalizeSchedule(scheduleRaw);

// =============================
// GEMINI SETUP (WAJIB VALID)
// =============================
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY TIDAK DITEMUKAN");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ⚠️ MODEL RESMI & AMAN
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

// =============================
// INTENT DETECTION (HEMAT TOKEN)
// =============================
function detectIntent(msg) {
  const t = msg.toLowerCase();
  if (t.includes("jadwal") || t.includes("kapan")) return "schedule";
  if (t.includes("roster") || t.includes("pemain")) return "roster";
  if (t.includes("klasemen")) return "standings";
  return "general";
}

// =============================
// DATA HELPER
// =============================
function findTeam(name) {
  return teams.find((t) =>
    (t.name || t.team || "").toLowerCase().includes(name.toLowerCase())
  );
}

function findRoster(teamName) {
  return teamsDetail.find((t) =>
    (t.team || t.name || "").toLowerCase().includes(teamName.toLowerCase())
  );
}

function findSchedule(teamName) {
  return schedule.filter((m) =>
    `${m.team1} ${m.team2}`.toLowerCase().includes(teamName.toLowerCase())
  );
}

// =============================
// PROMPT MINIMAL & AMAN
// =============================
function buildPrompt(intent, question) {
  let data = [];

  if (intent === "standings") data = standings.slice(0, 8);
  if (intent === "schedule") data = schedule.slice(0, 20);
  if (intent === "general")
    data = teams.map((t) => t.name || t.team).slice(0, 30);

  return `
Kamu adalah chatbot MPL Indonesia.
Gunakan DATA berikut bila relevan dan JANGAN mengarang.

DATA:
${JSON.stringify(data)}

PERTANYAAN:
${question}

Jawab singkat, jelas, faktual.
`;
}

// =============================
// MAIN ROUTE
// =============================
router.post("/", async (req, res) => {
  const question = (req.body.message || "").trim();
  if (!question) {
    return res.status(400).json({ error: "Pertanyaan tidak boleh kosong" });
  }

  const intent = detectIntent(question);

  // ===== ROSTER TANPA GEMINI =====
  if (intent === "roster") {
    const team = findTeam(question);
    if (!team) {
      return res.json({ answer: "Sebutkan nama timnya, contoh: roster RRQ" });
    }

    const roster = findRoster(team.name);
    if (roster?.players?.length) {
      const players = roster.players
        .map((p) => `${p.name} (${p.role || "-"})`)
        .join(", ");

      return res.json({ answer: `Roster ${team.name}: ${players}` });
    }
  }

  // ===== JADWAL TANPA GEMINI =====
  if (intent === "schedule") {
    const team = findTeam(question);
    if (team) {
      const list = findSchedule(team.name);
      if (list.length) {
        const txt = list
          .map((m) => `${m.team1} vs ${m.team2} — ${m.date || "TBA"}`)
          .join("\n");

        return res.json({ answer: txt });
      }
    }
  }

  // ===== GEMINI (GENERAL / STANDINGS) =====
  try {
    const prompt = buildPrompt(intent, question);

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.json({ answer: text });

  } catch (err) {
    console.error("❌ Gemini error:", err.message);

    if (err.message.includes("404")) {
      return res.status(500).json({
        error: "Model Gemini tidak tersedia (cek nama model).",
      });
    }

    if (err.message.includes("quota") || err.message.includes("429")) {
      return res.status(429).json({
        error: "Kuota Gemini habis. Coba lagi nanti.",
      });
    }

    return res.status(500).json({
      error: "Kesalahan server Gemini.",
    });
  }
});

export default router;
