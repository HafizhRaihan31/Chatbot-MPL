import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chatRoute from "./routes/chat.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Fix path dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper untuk baca file JSON
const readJSON = (filename) => {
  const filePath = path.join(__dirname, "data", filename);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
};

// API routes ===========================
app.get("/", (req, res) => {
  res.send("MPL Chatbot API is running...");
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

// Jalankan API ==========================
app.listen(PORT, () => {
  console.log(`🚀 API berjalan di port ${PORT}`);
});

app.use(express.json());
app.use("/api/chat", chatRoute);