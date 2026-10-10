/**
 * Downloads a photo from its presigned S3 URL for use in script (wallpaper, Film Sim).
 *
 * The same URL is also shown with plain `<img>` tags, which request it without an Origin header; S3 answers
 * those without CORS headers or `Vary: Origin`. Safari then serves that cached copy to a later `fetch()` of the
 * URL and rejects it for lacking CORS headers, so any photo that had been on screen failed to download.
 * Skipping the cache always makes a fresh CORS request.
 */
export const fetchPhoto = (url: string): Promise<Response> => fetch(url, { cache: 'no-store' });
