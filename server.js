import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRoute from "./routes/chat.js";

dotenv.config();

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// health check
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.use("/api/chat", chatRoute);

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API berjalan di port ${PORT}`);
});
