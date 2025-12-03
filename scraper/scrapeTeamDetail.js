import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

async function scrapeTeamDetail() {
    // ====== BACA teams.json ======
    const teamsPath = path.join("data", "teams.json");
    const teamsList = JSON.parse(fs.readFileSync(teamsPath));

    if (!teamsList || teamsList.length === 0) {
        console.log("❌ teams.json kosong! Jalankan dulu: npm run scrape:teams");
        return;
    }

    console.log(`📌 Jumlah tim: ${teamsList.length}`);

    // ====== MULAI PUPPETEER ======
    const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox"]
    });
    const page = await browser.newPage();

    const finalData = [];

    for (const team of teamsList) {
        console.log(`\n🔥 SCRAPING ROSTER: ${team.name}`);
        console.log(`🔗 ${team.link}`);

        await page.goto(team.link, { waitUntil: "networkidle2", timeout: 0 });

        try {
            await page.waitForSelector(".player-name", { timeout: 5000 });
        } catch (e) {
            console.log(`⚠ Tidak ada player ditemukan untuk tim ${team.name}`);
            continue;
        }

        const roster = await page.evaluate(() => {
            const list = [];

            document.querySelectorAll(".col-md-3.col-6").forEach(el => {
                const name = el.querySelector(".player-name")?.innerText?.trim() || "";
                const role = el.querySelector(".player-role")?.innerText?.trim() || "";
                const image = el.querySelector(".player-image-bg img")?.src || "";

                if (name) {
                    list.push({ name, role, image });
                }
            });

            const teamFullName = document.querySelector("h1, h2, h3")?.innerText?.trim() || "";

            return { team: teamFullName, players: list };
        });

        finalData.push(roster);

        console.log(`✔ Berhasil ambil ${roster.players.length} pemain dari ${team.name}`);
    }

    await browser.close();

    // SIMPAN HASIL
    const outputPath = path.join("data", "teams_detail.json");
    fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2));

    console.log("\n🎉 BERHASIL scrape roster semua tim MPL!");
}

scrapeTeamDetail();
