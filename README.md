# SubLingo

SubLingo is an early Chrome extension prototype intended to display Japanese subtitles and Simplified Chinese translations over third-party video webpages.

## Current prototype

- Adds a subtitle overlay to webpages.
- Includes extension popup controls to toggle the overlay, show sample subtitles, and clear the overlay.
- This is a UI scaffold only: automatic audio capture, Japanese speech recognition, translation, and subtitle timing are not fully implemented yet.

## Load locally in Chrome

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder containing `manifest.json`.
5. Open a video webpage and click the SubLingo extension icon.
6. Choose **显示示例字幕** to test the overlay.

If you change the code, return to `chrome://extensions` and click the reload icon on the SubLingo card.

## Next milestones

1. Add secure backend endpoints for speech recognition and translation.
2. Implement audio capture/streaming for supported video tabs.
3. Add subtitle timing and error handling.
4. Deploy the backend to Render and configure secrets as environment variables.

Never put API keys in extension files or commit them to GitHub.
