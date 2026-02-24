const fs = require('fs');
const cheerio = require('cheerio');

async function testEpisodes() {
    const url = 'https://anoboy.be/';
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Anoboy homepage has articles for latest episodes
    let animeUrl = '';
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        // Let's just find the first link that looks like an anime post
        if (href && href.includes('anoboy.be') && href.split('/').length > 3 && !href.includes('/category/') && !href.includes('/page/')) {
            if (!animeUrl) animeUrl = href;
        }
    });

    console.log("Found anime link to test:", animeUrl);
    
    if (!animeUrl) return;
    
    const epRes = await fetch(animeUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const epHtml = await epRes.text();
    fs.writeFileSync('anoboy_anime.html', epHtml);
    console.log("Saved raw HTML to anoboy_anime.html");
}

testEpisodes().catch(console.error);
