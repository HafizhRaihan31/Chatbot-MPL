import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRoute from "./routes/chat.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// health check (Railway)
app.get("/", (req, res) => {
  res.send("OK");
});

app.use("/api/chat", chatRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 API berjalan di port", PORT);
});
