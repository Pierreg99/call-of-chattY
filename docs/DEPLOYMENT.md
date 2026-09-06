# Web Deployment

## Local

```bash
npm install
npm run dev
```

## Production build

```bash
npm run check
npm test
npm run build
npm run preview
```

The generated `dist/` directory is a static web application.

## GitHub Pages

Recommended workflow:

1. Build with Node 22.
2. Upload `dist/` as a Pages artifact.
3. Deploy with the official Pages deployment action.
4. Keep the base path compatible with the repository URL.

## Other hosts

Vercel, Netlify and any static host supporting SPA assets can serve the Vite output. The optional multiplayer relay must be hosted separately on a WebSocket-capable runtime.

## Rollback

Rollback means redeploying the last known-good Git commit and verifying the health checklist before reopening the public URL.
