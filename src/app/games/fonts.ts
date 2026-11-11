/** Self-hosted so the games work offline; both are under the SIL Open Font License (see NOTICE). */
const FONTS: readonly [family: string, url: string][] = [
  ['Bangers', 'fonts/bangers.woff2'],
  ['Pacifico', 'fonts/pacifico.woff2'],
];

const FONT_TIMEOUT_MS = 4000;

/** One download per font for the whole visit, however many games ask and however often they are opened. */
const loading = new Map<string, Promise<void>>();

const loadFont = (family: string, url: string): Promise<void> => {
  let pending = loading.get(family);
  if (!pending) {
    pending = new FontFace(family, `url(${url})`)
      .load()
      .then((face) => void document.fonts.add(face));
    loading.set(family, pending);
    // A failed download is forgotten, so opening a game again tries once more.
    pending.catch(() => loading.delete(family));
  }
  return pending;
};

/**
 * The fonts the games draw their text in. Text is rasterised when it is created, so the fonts have to be ready
 * before a game's view is built.
 */
export const loadGameFonts = async (): Promise<void> => {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  const load = Promise.all(FONTS.map(([family, url]) => loadFont(family, url)));
  // A missing font falls back to the system ones rather than holding up the game.
  await Promise.race([load, new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS))]).catch(
    () => undefined,
  );
};
