How to use the WatchDog extension locally:

1) Build or run your backend and note the base URL (e.g., https://...-8000....modal.host).
2) Edit content.js (top BACKEND const) if needed to hardcode your backend URL when running outside Vite.
3) Load the extension in Chrome:
   - Go to chrome://extensions
   - Enable Developer mode
   - Click "Load unpacked"
   - Select this public/extension folder
4) Navigate to YouTube, Instagram, or X. You should see a small WatchDog badge and, if flagged, a top warning bar.

Note: When served as part of Vite, content.js will not have access to import.meta.env. For packed extension use, set a fixed backend URL in content.js.
