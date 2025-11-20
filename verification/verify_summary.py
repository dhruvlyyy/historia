from playwright.sync_api import sync_playwright
import json
import time

def verify_summary_buttons():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mock the API response for summary generation
        page.route("**/api/groq-proxy", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "choices": [{
                    "message": {
                        "content": "History of Presenting Illness:\nPatient has headache.\n\nProbable Diagnoses:\n1. **Migraine:** headache."
                    }
                }]
            })
        ))

        page.goto("http://localhost:8080")

        # Inject State to go to review screen
        app_state = {
            "preliminary": {"name": "John Doe", "age": "45", "sex": "Male"},
            "cc": {"symptom": "Headache", "duration": "2 days"},
            "hpiConversation": [],
            "history": {},
            "social": {"tobacco": "Never", "alcohol": "Never"},
            "labReports": "",
            "editingTarget": None
        }

        page.evaluate(f"""() => {{
            localStorage.setItem('historia_appState', '{json.dumps(app_state)}');
            localStorage.setItem('historia_currentScreen', 'review-screen');
        }}""")

        # Reload to apply state
        page.reload()

        # Accept disclaimer if it appears (it might not if we didn't clear it, but logic says we force it)
        # The app.js says: "For now, we force it every time as it is critical."
        if page.locator("#disclaimer-modal").is_visible():
            page.click("#accept-disclaimer-btn")
            page.wait_for_timeout(600)

        # Should be on review screen now.
        # Click Confirm & Generate
        page.click("#confirm-and-generate-btn")

        # Wait for summary screen (it goes to loading first, then summary)
        page.wait_for_selector("#summary-screen", state="visible", timeout=10000)

        # Check for buttons
        if page.locator("#start-new-btn").is_visible():
            print("Start New button is visible.")
        else:
            print("Start New button is MISSING.")

        if page.locator("#download-pdf-btn").is_visible():
            print("Download PDF button is visible.")

        # Screenshot
        page.screenshot(path="verification/summary_buttons_check.png")

        browser.close()

if __name__ == "__main__":
    verify_summary_buttons()
