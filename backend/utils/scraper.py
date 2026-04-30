import asyncio
import logging
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

log = logging.getLogger("scraper")

CONCURRENCY = 5

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}

_SKIP_TAGS = {"script", "style", "nav", "footer", "header", "noscript", "svg"}

_DATE_ATTRS = {
    "article:published_time", "og:updated_time",
    "date", "pubdate", "publish-date", "datePublished",
}


class _Extractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self.date = ""
        self._depth = 0
        self._skip_depth: int | None = None

    def handle_starttag(self, tag, attrs):
        self._depth += 1
        if self._skip_depth is None and tag in _SKIP_TAGS:
            self._skip_depth = self._depth

        if tag == "meta":
            d = dict(attrs)
            key = d.get("property") or d.get("name") or d.get("itemprop") or ""
            if key in _DATE_ATTRS and not self.date:
                self.date = (d.get("content") or "")[:10]

    def handle_endtag(self, tag):
        if self._skip_depth is not None and self._depth == self._skip_depth:
            self._skip_depth = None
        self._depth -= 1

    def handle_data(self, data):
        if self._skip_depth is not None:
            return
        s = data.strip()
        if len(s) >= 15:
            self.parts.append(s)


async def _scrape_one(client: httpx.AsyncClient, url: str) -> dict:
    log.info(f"  Scraping: {url}")
    try:
        resp = await client.get(url, timeout=10, follow_redirects=True)
        resp.raise_for_status()
        ex = _Extractor()
        ex.feed(resp.text)
        text = "\n".join(ex.parts)[:9000]
        log.info(f"  OK ({len(text)} chars, date={ex.date or 'unknown'}): {url}")
        return {"text": text, "date": ex.date}
    except Exception as e:
        log.warning(f"  FAILED ({e}): {url}")
        return {"text": "", "date": ""}


async def scrape_urls(urls: list[str]) -> list[dict]:
    if not urls:
        return []

    results: list[dict] = [{"text": "", "date": ""}] * len(urls)
    sem = asyncio.Semaphore(CONCURRENCY)

    async def bounded(i: int, url: str) -> None:
        async with sem:
            results[i] = await _scrape_one(client, url)

    async with httpx.AsyncClient(headers=_HEADERS) as client:
        await asyncio.gather(*[bounded(i, url) for i, url in enumerate(urls)])

    return results
