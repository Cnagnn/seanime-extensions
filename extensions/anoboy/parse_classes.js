const fs = require('fs');

const html = fs.readFileSync('anoboy_search.html', 'utf8');

// Find all unique class names to see what CSS classes Anoboy uses
const classRegex = /class=["']([^"']+)["']/g;
let match;
const classes = new Set();
while ((match = classRegex.exec(html)) !== null) {
    match[1].split(/\s+/).forEach(c => classes.add(c));
}

console.log("Found classes:");
console.log(Array.from(classes).filter(c => c.length > 3).slice(0, 50));
