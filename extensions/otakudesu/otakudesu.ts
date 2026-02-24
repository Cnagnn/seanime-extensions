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
        const dbg: string[] = []

        const res = await fetch(episode.url)
        if (!res.ok) {
            throw new Error(`Failed to fetch episode page: ${res.status}`)
        }

        const html = await res.text()
        dbg.push("html:" + html.length)

        // 1. Extract AJAX action strings from inline script
        const actionNonceMatch = html.match(/\{action:"([a-f0-9]{20,})"\}\}\)\.done\([^)]+\)=>\{window\.__x__nonce/)
        const actionIframeMatch = html.match(/action:"([a-f0-9]{20,})"\}\}\)\.done\([^)]+\)=>\{document/)

        if (!actionNonceMatch || !actionIframeMatch) {
            throw new Error("Could not find AJAX action strings")
        }
        const actionNonce = actionNonceMatch[1]
        const actionIframe = actionIframeMatch[1]
        dbg.push("actions:ok")

        // 2. Collect ALL mirrors with data-content
        const mirrorRegex = /data-content="([A-Za-z0-9+/=]+)"/g
        let mirrorMatch
        const mirrors: { dataContent: string, decoded: any }[] = []
        while ((mirrorMatch = mirrorRegex.exec(html)) !== null) {
            try {
                const decoded = CryptoJS.enc.Base64.parse(mirrorMatch[1])
                const decodedStr = CryptoJS.enc.Utf8.stringify(decoded)
                const payload = JSON.parse(decodedStr)
                mirrors.push({ dataContent: mirrorMatch[1], decoded: payload })
            } catch (e) {
                dbg.push("mirror-err:" + mirrorMatch[1].substring(0, 20))
            }
        }

        if (mirrors.length === 0) {
            throw new Error("No mirrors found. dbg=" + dbg.join("|"))
        }
        dbg.push("mirrors:" + mirrors.length)

        // 3. AJAX Step 1 - Get Nonce
        const formData1 = new URLSearchParams()
        formData1.append("action", actionNonce)

        const ajaxHeaders: any = {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest"
        }

        let ajaxRes = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
            method: "POST",
            body: formData1.toString(),
            headers: ajaxHeaders
        })
        if (!ajaxRes.ok) throw new Error("AJAX1 failed:" + ajaxRes.status)

        const ajaxData1 = await ajaxRes.json()
        const nonce = ajaxData1?.data
        if (!nonce) throw new Error("No nonce. dbg=" + dbg.join("|"))
        dbg.push("nonce:ok")

        // 4. Try each mirror to get a working video source
        const triedQualities = new Set<string>()

        for (const mirror of mirrors) {
            const q = mirror.decoded.q || "auto"
            if (triedQualities.has(q)) continue
            triedQualities.add(q)

            try {
                const formData2 = new URLSearchParams()
                formData2.append("id", String(mirror.decoded.id ?? ""))
                formData2.append("i", String(mirror.decoded.i ?? ""))
                formData2.append("q", String(mirror.decoded.q ?? ""))
                formData2.append("nonce", nonce)
                formData2.append("action", actionIframe)

                const ajaxRes2 = await fetch("https://otakudesu.best/wp-admin/admin-ajax.php", {
                    method: "POST",
                    body: formData2.toString(),
                    headers: ajaxHeaders
                })
                dbg.push("ajax2-" + q + ":" + ajaxRes2.status)
                if (!ajaxRes2.ok) continue

                const ajaxData2 = await ajaxRes2.json()
                if (!ajaxData2?.data) {
                    dbg.push("ajax2-nodata-" + q)
                    continue
                }
                dbg.push("ajax2-data:" + String(ajaxData2.data).length)

                // Decode iframe base64
                let iframeHtml = ""
                try {
                    const decoded = CryptoJS.enc.Base64.parse(ajaxData2.data)
                    iframeHtml = CryptoJS.enc.Utf8.stringify(decoded)
                    dbg.push("iframe-html:" + iframeHtml.length)
                } catch (e) {
                    dbg.push("b64-err")
                    continue
                }

                // Extract iframe src
                const srcMatch = iframeHtml.match(/src="([^"]+)"/)
                if (!srcMatch) {
                    dbg.push("no-src:" + iframeHtml.substring(0, 100))
                    continue
                }
                let iframeUrl = srcMatch[1]
                dbg.push("iframe-url:" + iframeUrl.substring(0, 60))

                // Fetch the iframe content
                const iframeRes = await fetch(iframeUrl)
                dbg.push("iframe-status:" + iframeRes.status)
                if (!iframeRes.ok) continue
                const iframeContent = await iframeRes.text()
                dbg.push("iframe-len:" + iframeContent.length)

                // Try to extract video URL from the iframe content
                let videoUrl = ""
                let videoType = "mp4"

                // Check for blogger.com video embed
                const bloggerMatch = iframeContent.match(/src="(https?:\/\/www\.blogger\.com\/video[^"]+)"/)
                if (bloggerMatch) {
                    videoUrl = bloggerMatch[1]
                    videoType = "video"
                    dbg.push("blogger:found")
                }

                // Check for direct m3u8/mp4 URLs
                if (!videoUrl) {
                    const m3u8Match = iframeContent.match(/["'](https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)["']/i)
                    if (m3u8Match) {
                        videoUrl = m3u8Match[1]
                        videoType = "m3u8"
                        dbg.push("m3u8:found")
                    }
                }

                if (!videoUrl) {
                    const mp4Match = iframeContent.match(/["'](https?:\/\/[^"'\s]+\.mp4[^"'\s]*)["']/i)
                    if (mp4Match) {
                        videoUrl = mp4Match[1]
                        videoType = "mp4"
                        dbg.push("mp4:found")
                    }
                }

                // Check for packed VidHide script
                if (!videoUrl) {
                    videoUrl = this.extractVidHideSource(iframeContent)
                    if (videoUrl) {
                        videoType = "m3u8"
                        dbg.push("vidhide:found")
                    }
                }

                // Fallback: use the desustream iframe URL directly
                if (!videoUrl) {
                    videoUrl = iframeUrl
                    videoType = "video"
                    dbg.push("fallback:iframe")
                }

                if (videoUrl) {
                    result.videoSources.push({
                        url: videoUrl,
                        type: videoType,
                        quality: q,
                        subtitles: []
                    })
                    dbg.push("pushed:" + q)
                }
            } catch (e: any) {
                dbg.push("catch:" + q + ":" + (e?.message || String(e)))
            }
        }

        if (result.videoSources.length === 0) {
            throw new Error("No sources. dbg=" + dbg.join("|"))
        }

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
