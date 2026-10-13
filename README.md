# SubLingo

SubLingo is a Chrome extension prototype that captures audio from the currently active browser tab, transcribes Japanese speech, translates it into Simplified Chinese, and displays both lines as an overlay.

## Current implementation

- Manifest V3 extension with tab audio capture via an offscreen document.
- Short audio segments are sent to a backend for Japanese speech recognition (Whisper) and Chinese translation (GPT-4o mini).
- Subtitle overlay displays recognized Japanese and Chinese.
- Includes demo subtitle controls for checking the overlay.

## Important limitations

- This is an early live-caption prototype, not a polished streaming subtitle engine. It records about 4-second audio segments, so subtitles may lag and there may be brief gaps between segments.
- “All websites” cannot be guaranteed. Chrome internal pages, some DRM-protected streaming sites, muted/no-audio tabs, and sites that restrict capture may not work.
- Captured tab audio is routed back to the speakers while the extension is running.
- Audio is sent to the backend you configure, then to OpenAI for transcription and translation. This may incur API charges. Do not use this for private or sensitive audio unless you are comfortable sending it to the configured services.
- Never place your OpenAI API key in extension files or commit it to GitHub.

## Deploy the backend on Render

1. Sign in to Render and choose New + → Web Service.
2. Connect the GitHub repository CJTAN0424/sublingo.
3. Set the Root Directory to server.
4. Build command: npm install
5. Start command: npm start
6. Add environment variable OPENAI_API_KEY with your own OpenAI API key in Render's Environment settings. Do not paste it into GitHub.
7. Deploy the service. Open the service's /health URL. It should return JSON with ok: true and speechRecognitionConfigured: true.

The repository includes render.yaml with the same service settings. Hosting provider plans and policies can change.

## Install/update in Chrome

1. Download the repository ZIP from GitHub and extract it to a folder.
2. Open chrome://extensions in Chrome and turn on Developer mode.
3. If SubLingo is already installed, remove the old unpacked extension or reload it after replacing the files.
4. Click Load unpacked and select the extracted folder that contains manifest.json.
5. Open a video page, click SubLingo, paste the backend service URL (for example, https://your-service.onrender.com) and click 开始实时翻译.
6. Click 停止翻译 to stop capturing audio.

For code changes, click the reload icon on the SubLingo card in chrome://extensions, then refresh the video page.

## Local backend

From the server directory, run npm install, then set OPENAI_API_KEY in your shell environment and run npm start. Do not commit .env files or secrets.