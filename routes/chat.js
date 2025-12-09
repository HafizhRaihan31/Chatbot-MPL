// routes/chat.js
import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

// Fix __dirname untuk folder routes/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper baca file JSON (tidak melempar exception, kembali array/object)
function loadJSON(filename) {
  try {
    const filePath = path.join(__dirname, "..", "data", filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Gagal load ${filename}:`, err.message);
    return null;
  }
}

// Memastikan schedule menjadi array yang bisa difilter
function normalizeSchedule(schedule) {
  if (!schedule) return [];
  if (Array.isArray(schedule)) return schedule;
  // kalau object dengan regular/playoffs
  if (schedule.regular && Array.isArray(schedule.regular)) return schedule.regular;
  if (schedule.playoffs && Array.isArray(schedule.playoffs)) return schedule.playoffs;
  // jika object lain, gabungkan semua array di dalamnya
  const merged = [];
  Object.values(schedule).forEach((v) => {
    if (Array.isArray(v)) merged.push(...v);
  });
  return merged;
}

// Ambil roster tim kalau ada (cari nama tim cocok)
function findTeamRoster(teamsDetail, teamName) {
  if (!teamsDetail) return null;
  // teamsDetail bisa jadi array atau object
  const list = Array.isArray(teamsDetail) ? teamsDetail : Object.values(teamsDetail);
  const t = list.find((x) => {
    const name = (x.team || x.name || "").toString().toLowerCase();
    return name === teamName.toLowerCase() || name.includes(teamName.toLowerCase());
  });
  return t || null;
}

// Ambil jadwal untuk team tertentu (filter by team name)
function findScheduleForTeam(scheduleArr, teamName) {
  if (!scheduleArr || !scheduleArr.length) return [];
  return scheduleArr.filter((m) => {
    try {
      const t1 = (m.team1 || m.home || "").toString().toLowerCase();
      const t2 = (m.team2 || m.away || "").toString().toLowerCase();
      return t1.includes(teamName.toLowerCase()) || t2.includes(teamName.toLowerCase());
    } catch {
      return false;
    }
  });
}

// Setup data (dimuat saat server start)
const teams = loadJSON("teams.json") || [];
const standings = loadJSON("standings.json") || [];
const scheduleRaw = loadJSON("schedule.json") || [];
const teamsDetail = loadJSON("teams_detail.json") || [];

const scheduleList = normalizeSchedule(scheduleRaw);

// Setup Gemini
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY tidak terdeteksi di environment");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Pilih model valid yang tersedia di project-mu
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite", // ganti kalau mau
});

// Simple intent matching (sederhana, untuk menghemat token)
function detectIntent(text) {
  const t = text.toLowerCase();
  if (t.includes("jadwal") || t.includes("hari") || t.includes("kapan")) return "schedule";
  if (t.includes("siapa") && (t.includes("pemain") || t.includes("roster") || t.includes("player"))) return "roster";
  if (t.includes("klasemen") || t.includes("standing") || t.includes("posisi")) return "standings";
  // fallback general
  return "general";
}

// Build a small context depending on intent (hemat token)
function buildContextForIntent(intent, question) {
  if (intent === "schedule") {
    // jika user menyebut tim, kirim data jadwal untuk tim itu saja
    const words = question.split(/\s+/).slice(0, 10).join(" ");
    return {
      instruction: "Jawab pertanyaan berdasar data jadwal berikut (hanya data relevan).",
      payload: scheduleList.slice(0, 80) // batas awal, jangan kirim terlalu besar
    };
  }

  if (intent === "roster") {
    // kita tidak tahu tim mana; jangan kirim semua roster — minta user sebutkan tim bila perlu
    return {
      instruction: "Jika user menyebut tim, berikan roster singkat. Jangan mengarang."
    };
  }

  if (intent === "standings") {
    return {
      instruction: "Gunakan data klasemen singkat berikut (top 8).",
      payload: Array.isArray(standings) ? standings.slice(0, 8) : []
    };
  }

  // general: kirim ringkasan tim (nama & singkatan), bukan seluruh dataset
  const shortTeams = Array.isArray(teams)
    ? teams.map((t) => ({ id: t.id || t.slug || "", name: t.name || t.team || "" })).slice(0, 50)
    : [];

  return {
    instruction: "Kamu adalah chatbot. Gunakan data ringkas tim di bawah ini jika relevan.",
    payload: shortTeams
  };
}

// Utility: make prompt text (ke model) — sangat ringkas
function buildPrompt(contextObj, question) {
  let prompt = contextObj.instruction || "";
  if (contextObj.payload) {
    prompt += "\n\nDATA_RELEVAN:\n" + JSON.stringify(contextObj.payload);
  }
  prompt += `\n\nPERTANYAAN: ${question}\nJawab ringkas dan to the point. Jika tidak ada data, katakan 'Data tidak tersedia'.`;
  return prompt;
}

router.post("/", async (req, res) => {
  const question = (req.body.question || req.body.message || "").toString().trim();

  if (!question) return res.status(400).json({ error: "Pertanyaan wajib diisi!" });

  // detect intent
  const intent = detectIntent(question);

  // if user asks roster & mentions team name, try return without calling Gemini first
  if (intent === "roster") {
    // try to extract simple team name from question (very naive)
    const possibleTeams = Array.isArray(teams) ? teams.map(t => (t.name||t.team||"").toString().toLowerCase()) : [];
    const foundTeam = possibleTeams.find(name => question.toLowerCase().includes(name));
    if (foundTeam) {
      // find roster detail
      const roster = findTeamRoster(teamsDetail, foundTeam);
      if (roster) {
        // return short roster immediately (no token used)
        const players = roster.players ? roster.players.map(p => `${p.name} (${p.role || p.position || "?"})`) : [];
        return res.json({ answer: `Roster ${roster.team || roster.name}: ${players.join(", ")}` });
      }
      // if not found, fall through to calling model but with hint
    } else {
      // ask user to specify team to save tokens
      return res.json({ answer: "Sebutkan timnya (mis. 'siapa roster EVOS') supaya saya bisa jawab tanpa memanggil API." });
    }
  }

  // Build context and prompt (hemat token)
  const ctx = buildContextForIntent(intent, question);
  const prompt = buildPrompt(ctx, question);

  try {
    // call model with compact payload
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      // max output tokens (jaga agar tidak boros). Sesuaikan menurut kebutuhan.
      candidateCount: 1
    });

    const text = result.response?.text?.() || "Maaf, tidak ada jawaban.";
    return res.json({ answer: text });

  } catch (err) {
    console.error("❌ Error Chatbot:", err);

    // tangani kuota / model tidak ada / 404 / 429
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("quota") || msg.includes("429") || msg.includes("too many")) {
      return res.status(429).json({ error: "Kuota API Gemini habis. Silakan coba beberapa saat lagi." });
    }
    if (msg.includes("404") || msg.includes("not found") || msg.includes("model")) {
      return res.status(400).json({ error: "Model Gemini tidak tersedia pada project ini. Periksa konfigurasi model." });
    }

    // fallback
    return res.status(500).json({ error: "Terjadi kesalahan server. Silakan coba lagi." });
  }
});

export default router;
