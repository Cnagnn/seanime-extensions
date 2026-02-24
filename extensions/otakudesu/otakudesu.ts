/// <reference path="../nimegami/online-streaming-provider.d.ts" />
/// <reference path="../nimegami/core.d.ts" />
declare const CryptoJS: any;

class Provider {
    baseUrl = "https://otakudesu.best"

    getSettings(): Settings {
        return {
            episodeServers: ["Otakudesu"],
            supportsDub: false,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const url = `${this.baseUrl}/?s=${query}&post_type=anime`

        const res = await fetch(url)
        if (!res.ok) {
            console.error("Otakudesu search failed:", res.status, res.statusText)
            return []
        }

        const html = await res.text()
        const $ = LoadDoc(html)
        const results: SearchResult[] = []

        $("ul.chivsrc li").each((_, el) => {
            try {
                const titleEl = el.find("h2 a").first()
                if (!titleEl) return

                const title = titleEl.text().trim()
                const articleUrl = titleEl.attr("href") || ""
                if (!title || !articleUrl) return

                const slug = this.extractSlug(articleUrl, "anime")
                if (!slug) return

                results.push({
                    id: slug,
                    title: title,
                    url: articleUrl,
                    subOrDub: "sub",
                })
            } catch (e) {
                console.error("Error parsing search result:", e)
            }
        })

        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const url = `${this.baseUrl}/anime/${id}/`

        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`Failed to fetch anime page: ${res.status}`)
        }

        const html = await res.text()
        const $ = LoadDoc(html)
        const episodes: EpisodeDetails[] = []

        let epElements: any[] = []
        $(".episodelist ul li span a").each((_, el) => {
            epElements.push(el)
        })

        for (const el of epElements) {
            try {
                const epUrl = el.attr("href") || ""
                const epTitle = el.text().trim()

                if (!epUrl) continue
                // Skip non-episode links (batch, lengkap, etc.)
                if (!epUrl.includes("/episode/")) continue

                const epSlug = this.extractSlug(epUrl, "episode")
                if (!epSlug) continue

                let num = 0
                const numMatch = epTitle.match(/Episode\s+(\d+(?:\.\d+)?)/i)
                if (numMatch && numMatch[1]) {
                    num = parseFloat(numMatch[1])
                } else {
                    const match2 = epTitle.match(/(\d+(?:\.\d+)?)/)
                    if (match2 && match2[1]) {
                        num = parseFloat(match2[1])
                    }
                }

                if (num === 0) continue

                episodes.push({
                    id: `${id}$${epSlug}`,
                    number: num,
                    url: epUrl,
                    title: epTitle
                })
            } catch (e) {
                console.error("Error parsing episode:", e)
            }
        }

        episodes.sort((a, b) => a.number - b.number)

        if (episodes.length === 0) {
            throw new Error("No episodes found.")
        }

        return episodes
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const result: EpisodeServer = {
            server: "Otakudesu",
            headers: {},
            videoSources: [],
        }

        const res = await fetch(episode.url)
        if (!res.ok) {
            throw new Error(`Failed to fetch episode page: ${res.status}`)
        }

        const html = await res.text()

