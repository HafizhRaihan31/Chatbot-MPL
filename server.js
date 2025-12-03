import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";  // <-- Tambahkan CORS
import { fileURLToPath } from "url";
import chatRoute from "./routes/chat.js";

dotenv.config(); // WAJIB agar GEMINI_API_KEY terbaca

const app = express();
const PORT = process.env.PORT || 3000;

// ENABLE CORS ===========================
app.use(cors({ origin: "*" }));  
// bisa juga: origin: ["http://localhost:5500", "https://domainmu.com"]

// Middleware JSON
app.use(express.json());

// Fix dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper JSON reader
const readJSON = (filename) => {
  try {
    const filePath = path.join(__dirname, "data", filename);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`❌ Gagal membaca file ${filename}`, err);
    return null;
  }
};

// API ROUTES =============================

app.get("/", (req, res) => {
  res.send("MPL Chatbot API is running on Railway 🚀");
});

app.get("/api/schedule", (req, res) => {
  const data = readJSON("schedule.json");
  if (!data) return res.status(404).json({ error: "schedule.json not found" });
  res.json(data);
});

app.get("/api/standings", (req, res) => {
  const data = readJSON("standings.json");
  if (!data) return res.status(404).json({ error: "standings.json not found" });
  res.json(data);
});

app.get("/api/teams", (req, res) => {
  const data = readJSON("teams.json");
  if (!data) return res.status(404).json({ error: "teams.json not found" });
  res.json(data);
});

app.get("/api/teams-detail", (req, res) => {
  const data = readJSON("teams_detail.json");
  if (!data) return res.status(404).json({ error: "teams_detail.json not found" });
  res.json(data);
});

// CHATBOT ROUTE
app.use("/api/chat", chatRoute);

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 API berjalan di port ${PORT}`);
});
