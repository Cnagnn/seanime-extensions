/// <reference path="../manga-provider.d.ts" />
/// <reference path="../core.d.ts" />

class Provider {

    private api = "https://09.shinigami.asia"

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    /**
     * Search for manga on shinigami.asia
     * Uses the search page and scrapes results
     */
    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const query = encodeURIComponent(opts.query)
        const url = `${this.api}/search?q=${query}`

        const res = await fetch(url)
        if (!res.ok) {
            console.error("Shinigami search failed:", res.status, res.statusText)
            return []
        }

        const html = await res.text()
        const $ = LoadDoc(html)
        const results: SearchResult[] = []

        // Parse manga from search results - try multiple selectors
        // Look for common card/item patterns
        const searchSelectors = [
            ".manga-item", ".series-item", ".card", ".item", 
            "[class*='manga']", "[class*='series']", "[class*='card-']",
            "article", ".entry", ".post"
        ]

        let foundItems = false
        for (const selector of searchSelectors) {
            const items = $(selector)
            if (items.length > 0) {
                items.each((_: any, item: any) => {
                    try {
                        // Look for links within the item
                        const linkEl = $(item).find("a").first()
                        if (!linkEl.length) return

                        const href = linkEl.attr("href") || ""
                        if (!href || href.length < 5) return

                        // Extract series ID from URL - be more flexible
                        let seriesId = ""
                        const patterns = [
                            /\/series\/([a-f0-9\-]+)/i,
                            /\/manga\/([a-f0-9\-]+)/i,
                            /\/(\w+)\/([a-f0-9\-]+)/i,
                            /([a-f0-9\-]{8,})/i
                        ]

                        for (const pattern of patterns) {
                            const match = href.match(pattern)
                            if (match && match[1] && match[1].length > 5) {
                                seriesId = match[1]
                                break
                            }
                            if (match && match[2] && match[2].length > 5) {
                                seriesId = match[2]
                                break
                            }
                        }

                        if (!seriesId) return

                        // Get title from multiple possible sources
                        let title = ""
                        const titleSelectors = [
                            "h1", "h2", "h3", "h4", ".title", ".name", 
                            "[class*='title']", "[class*='name']", 
                            ".manga-title", ".series-title"
                        ]

                        for (const titleSel of titleSelectors) {
                            const titleEl = $(item).find(titleSel).first()
                            if (titleEl.length) {
                                title = titleEl.text().trim()
                                if (title && title.length > 0) break
                            }
                        }

                        // Fallback to link text
                        if (!title) {
                            title = linkEl.text().trim()
                        }

                        // Fallback to link title attribute
                        if (!title) {
                            title = linkEl.attr("title") || ""
                        }

                        if (!title || title.length < 2) return

                        // Get cover image
                        let image = ""
                        const imgEl = $(item).find("img").first()
                        if (imgEl.length > 0) {
                            image = imgEl.attr("src") || imgEl.attr("data-src") || 
                                   imgEl.attr("data-lazy") || imgEl.attr("data-original") || ""
                            
                            // Make image URL absolute
                            if (image && image.startsWith("/")) {
                                image = this.api + image
                            }
                        }

                        // Check if this result already exists
                        const existingResult = results.find(r => r.id === seriesId || r.title === title)
                        if (existingResult) return

                        results.push({
                            id: seriesId,
                            title: title,
                            image: image,
                        })

                        foundItems = true
                    } catch (e) {
                        console.error("Error parsing search result:", e)
                    }
                })

                if (foundItems && results.length > 0) break
            }
        }

        // If still no results, try a broader approach
        if (results.length === 0) {
            // Look for any links that might be manga series
            $("a").each((_: any, el: any) => {
                try {
                    const href = el.attr("href") || ""
                    if (!href || href.length < 10) return

                    // Check if URL looks like a manga/series page
                    if (href.includes("series") || href.includes("manga") || 
                        href.match(/[a-f0-9\-]{8,}/i)) {
                        
                        let seriesId = ""
                        const uuidMatch = href.match(/([a-f0-9\-]{8,})/i)
                        if (uuidMatch && uuidMatch[1]) {
                            seriesId = uuidMatch[1]
                        }

                        if (!seriesId) return

                        let title = el.text().trim() || el.attr("title") || ""
                        if (!title || title.length < 2) return

                        // Filter based on search query
                        const queryLower = opts.query.toLowerCase()
                        const titleLower = title.toLowerCase()
                        if (!titleLower.includes(queryLower)) return

                        const existingResult = results.find(r => r.id === seriesId)
                        if (existingResult) return

                        results.push({
                            id: seriesId,
                            title: title,
                            image: "",
                        })
                    }
                } catch (e) {
                    console.error("Error in fallback search:", e)
                }
            })
        }

