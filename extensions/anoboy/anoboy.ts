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
        const url = `${this.baseUrl}/?s=${query}`

        const res = await fetch(url)
        if (!res.ok) {
            console.error("Anoboy search failed:", res.status, res.statusText)
            return []
        }

        const html = await res.text()
        const $ = LoadDoc(html)
        const results: SearchResult[] = []

        // Parse results from div.column-content a or div.amv a
        $(".column-content a[href], .amv a[href]").each((_: any, el: any) => {
            try {
                const title = el.attr("title") || el.text().trim()
                const articleUrl = el.attr("href") || ""

                if (!title || !articleUrl) return
                if (!articleUrl.includes("anoboy")) return
                // Check if it's already in the results
                if (results.find(r => r.url === articleUrl)) return

                const slug = this.extractSlug(articleUrl)
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
