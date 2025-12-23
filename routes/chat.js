import { Router } from "express";
import axios from "axios";

const router = Router();

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent";

// ==========================
// MAIN CHAT ENDPOINT
// ==========================
router.post("/", async (req, res) => {
  const message = (req.body.message || "").trim();

  if (!message) {
    return res.status(400).json({ error: "Message tidak boleh kosong" });
  }

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: message }]
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    const text =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Maaf, tidak ada jawaban.";

    return res.json({ answer: text });

  } catch (err) {
    console.error("❌ Gemini REST error:", err.response?.data || err.message);

    return res.status(500).json({
      error: "Gagal mengambil respon dari Gemini"
    });
  }
});

export default router;
