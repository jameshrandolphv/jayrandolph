/*
 * Shared by the plain reading pages the app stores link to (each game's privacy policy and support page): the
 * address players write to, and the look of the page inside its window.
 */

export const GAMES_CONTACT = 'jayrandolphgames@gmail.com';

export const INFO_PAGE_STYLES = `
  .info-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 20px 28px 28px;
    background: #fff;
    color: #222;
    font: 15px/1.55 'Lucida Grande', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.3);
  }
  .info-body > * { max-width: 680px; }
  h2 { margin: 0 0 4px; font-size: 24px; }
  h3 { margin: 22px 0 6px; font-size: 17px; }
  p, ul { margin: 0 0 10px; }
  ul { padding-left: 22px; }
  li { margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
  a { color: #1a5fb4; }
`;
