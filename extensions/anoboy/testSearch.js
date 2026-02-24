const cheerio = require('cheerio');
const fs = require('fs');

async function testSearch(query) {
    const url = `https://anoboy.be/?s=${encodeURIComponent(query)}`;
    console.log(`Fetching ${url}...`);
    
    // Add User-Agent just in case
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        }
    });
    const html = await res.text();
    fs.writeFileSync('anoboy_search.html', html);
    console.log("Saved raw HTML to anoboy_search.html");

    const $ = cheerio.load(html);
    
    const results = [];
    
    // Anoboy search results usually use:
    // div.column-content a[rel="bookmark"]
    // or div.amv a
    $('.column-content a[title]').each((_, el) => {
        const title = $(el).attr('title');
        const link = $(el).attr('href');
        if (title && link && !results.find(r => r.link === link)) {
            results.push({ title, link });
        }
    });

    if (results.length === 0) {
        $('.amv a').each((_, el) => {
            const title = $(el).attr('title');
            const link = $(el).attr('href');
            if (title && link && !results.find(r => r.link === link)) {
                results.push({ title, link });
            }
        });
    }

    console.log(`Found ${results.length} results.`);
    console.dir(results.slice(0, 5), { depth: null });
}

testSearch("naruto").catch(console.error);
