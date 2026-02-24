const fs = require('fs');
const cheerio = require('cheerio');

async function check() {
    const query = "naruto";
    // We will mimic exactly what a browser sends
    const url = `https://anoboy.be/?s=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
        }
    });
    
    const html = await res.text();
    fs.writeFileSync("anoboy_s_headers.html", html);
    
    if (html.includes("naruto")) {
        console.log("Success! Found naruto in HTML");
        
        const $ = cheerio.load(html);
        const articles = [];
        $('.column-content a[href], .amv a[href], .home_index a[href]').each((_, el) => {
            const title = $(el).attr('title') || $(el).text().trim() || $(el).find('h3').text().trim();
            const href = $(el).attr('href');
            if (title && href && href.includes('anoboy')) {
                articles.push({ title, href });
            }
        });
        
        console.log("Extracted items:", articles.length);
        console.dir(articles.slice(0, 5));
        
    } else {
        console.log("Still blocked or no results.");
    }
}
check();
