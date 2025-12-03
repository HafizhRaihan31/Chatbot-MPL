import puppeteer from "puppeteer";
import fs from "fs";

(async () => {
    console.log("🚀 Mengambil data semua TIM MPL...");

    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto("https://id-mpl.com/teams", { waitUntil: "networkidle2" });

    // Ambil semua elemen team-card-outer
    const teams = await page.evaluate(() => {
        const items = [...document.querySelectorAll(".team-card-outer a")];

        return items.map(a => {
            const name = a.querySelector(".team-name-inner")?.innerText?.trim() || "";
            const logo = a.querySelector(".team-image img")?.src || "";
            const link = a.href;

            return { name, logo, link };
        });
    });

    console.log("📌 Jumlah tim ditemukan:", teams.length);
    console.log(teams);

    fs.writeFileSync("./data/teams.json", JSON.stringify(teams, null, 2));

    console.log("✅ BERHASIL scrape data TIM MPL!");
    await browser.close();
})();
