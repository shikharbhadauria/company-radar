import asyncio
import logging
from urllib.parse import urlparse
from playwright.async_api import async_playwright

log = logging.getLogger("scraper")

CONCURRENCY = 1

# Sites that need JS rendering time — use networkidle + extra wait
REVIEW_DOMAINS = {
    "glassdoor.com", "glassdoor.co.in",
    "ambitionbox.com",
    "reddit.com",
    "linkedin.com",
    "levels.fyi",
}


def _is_review_domain(url: str) -> bool:
    try:
        domain = urlparse(url).netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return any(domain == d or domain.endswith("." + d) for d in REVIEW_DOMAINS)
    except Exception:
        return False


_DATE_META_JS = """
() => {
    const selectors = [
        'meta[property="article:published_time"]',
        'meta[property="og:updated_time"]',
        'meta[name="date"]',
        'meta[name="pubdate"]',
        'meta[name="publish-date"]',
        'meta[itemprop="datePublished"]',
        'time[datetime]',
    ];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
            const val = el.getAttribute('content') || el.getAttribute('datetime') || '';
            if (val) return val.slice(0, 10);
        }
    }
    return '';
}
"""


async def _scrape_one(page, url: str) -> dict:
    log.info(f"  Scraping: {url}")
    is_review = _is_review_domain(url)
    try:
        await page.goto(
            url,
            timeout=15000 if is_review else 8000,
            wait_until="networkidle" if is_review else "domcontentloaded",
        )

        if is_review:
            await page.wait_for_timeout(2000)

        text = await page.evaluate("document.body.innerText")
        date = await page.evaluate(_DATE_META_JS)

        lines = text.split("\n")
        cleaned = [line.strip() for line in lines if len(line.strip()) >= 15]
        result = "\n".join(cleaned)[:9000]
        log.info(f"  OK ({len(result)} chars, date={date or 'unknown'}): {url}")
        return {"text": result, "date": date}
    except Exception as e:
        log.warning(f"  FAILED ({e}): {url}")
        return {"text": "", "date": ""}


async def scrape_urls(urls: list[str]) -> list[dict]:
    if not urls:
        return []

    results: list[dict] = [{"text": "", "date": ""}] * len(urls)
    sem = asyncio.Semaphore(CONCURRENCY)

    async def bounded(i, url):
        async with sem:
            page = await context.new_page()
            results[i] = await _scrape_one(page, url)
            await page.close()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--single-process",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-IN",
            extra_http_headers={
                "Accept-Language": "en-IN,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        await asyncio.gather(*[bounded(i, url) for i, url in enumerate(urls)])
        await browser.close()

    return results
