const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('anoboy_s.html', 'utf8');
const $ = cheerio.load(html);

const results = [];
$('.home_index a').each((_, el) => {
    let href = $(el).attr('href');
    let title = $(el).attr('title') || $(el).find('h3').text().trim();
    if (!title && $(el).find('img').length) title = $(el).find('img').attr('alt') || $(el).find('img').attr('title');
    
    if (href && href.startsWith('https://anoboy.be/') && href.length > 25) {
        if (!title) title = $(el).text().trim();
        
        if (title && title.length > 5 && !results.find(r => r.href === href)) {
            results.push({ title, href });
        }
    }
});

if (results.length === 0) {
    $('h3 a').each((_, el) => {
        let href = $(el).attr('href');
        let title = $(el).text().trim() || $(el).attr('title');
        if (href && href.startsWith('https://anoboy.be/') && title) {
            results.push({ title, href });
        }
    });
}

console.log(results.slice(0, 10));
