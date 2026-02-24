// Debug: try the exact same flow as the jQuery script
async function test() {
    // Step 1: Get nonce
    console.log("=== Getting nonce ===");
    const form1 = new URLSearchParams();
    form1.append("action", "aa1208d27f29ca340c92c66d1926f13f");
    
    let res = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
        method: "POST",
        body: form1.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    console.log("Nonce status:", res.status);
    const d1 = await res.json();
    const nonce = d1.data;
    console.log("Nonce value:", nonce);

    // Step 2: Try iframe with exact data from jQuery
    // jQuery does: data:{...e, nonce:a, action:"2a3505c93b0035d3f455df82bf976b84"}
    // where e = {id:132480, i:0, q:"480p"}
    // jQuery serializes this to: id=132480&i=0&q=480p&nonce=xxx&action=2a3505c93b0035d3f455df82bf976b84
    
    console.log("\n=== Try 1: URLSearchParams ===");
    const form2 = new URLSearchParams();
    form2.append("id", "132480");
    form2.append("i", "0");
    form2.append("q", "480p");
    form2.append("nonce", nonce);
    form2.append("action", "2a3505c93b0035d3f455df82bf976b84");
    console.log("Body:", form2.toString());
    
    res = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
        method: "POST",
        body: form2.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    console.log("Status:", res.status);
    const text2 = await res.text();
    console.log("Response:", text2.substring(0, 200));

    // Try with different Content-Type or FormData
    console.log("\n=== Try 2: Manual body string ===");
    const bodyStr = `id=132480&i=0&q=480p&nonce=${nonce}&action=2a3505c93b0035d3f455df82bf976b84`;
    console.log("Body:", bodyStr);
    
    res = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
        method: "POST",
        body: bodyStr,
        headers: { 
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://otakudesu.best",
            "Referer": "https://otakudesu.best/episode/msg-twfm-episode-1-sub-indo/",
            "X-Requested-With": "XMLHttpRequest"
        }
    });
    console.log("Status:", res.status);
    const text3 = await res.text();
    console.log("Response:", text3.substring(0, 300));
}

test().catch(e => console.error("Error:", e.message));
