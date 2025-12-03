import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const filePath = path.join(process.cwd(), "backend", "data", "teams_detail.json");
const roster = JSON.parse(fs.readFileSync(filePath));

router.get("/", (req, res) => {
    res.json(roster);
});

router.get("/:teamName", (req, res) => {
    const name = req.params.teamName.toLowerCase();

    const team = roster.find(t => t.team.toLowerCase().includes(name));

    if (!team) {
        return res.status(404).json({ error: "Roster tim tidak ditemukan" });
    }

    res.json(team);
});

export default router;
