
from playwright.sync_api import sync_playwright

def verify_mobile_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate a mobile device (Pixel 5)
        pixel_5 = p.devices['Pixel 5']
        context = browser.new_context(**pixel_5)
        page = context.new_page()

        try:
            page.goto("http://localhost:8080")
            page.wait_for_load_state("networkidle")

            # Take a screenshot of the welcome screen with the modal
            page.screenshot(path="verification/mobile_fix_verification.png")
            print("Screenshot saved to verification/mobile_fix_verification.png")

            # Also take a screenshot of PC view just in case
            page_pc = browser.new_page()
            page_pc.set_viewport_size({"width": 1280, "height": 720})
            page_pc.goto("http://localhost:8080")
            page_pc.wait_for_load_state("networkidle")
            page_pc.screenshot(path="verification/pc_verification.png")
            print("PC Screenshot saved to verification/pc_verification.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_mobile_layout()
