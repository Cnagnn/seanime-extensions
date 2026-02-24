const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('anoboy_s.html', 'utf8');
const $ = cheerio.load(html);

console.log("Looking for links containing 'naruto' (case insensitive):");
let foundCount = 0;
$('a').each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const title = ($(el).attr('title') || '').toLowerCase();
    const href = $(el).attr('href');
    
    // Anoboy URL format: https://anoboy.be/2023/10/naruto-shippuden-batch/ or https://anoboy.be/anime/naruto/
    if (href && href.startsWith('https://anoboy.be/') && href.length > 25) {
        if (text.includes('naruto') || title.includes('naruto')) {
            console.log(`Href: ${href}`);
            console.log(`Title: ${title}`);
            console.log(`Text: ${text}`);
            console.log(`Parent: ${$(el).parent().get(0).tagName}`);
            console.log(`Parent Class: ${$(el).parent().attr('class')}`);
            console.log('---');
            foundCount++;
        }
    }
});
console.log(`Found ${foundCount} matches.`);
