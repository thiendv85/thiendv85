from playwright.sync_api import sync_playwright
import time
import os

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        
        print("Navigating to http://localhost:3005 ...")
        try:
            page.goto('http://localhost:3005', timeout=60000)
            print("Navigation successful.")
        except Exception as e:
            print(f"Navigation failed: {e}")
            page.screenshot(path=os.path.join(os.getcwd(), 'nav_failure.png'))
            raise e
        page.wait_for_load_state('load')
        time.sleep(2)
        
        print("Checking if login is required...")
        if page.locator('input[type="email"]').is_visible(timeout=5000):
            print("Login screen detected. Logging in...")
            page.fill('input[type="email"]', 'test@dvptdl.com')
            page.fill('input[type="password"]', '123456')
            page.click('button[type="submit"]')
            page.wait_for_load_state('load')
            print("Login success wait finished.")
            time.sleep(2)
        else:
            print("Already logged in or login screen skipped.")

        # Handle Upload if on upload screen
        print("Checking if on upload screen...")
        if page.locator('text=NHẬP DỮ LIỆU').is_visible(timeout=5000):
            # Wait for monthly sync to avoid disabled input/buttons
            print("Waiting for monthly sync...")
            try:
                page.wait_for_selector('text=Dữ liệu Tháng', timeout=60000)
                print("Monthly sync finished.")
            except:
                print("Monthly sync timed out or already finished.")
            
            print("Upload screen detected. Uploading sample data...")
            file_path = os.path.join(os.getcwd(), 'sample_data.csv')
            page.set_input_files('input[type="file"]', file_path)
            
            # Must click "Chỉ xem" to proceed
            print("Clicking 'Chỉ xem' to analyze...")
            # Wait for button to be enabled
            load_only_btn = page.locator('text=Chỉ xem (không lưu Cloud)')
            load_only_btn.wait_for(state='visible', timeout=10000)
            
            # Small delay to ensure state update
            time.sleep(1)
            load_only_btn.click()
            
            # Wait for transition to dashboard
            print("Waiting for dashboard transition...")
            page.wait_for_selector('i.fa-sliders', timeout=30000)
            print("Transitioned to dashboard.")
        
        page.screenshot(path=os.path.join(os.getcwd(), 'dashboard_loaded.png'))
            
        page.wait_for_load_state('networkidle')
        page.screenshot(path=os.path.join(os.getcwd(), 'settings_page.png'))
        
        # Test Responsiveness: Click "Tải Cloud" in Settings
        print("Testing responsiveness in Settings...")
        try:
            load_cloud_btn = page.locator('text=Tải Cloud')
            load_cloud_btn.wait_for(state='visible', timeout=5000)
            load_cloud_btn.click()
            print("Clicked 'Tải Cloud'. Checking if it deadlocks...")
            
            # Since we didn't provide a PIN or anything, it might alert or just finish
            # The important thing is it shouldn't stay disabled indefinitely if it fails
            time.sleep(2)
            page.screenshot(path=os.path.join(os.getcwd(), 'after_click_test.png'))
            
            if load_cloud_btn.is_disabled():
                print("WARNING: Button is still disabled after 2 seconds!")
            else:
                print("SUCCESS: Button is responsive.")
        except Exception as e:
            print(f"Responsiveness test skipped or failed: {e}")

        print("Test sequence completed.")
        browser.close()

if __name__ == "__main__":
    import sys
    import io
    import traceback
    # Handle console encoding for Windows
    if sys.platform == "win32":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
        
    try:
        run_test()
    except Exception as e:
        print(f"Test failed. Full traceback:")
        traceback.print_exc()
        sys.exit(1)
