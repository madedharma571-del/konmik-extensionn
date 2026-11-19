// ID: ext_doujin_desu_xxx
// NAME: Doujin Desu (XXX)
// VERSION: 1.0.2
// COLOR: #3B82F6
// ICON: https://doujin.desu.xxx/favicon.ico
// REFERER: https://doujin.desu.xxx/

const BASE = 'https://doujin.desu.xxx';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': `${BASE}/`,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function fetchHtml(url) {
    try {
        const res = await fetch(url, { headers: DEFAULT_HEADERS });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} (${url})`);
        }
        return await res.text();
    } catch (err) {
        const detail = err && err.message ? err.message : String(err);
        throw new Error(`Fetch error: ${detail}`);
    }
}

function extractMatch(regex, str, defaultVal = '') {
    if (!str) return defaultVal;
    const m = str.match(regex);
    return m && m[1] !== undefined ? m[1].trim() : defaultVal;
}

function extractAll(regex, str) {
    if (!str) return [];
    const matches = [];
    const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
    const re = new RegExp(regex.source, flags);
    let m;
    while ((m = re.exec(str)) !== null) {
        matches.push(m);
        if (m.index === re.lastIndex) re.lastIndex++;
    }
    return matches;
}

function cleanHtmlText(raw) {
    if (!raw) return '';
    return raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toAbsoluteUrl(url) {
    if (!url) return '';
    const cleaned = url.replace(/&amp;/g, '&').trim();
    if (!cleaned) return '';
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
    if (cleaned.startsWith('//')) return 'https:' + cleaned;
    return BASE + (cleaned.startsWith('/') ? cleaned : '/' + cleaned);
}

function buildCatalogUrl(page, query) {
    const currentPage = Math.max(1, Number(page) || 1);
    const trimmedQuery = (query || '').trim();

    if (trimmedQuery) {
        return currentPage > 1
            ? `${BASE}/page/${currentPage}/?s=${encodeURIComponent(trimmedQuery)}`
            : `${BASE}/?s=${encodeURIComponent(trimmedQuery)}`;
    }

    return currentPage > 1 ? `${BASE}/page/${currentPage}/` : `${BASE}/`;
}

const KonmikExtension = {
    async getList(page, query, filters) {
        try {
            const url = buildCatalogUrl(page, query);
            const html = await fetchHtml(url);

            // Menangkap [1] link /manga/..., [2] cover src, [3] isi <h3> judul
            const cardRegex = /href="([^"]*\/manga\/[^"]+)"[^>]*>\s*<img[^>]*src="([^"]+)"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi;
            const matches = extractAll(cardRegex, html);

            const mangaList = [];
            const seen = new Set();

            for (const m of matches) {
                const detailUrl = toAbsoluteUrl(m[1]);
                const coverUrl = toAbsoluteUrl(m[2]);
                const title = cleanHtmlText(m[3]);

                if (!detailUrl || !title || seen.has(detailUrl)) continue;
                seen.add(detailUrl);

                mangaList.push({
                    id: detailUrl,
                    title,
                    cover_url: coverUrl,
                    rating: '-',
                    views: '-'
                });
            }

            return { manga_list: mangaList };
        } catch (err) {
            return { manga_list: [], error: err.message || String(err) };
        }
    },

    async getDetail(urlPath) {
        const detailUrl = toAbsoluteUrl(urlPath);
        const html = await fetchHtml(detailUrl);

        let title = extractMatch(/<meta\s+property="og:title"\s+content="([^"]+)"/i, html)
            || extractMatch(/<meta\s+content="([^"]+)"\s+property="og:title"/i, html)
            || extractMatch(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html, 'Unknown Title');

        title = cleanHtmlText(title)
            .replace(/^Baca\s+(?:Manga|Manhwa|Doujin|Komik)\s+/i, '')
            .replace(/\s*-\s*Doujindesu\.XXX$/i, '')
            .trim() || 'Unknown Title';

        const rawDesc = extractMatch(/<meta\s+property="og:description"\s+content="([^"]*)"/i, html)
            || extractMatch(/<meta\s+content="([^"]*)"\s+property="og:description"/i, html)
            || extractMatch(/<div[^>]*class="[^"]*(?:desc|sinopsis|summary)[^"]*"[^>]*>([\s\S]*?)<\/div>/i, html, 'Tidak ada deskripsi.');

        const description = cleanHtmlText(rawDesc) || 'Tidak ada deskripsi.';

        const rawCover = extractMatch(/<meta\s+property="og:image"\s+content="([^"]+)"/i, html)
            || extractMatch(/<meta\s+content="([^"]+)"\s+property="og:image"/i, html);
        const coverUrl = toAbsoluteUrl(rawCover);

        const chapters = [];
        const chapterRegex = /<a[^>]*href="([^"]*\/reader\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const chMatches = extractAll(chapterRegex, html);
        const seenCh = new Set();
        let idx = 1;

        for (const m of chMatches) {
            const chUrl = toAbsoluteUrl(m[1]);
            if (!chUrl || seenCh.has(chUrl)) continue;

            const label = cleanHtmlText(m[2]);
            const chTitle = label
                ? (/^\d+(\.\d+)?$/.test(label) ? `Chapter ${label}` : label)
                : `Chapter ${idx}`;

            seenCh.add(chUrl);
            chapters.push({
                id: chUrl,
                title: chTitle,
                date: '-'
            });
            idx++;
        }

        return {
            title,
            cover_url: coverUrl,
            description,
            rating: '-',
            views: '-',
            genres: [],
            author: 'Unknown',
            artist: 'Unknown',
            chapters
        };
    },

    async getChapterImages(viewerUrl) {
        const chUrl = toAbsoluteUrl(viewerUrl);
        const html = await fetchHtml(chUrl);

        // Prioritaskan gambar halaman komik (alt="Page ..." atau /uploads/)
        const pageImgRegex = /<img[^>]*\b(?:alt="Page\s*\d+"[^>]*(?:src|data-src|data-lazy-src)="([^"]+)"|(?:src|data-src|data-lazy-src)="([^"]*\/uploads\/[^"]+)")[^>]*>/gi;
        const pageMatches = extractAll(pageImgRegex, html);

        // Cadangan umum jika struktur halaman chapter tertentu tidak memakai /uploads/
        const fallbackImgRegex = /<img[^>]+(?:data-src|data-lazy-src|src)="([^"]+)"[^>]*>/gi;
        const matches = pageMatches.length > 0 ? pageMatches : extractAll(fallbackImgRegex, html);

        const images = [];
        const seenImg = new Set();

        for (const m of matches) {
            const rawUrl = m[1] || m[2] || '';
            const imgUrl = toAbsoluteUrl(rawUrl);
            if (!imgUrl || seenImg.has(imgUrl)) continue;

            if (/\/content\/banner\/|logo|icon|avatar|banner|favicon|flagcdn/i.test(imgUrl)) continue;

            seenImg.add(imgUrl);
            images.push(imgUrl);
        }

        return images;
    }
};
