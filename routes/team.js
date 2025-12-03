import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const filePath = path.join(process.cwd(), "backend", "data", "teams.json");
const teams = JSON.parse(fs.readFileSync(filePath));

// Semua tim
router.get("/", (req, res) => {
    res.json(teams);
});

// Tim berdasarkan nama
router.get("/:name", (req, res) => {
    const name = req.params.name.toLowerCase();

    const team = teams.find(
        t => t.team?.toLowerCase() === name ||
        t.name?.toLowerCase() === name ||
        t.team_code?.toLowerCase() === name
    );

    if (!team) {
        return res.status(404).json({ error: "Tim tidak ditemukan" });
    }

    res.json(team);
});

export default router;
