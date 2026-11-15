# foundry-session-1

Live chat demo for Session 1 of *Mastering Microsoft Foundry*. The page calls `/api/chat`, a Vercel function that forwards to an Azure AI Foundry deployment (OpenAI-compatible `/openai/v1/chat/completions`). The key stays server-side.

## Vercel environment variables
- `AZURE_AI_ENDPOINT`: e.g. `https://<resource>.services.ai.azure.com`
- `AZURE_AI_KEY`: resource key
- `AZURE_AI_DEPLOYMENT`: deployment name, e.g. `DeepSeek-V4.1-Flash`
- `DEMO_PASSCODE`: optional; viewers must enter it to chat

Redeploy after changing them.
