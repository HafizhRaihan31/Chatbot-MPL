import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

// Delay helper (pengganti waitForTimeout)
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractMatches(page, tabId) {
    console.log(`➡️ Membuka tab: ${tabId}`);

    // Klik tab menggunakan JS (karena ini jQuery UI tabs)
    await page.evaluate((id) => {
        document.querySelector(`a[href="#${id}"]`)?.click();
    }, tabId);

    await delay(1200); // delay agar konten tab benar-benar muncul

    return await page.evaluate((id) => {
        const tab = document.querySelector(`#${id}`);
        if (!tab) return [];

        const matchElements = tab.querySelectorAll(".match");
        const matches = [];

        matchElements.forEach(match => {
            const team1 = match.querySelector(".team1 .name")?.textContent.trim() || "";
            const team2 = match.querySelector(".team2 .name")?.textContent.trim() || "";
            const time = match.querySelector(".time .pt-1")?.textContent.trim() || "";
            const scoreL = match.querySelectorAll(".score")[0]?.textContent.trim() || "";
            const scoreR = match.querySelectorAll(".score")[1]?.textContent.trim() || "";
            const date = match.closest(".col-lg-4")?.querySelector(".match.date")?.textContent.trim() || "";

            matches.push({ date, team1, scoreL, scoreR, team2, time });
        });

        return matches;
    }, tabId);
}

async function scrapeSchedule() {
    console.log("📅 Mengambil jadwal MPL…");

    const browser = await puppeteer.launch({
        headless: false
    });

    const page = await browser.newPage();

    // gunakan file lokal debug
    const url = `file://${path.resolve("./schedule_page_debug_by_puppeteer.html")}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const regular = await extractMatches(page, "regular-season");
    const playoffs = await extractMatches(page, "playoffs");

    console.log("✔️ Regular Season:", regular.length, "match");
    console.log("✔️ Playoffs:", playoffs.length, "match");

    // Simpan ke JSON
    fs.writeFileSync(
        path.resolve("./data/schedule.json"),
        JSON.stringify({ regular, playoffs }, null, 2)
    );

    console.log("💾 Jadwal berhasil disimpan ke data/schedule.json");

    await browser.close();
}

scrapeSchedule();
