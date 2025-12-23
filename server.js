import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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
  res.status(200).send("OK");
});

// ==========================
// ROUTES
// ==========================
app.use("/api/chat", chatRoute);

// ==========================
// PORT (WAJIB DARI RAILWAY)
// ==========================
const PORT = process.env.PORT || 8080;

// 🔥 WAJIB bind ke 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API berjalan di port ${PORT}`);
});
