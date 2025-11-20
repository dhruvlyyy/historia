from playwright.sync_api import sync_playwright

def verify_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 1. Mobile View
        context_mobile = browser.new_context(
            viewport={'width': 375, 'height': 667},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
        )
        page_mobile = context_mobile.new_page()
        page_mobile.goto("http://localhost:8080")
        page_mobile.wait_for_selector("#disclaimer-modal")
        page_mobile.screenshot(path="verification/mobile_start.png")

        # Interact with disclaimer
        page_mobile.click("#accept-disclaimer-btn")
        page_mobile.wait_for_selector("#welcome-screen.active")
        page_mobile.screenshot(path="verification/mobile_welcome.png")

        # 2. Desktop View
        context_desktop = browser.new_context(
            viewport={'width': 1280, 'height': 800}
        )
        page_desktop = context_desktop.new_page()
        page_desktop.goto("http://localhost:8080")
        page_desktop.click("#accept-disclaimer-btn")
        page_desktop.wait_for_selector("#welcome-screen.active")
        page_desktop.screenshot(path="verification/desktop_welcome.png")

        browser.close()

if __name__ == "__main__":
    verify_layout()
