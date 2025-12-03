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
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

router.post("/", async (req, res) => {
  const question = req.body.question || req.body.message; // FIX: support 2 nama field

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
      contents: [{
        role: "user",
        parts: [{ text: context + "\n\nPertanyaan: " + question }]
      }]
    });

    const text = result.response.text();

    res.json({ answer: text });

  } catch (err) {
    console.error("❌ Error Chatbot:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
