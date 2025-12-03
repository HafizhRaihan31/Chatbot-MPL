import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

// Fix __dirname supaya bisa baca file di Railway
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper baca file JSON
function loadJSON(filename) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", filename), "utf-8")
  );
}

// Load data JSON MPL
const teams = loadJSON("teams.json");
const standings = loadJSON("standings.json");
const schedule = loadJSON("schedule.json");
const teamsDetail = loadJSON("teams_detail.json");

// Setup Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

router.post("/", async (req, res) => {
  const question = req.body.question || req.body.message; // <-- FIX penting

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
      Jika data tidak ada, jawab apa adanya, jangan mengarang.
    `;

    const response = await model.generateContent(
      context + "\n\nPERTANYAAN USER: " + question
    );

    res.json({ answer: response.response.text() });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
