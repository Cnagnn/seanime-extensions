const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('anoboy_search.html', 'utf8');
const $ = cheerio.load(html);

console.log("Looking for ALL links with 'anime' or 'episode' in title text");
let count = 0;
$('a').each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const title = ($(el).attr('title') || '').toLowerCase();
    const href = $(el).attr('href');
    
    if (href && (text.includes('episode') || text.includes('anime') || title.includes('episode') || title.includes('anime'))) {
        console.log(`Href: ${href} | Text: ${text} | Title: ${title}`);
        count++;
    }
});

console.log(`Found ${count} links.`);
