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
        model: "llama3-8b-8192",
        messages: [
          {
            role: "system",
            content: "Kamu adalah asisten chatbot MPL Indonesia."
          },
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    const answer =
      response.data.choices?.[0]?.message?.content ||
      "Tidak ada jawaban.";

    res.json({ answer });

  } catch (err) {
    console.error("❌ GROQ error:", err.response?.data || err.message);
    res.status(500).json({ error: "Groq API error" });
  }
});

export default router;
