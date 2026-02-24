async function test() {
    // Step 1: Get nonce
    const form1 = new URLSearchParams();
    form1.append("action", "aa1208d27f29ca340c92c66d1926f13f");
    
    let res = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
        method: "POST",
        body: form1.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    const d1 = await res.json();
    const nonce = d1.data;
    console.log("Nonce:", nonce);

    // Step 2: Get iframe for moedesu 480p mirror
    const form2 = new URLSearchParams();
    form2.append("id", "132480");
    form2.append("i", "0");
    form2.append("q", "480p");
    form2.append("nonce", nonce);
    form2.append("action", "2a3505c93b0035d3f455df82bf976b84");

    res = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
        method: "POST",
        body: form2.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    const d2 = await res.json();
    console.log("Response success:", d2.success);
    
    const iframeHtml = Buffer.from(d2.data, 'base64').toString('utf8');
    console.log("Iframe HTML:", iframeHtml);

    // Extract src from iframe
    const srcMatch = iframeHtml.match(/src="([^"]+)"/);
    if (srcMatch) { 
        console.log("\nIframe URL:", srcMatch[1]);
        
        // Fetch the iframe content
        const iframeRes = await fetch(srcMatch[1]);
        const iframeContent = await iframeRes.text();
        require('fs').writeFileSync('moedesu_iframe.html', iframeContent);
        console.log("Iframe content saved, length:", iframeContent.length);

        // Check for m3u8 or mp4
        const m3u8 = iframeContent.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
        const mp4 = iframeContent.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/);
        const file = iframeContent.match(/file:\s*["']([^"']+)["']/);
        const sources = iframeContent.match(/sources:\s*\[/);
        
        if (m3u8) console.log("Found M3U8:", m3u8[0]);
        if (mp4) console.log("Found MP4:", mp4[0]); 
        if (file) console.log("Found file:", file[1]);
        if (sources) console.log("Found sources block");
        
        // Check for packed script
        const packed = iframeContent.includes("return p}");
        console.log("Has packed script:", packed);
    }
}

test().catch(e => console.error("Error:", e.message));
