# foundry-session-1

Live chat demo for Session 1 of *Mastering Microsoft Foundry*. Live: https://foundry-session-1.vercel.app

Enter your Azure AI Foundry endpoint, API key and deployment name in the page. Each request goes through `/api/chat` (a Vercel function) to `https://<host>/openai/v1/chat/completions`. Nothing is stored server-side; only Azure AI hosts are allowed. "Remember on this device" keeps the values in the browser's localStorage.
