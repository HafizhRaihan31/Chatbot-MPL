import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import chatRoute from "./routes/chat.js";

dotenv.config();

const app = express();

// ==========================
// MIDDLEWARE
// ==========================
app.use(cors({ origin: "*" }));
app.use(express.json());

// ==========================
// HEALTH CHECK (WAJIB RAILWAY)
// ==========================
app.get("/", (req, res) => {
  res.send("MPL Chatbot API is running 🚀");
});

// ==========================
// ROUTES
// ==========================
app.use("/api/chat", chatRoute);

// ==========================
// PORT (WAJIB DARI ENV)
// ==========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 API berjalan di port ${PORT}`);
});

// ==========================
// GRACEFUL SHUTDOWN (AMAN)
// ==========================
process.on("SIGTERM", () => {
  console.log("⛔ SIGTERM diterima, server dimatikan dengan aman");
  process.exit(0);
});
