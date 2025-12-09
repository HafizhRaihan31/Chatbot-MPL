// routes/chat.js
import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

// Fix __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------
// LOAD JSON DATA
// -------------------------
function loadJSON(filename) {
  try {
    const filePath = path.join(__dirname, "..", "data", filename);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`❌ Gagal load ${filename}:`, err.message);
    return null;
  }
}

const teams = loadJSON("teams.json") || [];
const standings = loadJSON("standings.json") || [];
const schedule = loadJSON("schedule.json") || [];
const teamsDetail = loadJSON("teams_detail.json") || [];

// Normalisasi jadwal → array
function normalizeSchedule(data) {
  if (Array.isArray(data)) return data;
  if (!data) return [];
  const collected = [];
  Object.values(data).forEach((v) => {
    if (Array.isArray(v)) collected.push(...v);
  });
  return collected;
}

const scheduleList = normalizeSchedule(schedule);

// -------------------------
// GEMINI SETUP
// -------------------------
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY tidak ditemukan!");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model paling aman & hemat
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-8b",
});

// -------------------------
// INTENT DETECTION (SANGAT HEMAT TOKEN)
// -------------------------
function detectIntent(msg) {
  const t = msg.toLowerCase();
  if (t.includes("jadwal") || t.includes("main") || t.includes("kapan"))
    return "schedule";
  if (t.includes("pemain") || t.includes("roster"))
    return "roster";
  if (t.includes("klasemen") || t.includes("standing"))
    return "standings";
  return "general";
}

// -------------------------
// LOCAL ANSWER (TANPA GEMINI)
// -------------------------

// Cari roster
function findRoster(teamName) {
  const list = Array.isArray(teamsDetail) ? teamsDetail : Object.values(teamsDetail);
  return list.find((t) =>
    (t.team || t.name || "").toLowerCase().includes(teamName.toLowerCase())
  );
}

// Cari jadwal khusus tim
function findTeamSchedule(teamName) {
  return scheduleList.filter((m) => {
    const t1 = (m.team1 || m.home || "").toLowerCase();
    const t2 = (m.team2 || m.away || "").toLowerCase();
    return t1.includes(teamName.toLowerCase()) || t2.includes(teamName.toLowerCase());
  });
}

// -------------------------
// BUILD PROMPT (HEMAT TOKEN)
// -------------------------
function buildPrompt(intent, question) {
  let data = [];

  if (intent === "standings") {
    data = standings.slice(0, 8); // hanya top 8
  } else if (intent === "general") {
    data = teams.map((t) => ({
      name: t.name || t.team,
      short: t.slug || t.id,
    })).slice(0, 40);
  } else if (intent === "schedule") {
    data = scheduleList.slice(0, 30); // jadwal kecil saja
  }

  return `
Kamu adalah asisten MPL Indonesia. Gunakan DATA berikut jika relevan.
DATA:
${JSON.stringify(data)}

PERTANYAAN: ${question}
Jawab singkat, jelas, dan jangan mengarang.
  `;
}

// -------------------------
// MAIN API ROUTE
// -------------------------
router.post("/", async (req, res) => {
  const question = (req.body.message || req.body.question || "").trim();
  if (!question) return res.status(400).json({ error: "Pertanyaan wajib diisi!" });

  const intent = detectIntent(question);

  // -------------------------
  // 1. ROSTER — Jawab TANPA API
  // -------------------------
  if (intent === "roster") {
    const foundTeam = teams.find((t) =>
      question.toLowerCase().includes((t.name || t.team).toLowerCase())
    );

    if (!foundTeam) {
      return res.json({
        answer: "Sebutkan nama timnya, contoh: 'roster RRQ'.",
      });
    }

    const roster = findRoster(foundTeam.name);
    if (roster) {
      const players = roster.players
        ?.map((p) => `${p.name} (${p.role || p.position || "?"})`)
        .join(", ");

      return res.json({
        answer: `Berikut roster ${foundTeam.name}: ${players}`,
      });
    }
  }

  // -------------------------
  // 2. JADWAL — Jawab TANPA API
  // -------------------------
  if (intent === "schedule") {
    const foundTeam = teams.find((t) =>
      question.toLowerCase().includes((t.name || t.team).toLowerCase())
    );

    if (foundTeam) {
      const matches = findTeamSchedule(foundTeam.name);

      if (matches.length > 0) {
        const formatted = matches
          .map((m) => `${m.team1} vs ${m.team2} — ${m.date || m.time || "TBA"}`)
          .join("\n");

        return res.json({ answer: formatted });
      }
    }
  }

  // -------------------------
  // 3. BUTUH GEMINI → PROMPT MINIMAL
  // -------------------------
  const prompt = buildPrompt(intent, question);

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response?.text?.() || "Maaf, tidak ada jawaban.";

    res.json({ answer: text });

  } catch (err) {
    console.error("❌ Gemini error:", err);

    const msg = err.message.toLowerCase();

    if (msg.includes("quota") || msg.includes("429") || msg.includes("too many")) {
      return res.status(429).json({
        error: "Kuota API Gemini habis. Coba lagi nanti.",
      });
    }
    if (msg.includes("not found") || msg.includes("404")) {
      return res.status(400).json({
        error: "Model Gemini tidak tersedia pada project ini.",
      });
    }

    res.status(500).json({
      error: "Terjadi kesalahan server. Silakan coba lagi.",
    });
  }
});

export default router;
