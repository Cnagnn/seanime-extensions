const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('anoboy_search.html', 'utf8');
const $ = cheerio.load(html);

console.log("Title:", $('title').text());

// Look for article elements or amv elements
const articles = $('article, .amv, .home_index, .column-content');
console.log(`Found ${articles.length} potential content containers`);

// The search results on Anoboy might be inside div.column-content 
const results = [];
$('.column-content a[href], .amv a[href]').each((i, el) => {
    const title = $(el).attr('title') || $(el).text().trim();
    const href = $(el).attr('href');
    if (title && href && href.includes('anoboy') && title.length > 5) {
        if (!results.find(r => r.href === href)) {
            results.push({ title, href });
        }
    }
});

console.log("Found links:");
console.dir(results.slice(0, 10), { depth: null });
