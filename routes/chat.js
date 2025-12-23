import { Router } from "express";
import axios from "axios";

const router = Router();
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

router.post("/", async (req, res) => {
  const message = (req.body.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "Message kosong" });
  }

  try {
    const response = await axios.post(
      GROQ_URL,
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
Kamu adalah chatbot resmi MPL Indonesia.
Jawab selalu dalam bahasa Indonesia.
Fokus pada topik MPL Indonesia:
- jadwal pertandingan
- klasemen
- tim dan roster
Jika pertanyaan di luar MPL, jawab singkat dan arahkan ke topik MPL.
`
          },
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.4
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    res.json({
      answer: response.data.choices[0].message.content
    });

  } catch (err) {
    console.error("❌ GROQ ERROR:", err.response?.data || err.message);
    res.status(500).json({
      error: "Groq API error"
    });
  }
});

export default router;
