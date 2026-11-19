"""Exercise the shipped application against its built distribution in Chromium."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with ThreadingHTTPServer(("127.0.0.1",0), partial(SimpleHTTPRequestHandler,directory=root / "dist")) as server:
    Thread(target=server.serve_forever,daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
        page = browser.new_page(viewport={"width":390,"height":844})
        errors = []
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.goto(base + '/')
        page.locator('#bridge-release').click()
        page.locator('#verify-case').wait_for()
        assert 'PDF p. 2' in page.locator('#case-citation').inner_text()
        page.locator('#verify-case').click()
        assert 'Allain Creek' in page.locator('#detail-text').inner_text()
        page.locator('#pin-detail').click()
        page.locator('#close-detail').click()
        page.select_option('#case-choice','tidal')
        page.locator('#bridge-release').click()
        page.get_by_role('button',name='Inspect PDF page 3').click()
        assert 'Annapolis Tidal Gate' in page.locator('#detail-text').inner_text()
        page.locator('#pin-detail').click()
        page.locator('#close-detail').click()
        assert page.locator('#brief-pages li').count() == 2
        with page.expect_download() as download:
            page.locator('#export-brief').click()
        brief = Path(download.value.path()).read_text()
        assert 'openinformation.novascotia.ca' in brief and 'PDF p. 2' in brief and 'PDF p. 3' in brief
        assert not errors, errors
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        browser.close()
    server.shutdown()
