import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

// ==========================
// FIX __dirname
// ==========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================
// LOAD JSON FILE
// ==========================
function loadJSON(filename) {
  try {
    const filePath = path.join(__dirname, "..", "data", filename);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`❌ Gagal load ${filename}`);
    return [];
  }
}

const teams = loadJSON("teams.json");
const standings = loadJSON("standings.json");
const scheduleRaw = loadJSON("schedule.json");
const teamsDetail = loadJSON("teams_detail.json");

// Normalisasi schedule
const schedule = Array.isArray(scheduleRaw)
  ? scheduleRaw
  : Object.values(scheduleRaw || {}).flat();

// ==========================
// GEMINI SETUP (PALING STABIL)
// ==========================
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY tidak ditemukan di environment!");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔥 MODEL PALING AMAN (ANTI v1beta)
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
});

// ==========================
// INTENT DETECTION
// ==========================
function detectIntent(msg) {
  const t = msg.toLowerCase();
  if (t.includes("roster") || t.includes("pemain")) return "roster";
  if (t.includes("jadwal") || t.includes("kapan")) return "schedule";
  if (t.includes("klasemen")) return "standings";
  return "general";
}

// ==========================
// HELPER
// ==========================
function findTeamFromText(text) {
  return teams.find((t) =>
    (t.name || t.team || "").toLowerCase().includes(text.toLowerCase())
  );
}

// ==========================
// PROMPT BUILDER (HEMAT TOKEN)
// ==========================
function buildPrompt(intent, question) {
  let data = [];

  if (intent === "standings") data = standings.slice(0, 8);
  if (intent === "schedule") data = schedule.slice(0, 20);
  if (intent === "general") {
    data = teams.map((t) => t.name || t.team).slice(0, 30);
  }

  return `
Kamu adalah asisten resmi MPL Indonesia.
Gunakan DATA berikut jika relevan.
JANGAN mengarang informasi.

DATA:
${JSON.stringify(data)}

PERTANYAAN:
${question}

Jawab singkat, jelas, dan faktual.
`;
}

// ==========================
// MAIN ROUTE
// ==========================
router.post("/", async (req, res) => {
  const message = (req.body.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "Message tidak boleh kosong" });
  }

  const intent = detectIntent(message);

  // ===== ROSTER (LOCAL, TANPA GEMINI) =====
  if (intent === "roster") {
    const team = findTeamFromText(message);
    if (team) {
      const roster = teamsDetail.find((t) =>
        (t.team || "").toLowerCase().includes(team.name.toLowerCase())
      );

      if (roster?.players?.length) {
        const players = roster.players
          .map((p) => `${p.name} (${p.role || "-"})`)
          .join(", ");

        return res.json({
          answer: `Roster ${team.name}: ${players}`,
        });
      }
    }
  }

  // ===== SCHEDULE (LOCAL, TANPA GEMINI) =====
  if (intent === "schedule") {
    const team = findTeamFromText(message);
    if (team) {
      const list = schedule.filter((m) =>
        `${m.team1} ${m.team2}`.toLowerCase().includes(team.name.toLowerCase())
      );

      if (list.length) {
        const text = list
          .map(
            (m) =>
              `${m.team1} vs ${m.team2} — ${m.date || m.time || "TBA"}`
          )
          .join("\n");

        return res.json({ answer: text });
      }
    }
  }

  // ===== GEMINI (GENERAL / STANDINGS) =====
  try {
    const prompt = buildPrompt(intent, message);

    // 🔥 CARA PANGGIL PALING AMAN
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.json({ answer: text });

  } catch (err) {
    console.error("❌ Gemini error:", err.message);

    if (err.message.includes("429")) {
      return res.status(429).json({
        error: "Kuota Gemini habis, coba lagi nanti",
      });
    }

    return res.status(500).json({
      error: "Terjadi kesalahan pada Gemini",
    });
  }
});

export default router;
