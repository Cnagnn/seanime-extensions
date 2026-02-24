const fs = require('fs');
const html = fs.readFileSync('anoboy_ep.html', 'utf8');

// Find everything that looks like an iframe or video tag in the HTML text
const iframes = html.match(/<iframe[^>]+>/gi) || [];
const videos = html.match(/<video[^>]+>/gi) || [];
const objects = html.match(/<object[^>]+>/gi) || [];
const embeds = html.match(/<embed[^>]+>/gi) || [];

console.log("Iframes found:", iframes.length);
iframes.forEach(i => console.log(i));

console.log("\nVideos found:", videos.length);
videos.forEach(v => console.log(v));

console.log("\nObjects found:", objects.length);
console.log("\nEmbeds found:", embeds.length);

// Check if there are any base64 encoded strings that could be iframes
const encoded = html.match(/[A-Za-z0-9+/=]{100,}/g) || [];
console.log("\nPotential base64 strings (>100 chars):", encoded.length);

// Look for Anoboy's typical video variables (e.g., `let videoUrl = "..."`)
const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
console.log(`\nFound ${scriptMatches.length} script tags`);
let dataFound = false;
scriptMatches.forEach((s, idx) => {
    if (s.includes('iframe') || s.includes('mp4') || s.includes('m3u8') || s.includes('player') || s.includes('yandex') || s.includes('blogger')) {
        console.log(`Script ${idx} contains potential video data.`);
        console.log(s.substring(0, 200) + "...\n");
        dataFound = true;
    }
});
if (!dataFound) console.log("No scripts with obvious video data found.");
