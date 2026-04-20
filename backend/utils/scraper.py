import asyncio
import logging
from playwright.async_api import async_playwright

log = logging.getLogger("scraper")

CONCURRENCY = 3


async def _scrape_one(page, url: str) -> str:
    log.info(f"  Scraping: {url}")
    try:
        await page.goto(url, timeout=8000, wait_until="domcontentloaded")
        text = await page.evaluate("document.body.innerText")
        lines = text.split("\n")
        cleaned = [line.strip() for line in lines if len(line.strip()) >= 40]
        result = "\n".join(cleaned)[:6000]
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

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (compatible; research-bot/1.0)"
        )
        await asyncio.gather(*[bounded(i, url) for i, url in enumerate(urls)])
        await browser.close()

    return results
