/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {

    baseUrl = "https://nimegami.id"

    getSettings(): Settings {
        return {
            episodeServers: ["berkasdrive"],
            supportsDub: false,
        }
    }

    /**
     * Search for anime on nimegami.id
     * Uses WordPress standard search: GET /?s={query}
     */
    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const url = `${this.baseUrl}/?s=${query}`

        const res = await fetch(url)
        if (!res.ok) {
            console.error("Nimegami search failed:", res.status, res.statusText)
            return []
        }

        const html = res.text()
        const $ = LoadDoc(html)
        const results: SearchResult[] = []

        $("article").each((_, el) => {
            try {
                // Title and URL from h2[itemprop="name"] > a
                const titleEl = el.find("h2 a").first()
                const title = titleEl.text().trim()
                const articleUrl = titleEl.attr("href") || ""

                if (!title || !articleUrl) return

                // Extract the slug from the URL to use as ID
                // e.g. https://nimegami.id/tensei-shitara-slime-datta-ken-sub-indo-5/
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

    /**
     * Find all episodes for a given anime
     * The id is the anime page slug
     */
    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const url = `${this.baseUrl}/${id}/`

        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`Failed to fetch anime page: ${res.status}`)
        }

        const html = res.text()
        const $ = LoadDoc(html)
        const episodes: EpisodeDetails[] = []

        // Episodes are in li.select-eps inside div.list_eps_stream
        $("li.select-eps").each((_, el) => {
            try {
                const dataAttr = el.attr("data")
                if (!dataAttr) return

                // Extract episode number from id attribute (e.g., "play_eps_1")
                const epsId = el.attr("id") || ""
                let episodeNumber = 0

                if (epsId) {
                    const match = epsId.match(/play_eps_(\d+)/)
                    if (match && match[1]) {
                        episodeNumber = parseInt(match[1], 10)
                    }
                }

                // Fallback: try to extract from text
                if (episodeNumber === 0) {
                    const text = el.text().trim()
                    const numMatch = text.match(/(\d+)/)
                    if (numMatch && numMatch[1]) {
                        episodeNumber = parseInt(numMatch[1], 10)
                    }
                }

                if (episodeNumber === 0) return

                episodes.push({
                    id: `${id}$${episodeNumber}`,
                    number: episodeNumber,
                    url: url,
                    title: `Episode ${episodeNumber}`,
                })
            } catch (e) {
                console.error("Error parsing episode:", e)
            }
        })

        // Sort by episode number
        episodes.sort((a, b) => a.number - b.number)

        // Normalize episode numbers if they don't start from 1
        if (episodes.length > 0) {
            const lowest = episodes[0].number
            if (lowest > 1) {
                for (let i = 0; i < episodes.length; i++) {
                    episodes[i].number = episodes[i].number - lowest + 1
                }
            }
        }

        // Filter out decimal episode numbers
        const filtered = episodes.filter(ep => Number.isInteger(ep.number))

        if (filtered.length === 0) {
            throw new Error("No episodes found.")
        }

        return filtered
    }

    /**
     * Find episode server / streaming sources
     * Decodes the base64-encoded JSON from the episode's li.select-eps data attribute
     */
    async findEpisodeServer(episode: EpisodeDetails, _server: string): Promise<EpisodeServer> {
        const parts = episode.id.split("$")
        const animeSlug = parts[0]
        const episodeNumber = parseInt(parts[1], 10)

        const url = `${this.baseUrl}/${animeSlug}/`

        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`Failed to fetch anime page: ${res.status}`)
        }

        const html = res.text()
        const $ = LoadDoc(html)

        const result: EpisodeServer = {
            server: "berkasdrive",
            headers: {},
            videoSources: [],
        }

        // Find the matching episode li element
        const targetId = `play_eps_${episodeNumber}`
        let dataAttr = ""

        $("li.select-eps").each((_, el) => {
            const elId = el.attr("id") || ""
            if (elId === targetId) {
                dataAttr = el.attr("data") || ""
            }
        })

        // If not found by id, try by index (episode number - 1)
        if (!dataAttr) {
            const allEps = $("li.select-eps")
            const targetIndex = episodeNumber - 1
            allEps.each((i, el) => {
                if (i === targetIndex) {
                    dataAttr = el.attr("data") || ""
                }
            })
        }

        if (!dataAttr) {
            throw new Error(`Episode ${episodeNumber} not found on the page.`)
        }

        // Decode base64 data attribute
        let decodedJson = ""
        try {
            // Use CryptoJS for base64 decoding
            const decoded = CryptoJS.enc.Base64.parse(dataAttr)
            decodedJson = CryptoJS.enc.Utf8.stringify(decoded)
        } catch (e) {
            console.error("Failed to decode base64 data:", e)
            throw new Error("Failed to decode episode streaming data.")
        }

        if (!decodedJson) {
            throw new Error("Decoded episode data is empty.")
        }

        // Parse the JSON
        // Expected format: [{"format":"360p","url":["https://dl.berkasdrive.com/streaming/?id=..."]}, ...]
        let streamData: { format: string; url: string[] }[] = []
        try {
            streamData = JSON.parse(decodedJson) as { format: string; url: string[] }[]
        } catch (e) {
            console.error("Failed to parse episode JSON:", e, decodedJson)
            throw new Error("Failed to parse episode streaming data.")
        }

        // Build video sources from each resolution
        for (const entry of streamData) {
            if (!entry.url || entry.url.length === 0) continue

            for (let i = 0; i < entry.url.length; i++) {
                const streamUrl = entry.url[i]
                if (!streamUrl) continue

                const serverLabel = entry.url.length > 1 ? ` Server ${i + 1}` : ""
                const quality = `${entry.format}${serverLabel}`

                result.videoSources.push({
                    url: streamUrl,
                    type: "mp4",
                    quality: quality,
                    subtitles: [],
                })
            }
        }

        if (result.videoSources.length === 0) {
            throw new Error("No streaming sources found for this episode.")
        }

        return result
    }

    /**
     * Extract slug from a nimegami.id URL
     * e.g. "https://nimegami.id/tensei-shitara-slime-datta-ken-sub-indo-5/" -> "tensei-shitara-slime-datta-ken-sub-indo-5"
     */
    private extractSlug(url: string): string {
        try {
            // Remove trailing slash
            let cleaned = url.replace(/\/+$/, "")
            // Get the last path segment
            const parts = cleaned.split("/")
            return parts[parts.length - 1] || ""
        } catch (e) {
            return ""
        }
    }
}
