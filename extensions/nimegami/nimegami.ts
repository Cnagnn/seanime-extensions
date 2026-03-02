/// <reference path="../online-streaming-provider.d.ts" />
/// <reference path="../core.d.ts" />

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

        const html = await res.text()
        const $ = LoadDoc(html)
        const results: SearchResult[] = []

        // Try multiple selectors for better compatibility
        const searchSelectors = [
            "article", ".entry", ".post", ".anime-item", ".item", 
            ".card", "[class*='post']", "[class*='entry']", "[class*='anime']"
        ]

        let foundItems = false
        for (const selector of searchSelectors) {
            const items = $(selector)
            if (items.length > 0) {
                items.each((_: any, el: any) => {
                    try {
                        // Try multiple ways to find title and link
                        let title = ""
                        let articleUrl = ""

                        // Method 1: h2 > a (original approach)
                        const titleEl = $(el).find("h2 a").first()
                        if (titleEl.length) {
                            title = titleEl.text().trim()
                            articleUrl = titleEl.attr("href") || ""
                        }

                        // Method 2: Any heading with link
                        if (!title || !articleUrl) {
                            const headings = $(el).find("h1 a, h2 a, h3 a, h4 a").first()
                            if (headings.length) {
                                title = headings.text().trim()
                                articleUrl = headings.attr("href") || ""
                            }
                        }

                        // Method 3: Any link with title-like class
                        if (!title || !articleUrl) {
                            const titleLink = $(el).find("a[class*='title'], a[class*='name']").first()
                            if (titleLink.length) {
                                title = titleLink.text().trim()
                                articleUrl = titleLink.attr("href") || ""
                            }
                        }

                        // Method 4: First link in the element
                        if (!title || !articleUrl) {
                            const firstLink = $(el).find("a").first()
                            if (firstLink.length) {
                                const linkText = firstLink.text().trim()
                                const linkHref = firstLink.attr("href") || ""
                                
                                // Only use if it looks like an anime title (not "Read More", etc.)
                                if (linkText && linkHref && linkText.length > 3 && 
                                    !linkText.toLowerCase().includes("read") && 
                                    !linkText.toLowerCase().includes("more") &&
                                    !linkText.toLowerCase().includes("continue")) {
                                    title = linkText
                                    articleUrl = linkHref
                                }
                            }
                        }

                        // Method 5: Look for title in element text or attributes
                        if (!title) {
                            const titleFromAttr = $(el).attr("title") || $(el).find("[title]").first().attr("title") || ""
                            if (titleFromAttr && titleFromAttr.trim().length > 3) {
                                title = titleFromAttr.trim()
                            }
                        }

                        if (!title || !articleUrl || title.length < 3) return

                        // Clean up title - remove common prefixes/suffixes
                        title = title.replace(/^(watch|nonton)\s+/i, "")
                        title = title.replace(/\s+(sub\s+indo?|subtitle\s+indonesia?)$/i, "")
                        title = title.trim()

                        if (title.length < 2) return

                        // Extract the slug from the URL to use as ID
                        const slug = this.extractSlug(articleUrl)
                        if (!slug || slug.length < 2) return

                        // Check for duplicates
                        const existingResult = results.find(r => r.id === slug || r.title === title)
                        if (existingResult) return

                        results.push({
                            id: slug,
                            title: title,
                            url: articleUrl,
                            subOrDub: "sub",
                        })

                        foundItems = true
                    } catch (e) {
                        console.error("Error parsing search result:", e)
                    }
                })

                if (foundItems && results.length > 0) break
            }
        }

        // Fallback: if no results found, try a broader search
        if (results.length === 0) {
            $("a").each((_: any, el: any) => {
                try {
                    const href = $(el).attr("href") || ""
                    const linkText = $(el).text().trim()

                    if (!href || !linkText || linkText.length < 3) return
                    if (href.indexOf(this.baseUrl) === -1 && !href.startsWith("/")) return

                    // Check if link text contains search query
                    const queryLower = opts.query.toLowerCase()
                    const textLower = linkText.toLowerCase()
                    if (!textLower.includes(queryLower)) return

                    // Skip common non-anime links
                    if (textLower.includes("home") || textLower.includes("about") ||
                        textLower.includes("contact") || textLower.includes("read more") ||
                        textLower.includes("continue") || textLower.includes("comment")) return

                    const slug = this.extractSlug(href)
                    if (!slug || slug.length < 2) return

                    const existingResult = results.find(r => r.id === slug)
                    if (existingResult) return

                    results.push({
                        id: slug,
                        title: linkText,
                        url: href.startsWith("http") ? href : this.baseUrl + href,
                        subOrDub: "sub",
                    })
                } catch (e) {
                    console.error("Error in fallback search:", e)
                }
            })
        }

        return results.slice(0, 15) // Limit results
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

        const html = await res.text()
        const $ = LoadDoc(html)
        const episodes: EpisodeDetails[] = []

        // Episodes are in li.select-eps inside div.list_eps_stream
        $("li.select-eps").each((_: any, el: any) => {
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

        const html = await res.text()
        const $ = LoadDoc(html)

        const result: EpisodeServer = {
            server: "berkasdrive",
            headers: {},
            videoSources: [],
        }

        // Find the matching episode li element
        const targetId = `play_eps_${episodeNumber}`
        let dataAttr = ""

        $("li.select-eps").each((_: any, el: any) => {
            const elId = el.attr("id") || ""
            if (elId === targetId) {
                dataAttr = el.attr("data") || ""
            }
        })

        // If not found by id, try by index (episode number - 1)
        if (!dataAttr) {
            const allEps = $("li.select-eps")
            const targetIndex = episodeNumber - 1
            allEps.each((i: any, el: any) => {
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
        // We need to fetch each berkasdrive streaming page to extract the direct mp4 URL
        for (const entry of streamData) {
            if (!entry.url || entry.url.length === 0) continue

            for (let i = 0; i < entry.url.length; i++) {
                const streamUrl = entry.url[i]
                if (!streamUrl) continue

                const serverLabel = entry.url.length > 1 ? ` Server ${i + 1}` : ""
                const quality = `${entry.format}${serverLabel}`

                // Fetch the berkasdrive streaming page and extract the direct mp4 URL
                const directUrl = await this.extractDirectVideoUrl(streamUrl)
                if (!directUrl) {
                    console.error(`Failed to extract direct URL for ${quality}:`, streamUrl)
                    continue
                }

                result.videoSources.push({
                    url: directUrl,
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
     * Fetch a berkasdrive streaming page and extract the direct mp4 URL
     * The streaming page uses a Plyr player with a <source> tag containing the actual mp4 URL
     */
    private async extractDirectVideoUrl(streamPageUrl: string): Promise<string> {
        try {
            const res = await fetch(streamPageUrl)
            if (!res.ok) {
                console.error("Failed to fetch streaming page:", res.status)
                return ""
            }

            const html = await res.text()
            const $ = LoadDoc(html)

            // Look for <source> element inside <video> tag
            let directUrl = ""

            $("video source").each((_: any, el: any) => {
                const src = el.attr("src") || ""
                if (src && (src.includes(".mp4") || src.includes("berkasdrive") || src.includes("miterequest"))) {
                    directUrl = src
                }
            })

            // Fallback: try to find the src attribute on the video element itself
            if (!directUrl) {
                $("video").each((_: any, el: any) => {
                    const src = el.attr("src") || ""
                    if (src && src.length > 0) {
                        directUrl = src
                    }
                })
            }

            // Fallback: look for mp4 URL in page source using regex
            if (!directUrl) {
                const mp4Match = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/i)
                if (mp4Match && mp4Match[0]) {
                    directUrl = mp4Match[0]
                }
            }

            return directUrl
        } catch (e) {
            console.error("Error extracting direct video URL:", e)
            return ""
        }
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
