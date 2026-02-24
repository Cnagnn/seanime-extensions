const fs = require('fs');

const html = fs.readFileSync('anoboy_s.html', 'utf8');

const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
let match;
let found = 0;
while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2];
    if (href.includes('naruto') || text.toLowerCase().includes('naruto')) {
        console.log(`Match: ${href} | Text: ${text.replace(/<[^>]+>/g, '').trim().substring(0, 30)}`);
        found++;
    }
}

console.log(`Found ${found} matches.`);
