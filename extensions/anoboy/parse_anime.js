const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('anoboy_anime.html', 'utf8');
const $ = cheerio.load(html);

console.log("Looking for actual video players...");

// Check common video containers
const videos = [];
$('iframe, video').each((_, el) => {
    videos.push($(el).attr('src'));
});

// Anoboy sometimes has mirror buttons that load iframes via JS/AJAX
const buttons = [];
$('.mirror button, .vmiror a, a.mirror').each((_, el) => {
    buttons.push({
        text: $(el).text().trim(),
        dataVideo: $(el).attr('data-video'),
        href: $(el).attr('href')
    });
});

console.log("Videos:", videos);
console.log("Mirror buttons:", buttons);

// If no direct iframes, let's look for any script that contains "iframe" or player URLs
const scripts = [];
$('script').each((_, el) => {
    const text = $(el).html() || '';
    if (text.includes('iframe') || text.includes('jwplayer') || text.includes('player')) {
        scripts.push(text.substring(0, 100) + '...');
    }
});

console.log("Scripts with player info:", scripts);
