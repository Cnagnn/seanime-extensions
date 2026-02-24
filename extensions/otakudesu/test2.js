const fs = require('fs');

const vfHtml = fs.readFileSync('vidhide.html', 'utf8');
console.log('Read file, length:', vfHtml.length);

const start = vfHtml.indexOf('eval(function(p,a,c,k,e,d)');
console.log('Start index:', start);
if (start !== -1) {
    const end = vfHtml.indexOf('</script>', start);
    const script = vfHtml.substring(start, end);
    console.log('Script length:', script.length);
    
    const packMatch = script.match(/return p}\('(.*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']+)'\.split\('\|'\)/s);
    if (packMatch) {
         const p = packMatch[1];
         const a = parseInt(packMatch[2]);
         const c = parseInt(packMatch[3]);
         const k = packMatch[4].split('|');
         console.log('Parsed a:', a, 'c:', c, 'k length:', k.length);
         let dict = {};
         for (let i = 0; i < c; i++) {
             dict[i.toString(a)] = k[i] || i.toString(a);
         }
         console.log('Dict size:', Object.keys(dict).length);
         const unpacked = p.replace(/\b\w+\b/g, function (e) {
             return dict[e] || e;
         });
         console.log('Unpacked length:', unpacked.length);
         fs.writeFileSync('unpacked.js', unpacked);
         
         const m3u8Match = unpacked.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/);
         if (m3u8Match) {
             console.log('Found m3u8:', m3u8Match[1]);
         } else {
             console.log('No m3u8 found');
         }
    } else {
         console.log('No packed script pattern match');
    }
} else {
    console.log('No eval found');
}
