from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"Console log: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"Page error: {exc}"))

        print("Navigating to app...")
        page.goto("http://localhost:8080")

        # Wait for modal to appear
        page.wait_for_selector("#disclaimer-modal", state="visible")
        print("Modal visible.")
        page.screenshot(path="verification/1_modal_visible.png")

        # Click the button
        print("Clicking 'I Understand & Agree'...")
        page.click("#accept-disclaimer-btn")

        # Wait for transition
        time.sleep(1.5)

        # Check visibility of app container
        app_container = page.locator(".app-container")
        is_visible = app_container.is_visible()
        print(f"App container visible: {is_visible}")

        box = app_container.bounding_box()
        print(f"App container bounding box: {box}")

        page.screenshot(path="verification/2_after_click.png")
        print("Screenshot taken after click.")

        browser.close()

if __name__ == "__main__":
    run()
