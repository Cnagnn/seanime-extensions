const fs = require('fs');
const cheerio = require('cheerio');

async function testEpisodePage() {
    const epUrl = "https://anoboy.be/goumon-baito-kun-no-nichijou-episode-8-subtitle-indonesia/";
    console.log(`Fetching ${epUrl}...`);
    const res = await fetch(epUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();
    fs.writeFileSync('anoboy_ep.html', html);
    console.log("Saved raw HTML to anoboy_ep.html");

    const $ = cheerio.load(html);
    
    const iframes = [];
    $('iframe').each((_, el) => iframes.push($(el).attr('src')));
    
    const mirrors = [];
    $('.vmiror, .mirror, select.mirror option, .server option, .button-server, a.server').each((_, el) => {
        mirrors.push($(el).text().trim() + ' | ' + ($(el).attr('href') || $(el).attr('data-video')));
    });

    console.log("Iframes:", iframes);
    console.log("Mirrors:", mirrors);
}

testEpisodePage().catch(console.error);
