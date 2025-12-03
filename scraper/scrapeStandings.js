import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

const url = "https://id-mpl.com";

async function scrapeStandings() {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const standings = [];

        // Selector tabel standings di homepage
        $("table tbody tr").each((i, el) => {
            const rank = $(el).find("td").eq(0).text().trim();
            const team = $(el).find("td").eq(1).text().trim();
            const matchPoint = $(el).find("td").eq(2).text().trim();
            const matchWL = $(el).find("td").eq(3).text().trim();
            const netGameWin = $(el).find("td").eq(4).text().trim();
            const gameWL = $(el).find("td").eq(5).text().trim();

            if (team) {
                standings.push({
                    rank,
                    team,
                    matchPoint,
                    matchWL,
                    netGameWin,
                    gameWL
                });
            }
        });

        const filePath = path.join("data", "standings.json");
        fs.writeFileSync(filePath, JSON.stringify(standings, null, 2));

        console.log("✅ Berhasil scrape standings dari homepage!");

    } catch (error) {
        console.error("❌ Gagal scrape standings:", error.message);
    }
}

scrapeStandings();
