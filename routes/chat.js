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
// LOAD JSON
// ==========================
function loadJSON(filename) {
  try {
    const filePath = path.join(__dirname, "..", "data", filename);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
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

// ==========================
// GEMINI SETUP (MODEL VALID)
// ==========================
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY tidak ditemukan");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
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
function findTeam(text) {
  return teams.find((t) =>
    (t.name || t.team || "").toLowerCase().includes(text.toLowerCase())
  );
}

// ==========================
// PROMPT MINIMAL
// ==========================
function buildPrompt(intent, question) {
  let data = [];

  if (intent === "standings") data = standings.slice(0, 8);
  if (intent === "schedule") data = schedule.slice(0, 20);
  if (intent === "general")
    data = teams.map((t) => t.name || t.team).slice(0, 30);

  return `
Kamu adalah asisten MPL Indonesia.
Gunakan DATA jika relevan dan jangan mengarang.

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

  // ===== ROSTER (LOCAL) =====
  if (intent === "roster") {
    const team = findTeam(message);
    const roster = teamsDetail.find((t) =>
      (t.team || "").toLowerCase().includes(team?.name?.toLowerCase())
    );

    if (roster?.players?.length) {
      const players = roster.players
        .map((p) => `${p.name} (${p.role || "-"})`)
        .join(", ");

      return res.json({ answer: `Roster ${team.name}: ${players}` });
    }
  }

  // ===== SCHEDULE (LOCAL) =====
  if (intent === "schedule") {
    const team = findTeam(message);
    if (team) {
      const list = schedule.filter((m) =>
        `${m.team1} ${m.team2}`.toLowerCase().includes(team.name.toLowerCase())
      );

      if (list.length) {
        const txt = list
          .map((m) => `${m.team1} vs ${m.team2} — ${m.date || "TBA"}`)
          .join("\n");

        return res.json({ answer: txt });
      }
    }
  }

  // ===== GEMINI =====
  try {
    const prompt = buildPrompt(intent, message);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.json({ answer: text });

  } catch (err) {
    console.error("❌ Gemini error:", err.message);

    if (err.message.includes("429")) {
      return res.status(429).json({ error: "Kuota Gemini habis" });
    }

    return res.status(500).json({ error: "Kesalahan Gemini" });
  }
});

export default router;
