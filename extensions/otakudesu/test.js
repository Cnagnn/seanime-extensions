const fs = require('fs');

async function testFetch() {
    try {
    let res = await fetch("https://otakudesu.best/?s=slime&post_type=anime");
    let html = await res.text();
    const animeMatch = html.match(/https:\/\/otakudesu\.best\/anime\/[^"']+/);
    if (!animeMatch) return console.log("No anime found");
    const animeUrl = animeMatch[0];
    
    res = await fetch(animeUrl);
    html = await res.text();
    const epMatch = html.match(/https:\/\/otakudesu\.best\/episode\/[^"']+/);
    if (!epMatch) return console.log("No episode found");
    const epUrl = epMatch[0];
    
    res = await fetch(epUrl);
    html = await res.text();
    
    let selectedDataContent = null;
    const items = html.match(/<a href="#" data-content="([^"]+)">([^<]+)<\/a>/g);
    if (items) {
        for (let item of items) {
            const m = item.match(/data-content="([^"]+)">([^<]+)</);
            if (m && m[2].toLowerCase().includes('vidhide')) {
                selectedDataContent = m[1];
                break;
            }
        }
    }
    
    if (!selectedDataContent) return console.log("No VidHide mirror found");
    const decoded = JSON.parse(Buffer.from(selectedDataContent, 'base64').toString('utf8'));
    console.log("Decoded data:", decoded);
    
    const actionNonceMatch = html.match(/data:\s*\{\s*action\s*:\s*["']([a-f0-9]+)["']\s*\}/);
    const actionIframeMatch = html.match(/nonce:\s*[a-zA-Z0-9_]+,\s*action\s*:\s*["']([a-f0-9]+)["']/);
    if (!actionNonceMatch || !actionIframeMatch) return console.log("Actions not found");
    const actionNonce = actionNonceMatch[1];
    const actionIframe = actionIframeMatch[1];
    
    let formData = new URLSearchParams();
    formData.append("action", actionNonce);
    let ajaxRes = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    let ajaxData = await ajaxRes.json();
    const nonce = ajaxData.data;
    
    formData = new URLSearchParams();
    formData.append("id", decoded.id);
    formData.append("i", decoded.i);
    formData.append("q", decoded.q);
    formData.append("nonce", nonce);
    formData.append("action", actionIframe);
    
    ajaxRes = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    ajaxData = await ajaxRes.json();
    const iframeHtml = Buffer.from(ajaxData.data, 'base64').toString('utf8');
    
    const srcMatch = iframeHtml.match(/src="([^"]+)"/);
    if (!srcMatch) return console.log("No src in iframe HTML");
    const iframeUrl = srcMatch[1];
    console.log("VidHide Iframe URL:", iframeUrl);
    
    const vfRes = await fetch(iframeUrl);
    const vfHtml = await vfRes.text();
    fs.writeFileSync('vidhide.html', vfHtml);
    console.log("VidHide HTML written");
    
    const packMatch = vfHtml.match(/eval\(function\(p,a,c,k,e,d\).*?return p}\('(.*?)',(\d+),(\d+),'([^']+)'.split\('\|'\)\)\)/);
    if (packMatch) {
         const p = packMatch[1];
         const a = parseInt(packMatch[2]);
         const c = parseInt(packMatch[3]);
         const k = packMatch[4].split('|');
         let unpacked = p;
         for (let i = c - 1; i >= 0; i--) {
             if (k[i]) {
                 unpacked = unpacked.replace(new RegExp('\\b' + i.toString(a) + '\\b', 'g'), k[i]);
             }
         }
         // console.log("Unpacked:", unpacked);
         
         const m3u8Match = unpacked.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/);
         if (m3u8Match) {
             console.log("Found m3u8 in unpacked:", m3u8Match[1]);
         } else {
             console.log("No m3u8 found in unpacked script.");
         }
    } else {
         console.log("No packed script found");
    }
    } catch (e) {
        fs.writeFileSync("error.log", e.stack || e.toString());
        console.error("Test Error:", e);
    }
}
testFetch();
