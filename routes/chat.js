import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const router = Router();

// Load data JSON MPL
const teams = JSON.parse(fs.readFileSync("./data/teams.json"));
const standings = JSON.parse(fs.readFileSync("./data/standings.json"));
const schedule = JSON.parse(fs.readFileSync("./data/schedule.json"));
const teamsDetail = JSON.parse(fs.readFileSync("./data/teams_detail.json"));

// Setup Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

router.post("/", async (req, res) => {
  const { question } = req.body;

  if (!question) return res.status(400).json({ error: "Pertanyaan wajib diisi!" });

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
      Jika data tidak ada, jawab apa adanya dan jangan mengarang.
    `;

    const response = await model.generateContent(context + "\n\nPertanyaan: " + question);
    res.json({ answer: response.response.text() });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
