from playwright.sync_api import sync_playwright, expect
import time

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 1. Test Mobile Responsiveness (Pixel 5 viewport)
        context_mobile = browser.new_context(viewport={'width': 393, 'height': 851})
        page_mobile = context_mobile.new_page()

        print("Navigating to app (Mobile View)...")
        page_mobile.goto("http://localhost:8000")

        # Wait for modal to be interactable or just interact with it if it blocks
        # The disclaimer modal is present. We should accept it to see the main app.
        page_mobile.click("#accept-disclaimer-btn")

        # Verify Welcome Screen
        # Use more specific locator
        expect(page_mobile.locator("#welcome-screen h1")).to_have_text("Historia AI")

        # Check if container fits nicely (height should be auto/min-height)
        container = page_mobile.locator('.app-container')
        bbox = container.bounding_box()
        print(f"Mobile Container Height: {bbox['height']}")

        # Take Screenshot of Mobile View
        page_mobile.screenshot(path="verification/mobile_view.png")
        print("Mobile screenshot taken.")

        # 2. Test Data Persistence
        context_desktop = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context_desktop.new_page()
        print("Navigating to app (Desktop View)...")
        page.goto("http://localhost:8000")

        # Accept disclaimer
        page.click("#accept-disclaimer-btn")

        # Fill in data
        page.click("#begin-history-btn")
        expect(page.locator("#preliminary-data-screen")).to_be_visible()

        print("Filling form...")
        page.fill("#name", "John Doe")
        page.fill("#age", "45")
        page.select_option("#sex", "Male")

        page.click("button[data-next='chief-complaint-screen']")
        expect(page.locator("#chief-complaint-screen")).to_be_visible()

        # Reload page
        print("Reloading page...")
        page.reload()

        # Verify we are back on the correct screen or at least data is there
        # Wait for loadProgress to run
        # Disclaimer might show up again on reload! I need to handle it.
        # The code says: // Check if previously accepted (optional storage) -> For now, we force it every time
        if page.locator("#disclaimer-modal").is_visible():
             page.click("#accept-disclaimer-btn")

        time.sleep(1)

        # Check if data persisted
        print("Checking persistence...")
        name_value = page.input_value("#name")
        print(f"Restored Name: {name_value}")
        if name_value != "John Doe":
            print("ERROR: Name not restored!")

        # Check if screen restored
        is_cc_screen_visible = page.locator("#chief-complaint-screen").is_visible()
        print(f"Is Chief Complaint Screen Visible: {is_cc_screen_visible}")

        page.screenshot(path="verification/persistence_check.png")

        # 3. Test Start New (Clear Persistence)

        # Need to be on CC screen to switch to summary? No, I can just do it.
        print("Switching to Summary Screen via JS...")
        # We need to re-inject the helper to switch screen because scope is isolated?
        # No, window.switchScreen is not exposed directly?
        # `switchScreen` is defined inside `DOMContentLoaded`, so it is NOT global.
        # I cannot call `switchScreen` from console.
        # I have to navigate via buttons.

        page.fill("#cc-symptom", "Headache")
        page.fill("#cc-duration", "2 days")

        # Click Next: Analyze Complaint
        # This triggers API call. I want to avoid that or mock it.
        # I'll mock the API call by intercepting the request.

        def handle_api(route):
            print("Mocking API response...")
            route.fulfill(status=200, body='{"choices":[{"message":{"content":"[HPI_COMPLETE]"}}]}')

        page.route("**/api/groq-proxy", handle_api)

        page.click("#start-hpi-btn")

        # It should go to hpi-chat-screen, then process response "[HPI_COMPLETE]", then wait 2s, then go to past-medical-history
        print("Waiting for HPI flow...")
        page.wait_for_timeout(3000)

        # Should be on past-medical-history-screen
        if page.locator("#past-medical-history-screen").is_visible():
             print("Navigated to Past History.")
        else:
             print("Stuck on HPI chat?")
             page.screenshot(path="verification/stuck.png")

        # Fast forward
        page.fill("#psh-details", "None")
        page.fill("#meds-details", "None")
        page.click("button[data-next='social-history-screen']")

        page.click("button[data-next='lab-report-screen']")

        page.click("button[data-next='review-screen']")

        page.click("#confirm-and-generate-btn")
        # This triggers API for summary. Mock again.
        # The mock is still active.
        # API response needs to match summary format for regex.

        def handle_summary_api(route):
            print("Mocking Summary API...")
            json_resp = {
                "choices": [{
                    "message": {
                        "content": "History of Presenting Illness: Patient has headache.\n\nProbable Diagnoses:\n1. **Migraine:** Stress."
                    }
                }]
            }
            route.fulfill(status=200, json=json_resp)

        # Update route? Playwright routing order matters.
        page.unroute("**/api/groq-proxy")
        page.route("**/api/groq-proxy", handle_summary_api)

        page.click("#confirm-and-generate-btn")

        print("Waiting for summary...")
        page.wait_for_selector("#summary-screen.active", timeout=5000)

        expect(page.locator("#download-pdf-btn")).to_be_visible()

        # Take screenshot of Summary Screen
        page.screenshot(path="verification/summary_screen.png")

        # Test "Start New"
        print("Testing Start New...")
        page.click("#start-new-btn")

        # Should reload
        time.sleep(1)
        if page.locator("#disclaimer-modal").is_visible():
             page.click("#accept-disclaimer-btn")

        expect(page.locator("#welcome-screen")).to_be_visible()

        # Check if name is cleared
        page.click("#begin-history-btn")
        name_after_reset = page.input_value("#name")
        print(f"Name after reset: '{name_after_reset}'")

        if name_after_reset == "":
            print("Persistence cleared successfully.")
        else:
            print("ERROR: Persistence NOT cleared.")

        browser.close()

if __name__ == "__main__":
    verify_changes()