        // 1. Find Action strings
        const actionNonceMatch = html.match(/data:\s*{\s*action\s*:\s*["']([a-f0-9]+)["']\s*}/)
        const actionIframeMatch = html.match(/nonce:\s*[a-zA-Z0-9_]+,\s*action\s*:\s*["']([a-f0-9]+)["']/)

        if (!actionNonceMatch || !actionIframeMatch) {
            throw new Error("Could not find AJAX action strings")
        }
        const actionNonce = actionNonceMatch[1]
        const actionIframe = actionIframeMatch[1]

        // 2. Find VidHide mirror data-content
        let selectedDataContent = ""
        const items = html.match(/<a href="#" data-content="([^"]+)">([^<]+)<\/a>/g)
        if (items) {
            for (const item of items) {
                const m = item.match(/data-content="([^"]+)">([^<]+)</)
                if (m && m[2].toLowerCase().includes('vidhide')) {
                    selectedDataContent = m[1]
                    break
                }
            }
        }

        // If VidHide not found, return empty or throw error
        if (!selectedDataContent) {
            throw new Error("No VidHide mirror found for this episode")
        }

        // 3. Decode JSON payload
        let decodedPayload: any = {}
        try {
            const decoded = CryptoJS.enc.Base64.parse(selectedDataContent)
            const decodedStr = CryptoJS.enc.Utf8.stringify(decoded)
            decodedPayload = JSON.parse(decodedStr)
        } catch (e) {
            throw new Error("Failed to decode data-content base64")
        }

        // 4. AJAX Step 1 - Get Nonce
        const formData1 = new URLSearchParams()
        formData1.append("action", actionNonce)

        let ajaxRes = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
            method: "POST",
            body: formData1.toString(),
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        })
        if (!ajaxRes.ok) throw new Error("AJAX Step 1 failed")

        const ajaxData1 = await ajaxRes.json()
        const nonce = ajaxData1?.data
        if (!nonce) throw new Error("Failed to obtain nonce")

        // 5. AJAX Step 2 - Get Iframe Base64
        const formData2 = new URLSearchParams()
        formData2.append("id", String(decodedPayload.id || ""))
        formData2.append("i", String(decodedPayload.i || ""))
        formData2.append("q", String(decodedPayload.q || ""))
        formData2.append("nonce", nonce)
        formData2.append("action", actionIframe)

        ajaxRes = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
            method: "POST",
            body: formData2.toString(),
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        })
        if (!ajaxRes.ok) throw new Error("AJAX Step 2 failed")

        const ajaxData2 = await ajaxRes.json()
        if (!ajaxData2?.data) throw new Error("Failed to obtain iframe payload")

        // 6. Decode Iframe Payload
        let iframeHtml = ""
        try {
            const decoded = CryptoJS.enc.Base64.parse(ajaxData2.data)
            iframeHtml = CryptoJS.enc.Utf8.stringify(decoded)
        } catch (e) {
            throw new Error("Failed to decode iframe base64")
        }

        // 7. Extract Iframe SRC
        const srcMatch = iframeHtml.match(/src="([^"]+)"/)
        if (!srcMatch) throw new Error("No src in iframe HTML")
        const iframeUrl = srcMatch[1]

        // 8. Fetch VidHide iframe html
        const vfRes = await fetch(iframeUrl)
        if (!vfRes.ok) throw new Error("Failed to fetch VidHide iframe")
        const vfHtml = await vfRes.text()

        // 9. Unpack and extract M3U8
        const m3u8Url = this.extractVidHideSource(vfHtml)
        if (!m3u8Url) throw new Error("Failed to extract m3u8 from VidHide")

        result.videoSources.push({
            url: m3u8Url,
            type: "m3u8",
            quality: decodedPayload.q || "auto",
            subtitles: []
        })

        return result
    }

    private extractVidHideSource(html: string): string {
        try {
            const packMatch = html.match(/return p}\('(.*?)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']+)'\.split\('\|'\)/s)
            if (!packMatch) return ""

            const p = packMatch[1]
            const a = parseInt(packMatch[2], 10)
            const c = parseInt(packMatch[3], 10)
            const k = packMatch[4].split('|')

            const dict = new Map<string, string>()
            for (let i = 0; i < c; i++) {
                dict.set(i.toString(a), k[i] || i.toString(a))
            }

            const unpacked = p.replace(/\b\w+\b/g, (e) => {
                return dict.has(e) ? dict.get(e)! : e
            })

            const m3u8Match = unpacked.match(/["']([^"']+\.m3u8[^"']*)["']/i)
            if (m3u8Match) {
                return m3u8Match[1]
            }
        } catch (e) {
            console.error("VidHide extraction error:", e)
        }
        return ""
    }

    private extractSlug(url: string, type: string): string {
        try {
            let cleaned = url.replace(/\/+$/, "")
            const parts = cleaned.split("/")
            const idx = parts.indexOf(type)
            if (idx !== -1 && idx + 1 < parts.length) {
                return parts[idx + 1]
            }
            return parts[parts.length - 1] || ""
        } catch (e) {
            return ""
        }
    }
}