        return results.slice(0, 20) // Limit to first 20 results
    }

    /**
     * Find all chapters for a given manga
     * The id is the manga series UUID
     */
    async findChapters(seriesId: string): Promise<ChapterDetails[]> {
        const url = `${this.api}/series/${seriesId}/`

        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`Failed to fetch manga page: ${res.status}`)
        }

        const html = await res.text()
        const $ = LoadDoc(html)
        const chapters: ChapterDetails[] = []

        // Look for chapter links
        $("a[href*='/chapter/']").each((index: any, el: any) => {
            try {
                const href = el.attr("href") || ""
                if (!href.includes("/chapter/")) return

                // Extract chapter ID from URL
                const chapterMatch = href.match(/\/chapter\/([a-f0-9\-]+)/i)
                if (!chapterMatch || !chapterMatch[1]) return

                const chapterId = chapterMatch[1]
                let title = el.text().trim()

                // Extract chapter number from title
                let chapterNumber = "0"
                const chapterMatch2 = title.match(/chapter\s+(\d+(?:\.\d+)?)/i)
                if (chapterMatch2 && chapterMatch2[1]) {
                    chapterNumber = chapterMatch2[1]
                }

                // If no title, try to construct one
                if (!title) {
                    title = `Chapter ${chapterNumber}`
                }

                // Check if we already have this chapter
                const existingChapter = chapters.find(c => c.id === chapterId)
                if (existingChapter) return

                chapters.push({
                    id: chapterId,
                    url: `${this.api}/chapter/${chapterId}`,
                    title: title,
                    chapter: chapterNumber,
                    index: chapters.length,
                    language: "id",
                })
            } catch (e) {
                console.error("Error parsing chapter:", e)
            }
        })

        // Sort chapters by chapter number
        chapters.sort((a, b) => {
            const numA = parseFloat(a.chapter) || 0
            const numB = parseFloat(b.chapter) || 0
            return numA - numB
        })

        // Update indices after sorting
        chapters.forEach((chapter, index) => {
            chapter.index = index
        })

        if (chapters.length === 0) {
            throw new Error("No chapters found.")
        }

        return chapters
    }

    /**
     * Find chapter pages based on the chapter ID
     * Returns the pages that should be loaded for reading
     */
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const url = `${this.api}/chapter/${chapterId}`

        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`Failed to fetch chapter page: ${res.status}`)
        }

        const html = await res.text()
        const $ = LoadDoc(html)
        const pages: ChapterPage[] = []

        // Look for manga page images
        $("img").each((index: any, el: any) => {
            try {
                let imgSrc = el.attr("src") || el.attr("data-src") || el.attr("data-lazy") || ""
                
                if (!imgSrc) return

                // Filter out non-manga images (ads, avatars, icons, etc.)
                if (imgSrc.includes("/icons/") || 
                    imgSrc.includes("/avatars/") ||
                    imgSrc.includes("/emotes/") ||
                    imgSrc.includes("profile") ||
                    imgSrc.includes("logo") ||
                    imgSrc.includes("ad") ||
                    imgSrc.includes("banner")) {
                    return
                }

                // Ensure absolute URL
                if (imgSrc.startsWith("/")) {
                    imgSrc = this.api + imgSrc
                } else if (!imgSrc.startsWith("http")) {
                    return
                }

                // Check for duplicate pages
                const existingPage = pages.find(p => p.url === imgSrc)
                if (existingPage) return

                pages.push({
                    url: imgSrc,
                    index: index,
                    headers: {
                        "Referer": `${this.api}/chapter/${chapterId}`,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                    },
                })
            } catch (e) {
                console.error("Error parsing manga page:", e)
            }
        })

        // Sort pages by index
        pages.sort((a, b) => a.index - b.index)

        // Update indices to be sequential starting from 0
        pages.forEach((page, index) => {
            page.index = index
        })

        if (pages.length === 0) {
            throw new Error("No manga pages found for this chapter.")
        }

        return pages
    }
}