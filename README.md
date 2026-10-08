# Jay Randolph

Personal website styled as a Mac OS X Aqua / Frutiger Aero desktop. Built with Angular.

## Structure

- Desktop at `/` with a Pictures folder and the Film Sim app.
- Apps are registered in `src/app/os/apps.ts`; folders come from the filesystem service in `src/app/os/filesystem.service.ts`.
- Film Sim (`/film-sim`) is a Rust/WebAssembly film simulator (see `engine/`).

## Photographs

Photos are hosted in a private S3 bucket and listed by a Lambda in [jayrandolph-service](https://github.com/jameshrandolphv/jayrandolph-service), which returns album/photo metadata and presigned URLs for each thumbnail and original. `FileSystemService` loads `GET <photosApiUrl>/albums` at startup and reloads it halfway through the URL lifetime.

Set `photosApiUrl` (the stack's `ApiUrl` output) in `src/environments/environment.ts` for `npm start` and `src/environments/environment.prod.ts` for production builds. While it is empty the Pictures folder is empty. The API must allow this site's origin (the service's CDK `origins` context).

Originals still live in `photos-src/<album-name>/`; upload them with the service's `scripts/upload-photos.mjs` (see its README).

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
