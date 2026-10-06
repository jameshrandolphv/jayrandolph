# Jay Randolph

Personal website styled as a Mac OS X Aqua / Frutiger Aero desktop. Built with Angular.

## Structure

- Desktop at `/` with a Photography folder and the Film Sim app.
- Apps are registered in `src/app/os/apps.ts`; folders come from the filesystem service in `src/app/os/filesystem.service.ts`.
- Film Sim (`/film-sim`) is a Rust/WebAssembly film simulator (see `engine/`).

## Adding photographs

Put originals in `photos-src/<album-name>/` (jpg, jpeg, png, webp, avif). An optional `album.json` with `{ "title": "…" }` overrides the folder-derived title.

`npm run photos` (run automatically before `start` and `build`) writes thumbnails, display copies and `manifest.json` to `public/photos/`. Originals are never served.

## Commands

```bash
npm start              # dev server at http://localhost:4200/
npm run build          # production build in dist/jay-randolph/browser
npm test               # unit tests (Vitest)
npm run engine:build   # rebuild public/engine/film_engine.wasm (needs Rust); the binary is committed
```

## Hosting (AWS Amplify)

`amplify.yml` builds the site. In the Amplify console add a rewrite under Hosting > Rewrites and redirects so deep links work:

| Source | Target | Type |
| --- | --- | --- |
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|webp\|wasm\|avif\|fsp)$)([^.]+$)/>` | `/index.html` | 200 (Rewrite) |
