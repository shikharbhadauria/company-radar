import asyncio
import logging
from urllib.parse import urlparse
from playwright.async_api import async_playwright

log = logging.getLogger("scraper")

CONCURRENCY = 3

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


async def _scrape_one(page, url: str) -> str:
    log.info(f"  Scraping: {url}")
    is_review = _is_review_domain(url)
    try:
        await page.goto(
            url,
            timeout=15000 if is_review else 8000,
            wait_until="networkidle" if is_review else "domcontentloaded",
        )

        if is_review:
            # Extra wait for lazy-loaded JS content (ratings, reviews, salaries)
            await page.wait_for_timeout(2000)

        text = await page.evaluate("document.body.innerText")
        lines = text.split("\n")
        # Lower threshold to 15 chars — captures short but valuable data like "3.2 ★" or "₹4.5L"
        cleaned = [line.strip() for line in lines if len(line.strip()) >= 15]
        result = "\n".join(cleaned)[:9000]
        log.info(f"  OK ({len(result)} chars): {url}")
        return result
    except Exception as e:
        log.warning(f"  FAILED ({e}): {url}")
        return ""


async def scrape_urls(urls: list[str]) -> list[str]:
    if not urls:
        return []

    results = [""] * len(urls)
    sem = asyncio.Semaphore(CONCURRENCY)

    async def bounded(i, url):
        async with sem:
            page = await context.new_page()
            results[i] = await _scrape_one(page, url)
            await page.close()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
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
