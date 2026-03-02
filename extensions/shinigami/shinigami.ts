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

        // Parse manga from search results
        // Look for links that match series pattern
        $("a[href*='/series/']").each((_: any, el: any) => {
            try {
                const href = el.attr("href") || ""
                if (!href.includes("/series/")) return

                // Extract series ID from URL
                const seriesMatch = href.match(/\/series\/([a-f0-9\-]+)\//i)
                if (!seriesMatch || !seriesMatch[1]) return

                const seriesId = seriesMatch[1]
                
                // Get title from text or find title in nearby elements
                let title = el.text().trim()
                if (!title) {
                    // Check if this link has an image or is wrapped in a parent with title
                    const parent = el.parent()
                    title = parent.find("h3, h2, h1, .title").first().text().trim()
                    if (!title) {
                        title = el.attr("title") || ""
                    }
                }

                if (!title || title.length < 2) return

                // Try to get cover image
                let image = ""
                const imgEl = el.find("img").first()
                if (imgEl.length > 0) {
                    image = imgEl.attr("src") || imgEl.attr("data-src") || ""
                }

                // Check if this result already exists
                const existingResult = results.find(r => r.id === seriesId)
                if (existingResult) return

                results.push({
                    id: seriesId,
                    title: title,
                    image: image,
                })
            } catch (e) {
                console.error("Error parsing search result:", e)
            }
        })

        // Fallback: if we didn't get good results, try parsing from the main search page
        if (results.length === 0) {
            const allSeriesUrl = `${this.api}/search`
            const allRes = await fetch(allSeriesUrl)
            if (allRes.ok) {
                const allHtml = await allRes.text()
                const all$ = LoadDoc(allHtml)
                
                all$("a[href*='/series/']").each((_: any, el: any) => {
                    try {
                        const href = el.attr("href") || ""
                        const seriesMatch = href.match(/\/series\/([a-f0-9\-]+)\//i)
                        if (!seriesMatch || !seriesMatch[1]) return

                        const seriesId = seriesMatch[1]
                        let title = el.text().trim()
                        
                        if (!title) {
                            const parent = el.parent()
                            title = parent.find("h3, h2, h1, .title").first().text().trim()
                        }

                        if (!title || title.length < 2) return
                        
                        // Filter based on search query
                        const queryLower = opts.query.toLowerCase()
                        const titleLower = title.toLowerCase()
                        if (!titleLower.includes(queryLower)) return

                        let image = ""
                        const imgEl = el.find("img").first()
                        if (imgEl.length > 0) {
                            image = imgEl.attr("src") || imgEl.attr("data-src") || ""
                        }

                        const existingResult = results.find(r => r.id === seriesId)
                        if (existingResult) return

                        results.push({
                            id: seriesId,
                            title: title,
                            image: image,
                        })
                    } catch (e) {
                        console.error("Error parsing fallback search result:", e)
                    }
                })
            }
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