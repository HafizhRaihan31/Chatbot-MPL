import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

// Fix __dirname untuk folder routes/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper baca file JSON
function loadJSON(filename) {
  try {
    const filePath = path.join(__dirname, "..", "data", filename);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`❌ Gagal load ${filename}`, err);
    return [];
  }
}

// Load data MPL
const teams = loadJSON("teams.json");
const standings = loadJSON("standings.json");
const schedule = loadJSON("schedule.json");
const teamsDetail = loadJSON("teams_detail.json");

// Setup Gemini
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY tidak terdeteksi di Railway");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// MODEL (AMAN)
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite",
});

router.post("/", async (req, res) => {
  const question = req.body.question || req.body.message;

  if (!question)
    return res.status(400).json({ error: "Pertanyaan wajib diisi!" });

  try {
    const context = `
      Kamu adalah Chatbot MPL Indonesia.

      DATA TIM:
      ${JSON.stringify(teams)}

      DATA STANDINGS:
      ${JSON.stringify(standings)}

      DATA JADWAL:
      ${JSON.stringify(schedule)}

      DATA ROSTER:
      ${JSON.stringify(teamsDetail)}

      Jawab pertanyaan user berdasarkan data MPL di atas.
      Jika data tidak ada, jawab jujur tanpa mengarang.
    `;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: context + "\n\nPertanyaan: " + question }],
        },
      ],
    });

    const text = result.response.text();
    res.json({ answer: text });

  } catch (err) {
    console.error("❌ Error Chatbot:", err);

    // ERROR KUOTA HABIS (429)
    if (err.message.includes("429") || err.message.includes("quota")) {
      return res.status(429).json({
        error: "Kuota API Gemini habis. Coba lagi nanti."
      });
    }

    // MODEL TIDAK TERSEDIA / TIDAK AKTIF (404)
    if (err.message.includes("404") || err.message.includes("model")) {
      return res.status(400).json({
        error: "Model Gemini tidak tersedia atau belum diaktifkan."
      });
    }

    // ERROR SERVER UMUM
    return res.status(500).json({
      error: "Terjadi kesalahan server. Silakan coba lagi."
    });
  }
});

export default router;
