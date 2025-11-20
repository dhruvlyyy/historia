from playwright.sync_api import sync_playwright

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080")

        # Wait for disclaimer modal
        page.wait_for_selector("#disclaimer-modal")

        # Screenshot disclaimer
        page.screenshot(path="verification/disclaimer.png")

        # Accept disclaimer
        page.click("#accept-disclaimer-btn")
        page.wait_for_timeout(600) # wait for fade out

        # Screenshot main UI
        page.screenshot(path="verification/main_ui.png")

        # Check voice toggle
        toggle = page.locator("#voice-mode-toggle")
        if toggle.is_visible():
            print("Voice toggle is visible")

        browser.close()

if __name__ == "__main__":
    verify_ui()
