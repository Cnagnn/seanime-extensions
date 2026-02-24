const fs = require('fs');

const html = fs.readFileSync('anoboy_anime.html', 'utf8');

// Search for any URL that looks like a video or iframe src
const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
const urls = html.match(urlRegex) || [];

const videoUrls = urls.filter(u => 
    u.includes('youtube') || 
    u.includes('yandex') || 
    u.includes('mp4upload') || 
    u.includes('blogger') || 
    u.includes('anoboy.be/uploads') ||
    u.includes('video') ||
    u.includes('embed') ||
    u.includes('player')
);

console.log(`Found ${videoUrls.length} potential video URLs`);
console.dir(Array.from(new Set(videoUrls)).slice(0, 20), { depth: null });
