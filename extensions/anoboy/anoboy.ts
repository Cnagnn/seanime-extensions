/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {
    baseUrl = "https://anoboy.be"

    getSettings(): Settings {
        return {
            episodeServers: ["default"],
            supportsDub: false,
        }
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const url = `${this.baseUrl}/search/${query}/`

        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                "Referer": this.baseUrl,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
            }
        })
        if (!res.ok) {
            console.error("Anoboy search failed:", res.status, res.statusText)
            return []
        }

        const html = await res.text()
        const results: SearchResult[] = []
        const foundUrls = new Set<string>()

        // Use regex to locate all links that contain the query
        // This bypasses the need for accurate CSS selectors which frequently change or break via Cheerio
        const aTagRegex = /<a[^>]+href=["'](https:\/\/anoboy\.be\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
        let match

        const qLower = opts.query.toLowerCase()

        while ((match = aTagRegex.exec(html)) !== null) {
            const href = match[1]
            const innerHtml = match[2]

            // Skip categories, tags, authors, pagination
            if (href.includes("/category/") || href.includes("/genre/") || href.includes("/author/") || href.includes("/page/")) {
                continue
            }

            // Must look like an anime link
            if (href.length < 25) continue

            // Try to extract title from text or title attribute
            let titleStr = innerHtml.replace(/<[^>]+>/g, "").trim()

            const titleAttrMatch = match[0].match(/title=["']([^"']+)["']/i)
            if (titleAttrMatch) {
                titleStr = titleAttrMatch[1]
            }

            if (!titleStr) continue

            // Filter titles that actually contain the query or "episode" to ensure it's a post
            const tLower = titleStr.toLowerCase()
            if (tLower.includes(qLower) || tLower.includes("episode") || href.includes(qLower.replace(/\s+/g, '-'))) {
                if (!foundUrls.has(href)) {
                    const slug = this.extractSlug(href)
                    if (slug && slug.length > 3) {
                        foundUrls.add(href)
                        results.push({
                            id: slug,
                            title: titleStr,
                            url: href,
                            subOrDub: "sub",
                        })
                    }
                }
            }
        }

        return results
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const url = `${this.baseUrl}/${id}/`

        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`Failed to fetch anime page: ${res.status}`)
        }

        const html = await res.text()
        const $ = LoadDoc(html)
        const episodes: EpisodeDetails[] = []

        const foundUrls = new Set<string>()

        // Check common Anoboy episode list structures
        $(".eplister li a, .eplist li a, .episodelist li a").each((_: any, el: any) => {
            try {
                const text = el.text().trim()
                const epUrl = el.attr("href") || ""
                if (!epUrl || foundUrls.has(epUrl)) return

                let num = this.extractEpisodeNumber(text)
                if (num === 0) return

                foundUrls.add(epUrl)
                episodes.push({
                    id: `${id}$${num}`,
                    number: num,
                    url: epUrl,
                    title: `Episode ${num}`,
                })
            } catch (e) { }
        })

        // Fallback: check all links that might be episodes
        if (episodes.length === 0) {
            $("a").each((_: any, el: any) => {
                try {
                    const text = el.text().trim().toLowerCase()
                    const epUrl = el.attr("href") || ""
                    if (!epUrl || !epUrl.includes("anoboy")) return
                    if (foundUrls.has(epUrl)) return

                    if (text.includes("episode") || text.includes("ep ")) {
                        let num = this.extractEpisodeNumber(text)
                        if (num > 0) {
                            foundUrls.add(epUrl)
                            episodes.push({
                                id: `${id}$${num}`,
                                number: num,
                                url: epUrl,
                                title: `Episode ${num}`,
                            })
                        }
                    }
                } catch (e) { }
            })
        }

        episodes.sort((a, b) => a.number - b.number)

        const uniqueEpisodes: EpisodeDetails[] = []
        const seenNumbers = new Set<number>()
        for (const ep of episodes) {
            if (!seenNumbers.has(ep.number)) {
                seenNumbers.add(ep.number)
                uniqueEpisodes.push(ep)
            }
        }

        if (uniqueEpisodes.length === 0) {
            throw new Error("No episodes found.")
        }

        return uniqueEpisodes
    }

    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const parts = episode.id.split("$")
        const animeSlug = parts[0]
        const episodeNumber = parts[1] // Can be used if needed

        const url = episode.url

        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`Failed to fetch episode page: ${res.status}`)
        }

        const html = await res.text()
        const $ = LoadDoc(html)

        const result: EpisodeServer = {
            server: "default",
            headers: {},
            videoSources: [],
        }

        // Iframes are often directly in the HTML but hidden or loaded inside a container
        // We will try to find any Blogger or MP4 iframe
        const iframes: string[] = []

        // Sometimes cheerio gets `<iframe` via raw HTML match
        const htmlStr = $.html() || ""
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi
        let match
        while ((match = iframeRegex.exec(htmlStr)) !== null) {
            iframes.push(match[1])
        }

        if (iframes.length > 0) {
            for (const iframeUrl of iframes) {
                if (iframeUrl.includes("blogger.com") || iframeUrl.includes("mp4upload.com") || iframeUrl.includes("yandex.") || iframeUrl.includes("sibnet.")) {
                    result.videoSources.push({
                        url: iframeUrl,
                        type: "unknown",
                        quality: "auto",
                        subtitles: [],
                    })
                }
            }
        }

        return result
    }

    private extractSlug(url: string): string {
        try {
            let cleaned = url.replace(/\/+$/, "")
            const parts = cleaned.split("/")
            return parts[parts.length - 1] || ""
        } catch (e) {
            return ""
        }
    }

    private extractEpisodeNumber(text: string): number {
        const match = text.match(/episode\s+(\d+(?:\.\d+)?)/i) || text.match(/ep\s*(\d+(?:\.\d+)?)/i)
        if (match && match[1]) {
            return Math.floor(parseFloat(match[1]))
        }

        const strictMatch = text.match(/^(\d+(?:\.\d+)?)$/)
        if (strictMatch && strictMatch[1]) {
            return Math.floor(parseFloat(strictMatch[1]))
        }

        return 0
    }
}
