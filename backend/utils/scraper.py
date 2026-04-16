import asyncio
from playwright.async_api import async_playwright


async def scrape_url(url: str) -> str:
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.goto(url, timeout=15000, wait_until="domcontentloaded")
            text = await page.evaluate("document.body.innerText")
            await browser.close()

            lines = text.split("\n")
            cleaned = [line.strip() for line in lines if len(line.strip()) >= 40]
            result = "\n".join(cleaned)
            return result[:8000]
    except Exception:
        return ""


async def scrape_urls(urls: list[str]) -> list[str]:
    tasks = [scrape_url(url) for url in urls]
    return await asyncio.gather(*tasks)
