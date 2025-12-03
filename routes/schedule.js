import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const filePath = path.join(process.cwd(), "backend", "data", "schedule.json");
const schedule = JSON.parse(fs.readFileSync(filePath));

// Semua jadwal
router.get("/", (req, res) => {
    res.json(schedule);
});

// Jadwal regular
router.get("/regular", (req, res) => {
    res.json(schedule.regular || []);
});

// Jadwal playoffs
router.get("/playoffs", (req, res) => {
    res.json(schedule.playoffs || []);
});

// Jadwal berdasarkan tim
router.get("/team/:name", (req, res) => {
    const teamName = req.params.name.toLowerCase();

    const matches = {
        regular: schedule.regular?.filter(
            m => m.team1?.toLowerCase() === teamName || m.team2?.toLowerCase() === teamName
        ) || [],
        playoffs: schedule.playoffs?.filter(
            m => m.team1?.toLowerCase() === teamName || m.team2?.toLowerCase() === teamName
        ) || []
    };

    res.json(matches);
});

export default router;
