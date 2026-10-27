import changelog from '../../../CHANGELOG.md';

export interface DocumentDef {
  /** Filename in lowercase; doubles as the URL segment. */
  id: string;
  name: string;
  content: string;
  /** A page elsewhere on the site that shows this document; opening the file goes there instead of the editor. */
  href?: string;
  /** Left out of the Documents listing but still opens by its URL. */
  hidden?: boolean;
}

const ABOUT = `I am a software engineer by day and aspire to be decent at too many hobbies. Check out some of my photography, music, and games here on this site, or try out my mobile games on your iOS/Android device. Chaos Park is currently in the submission process for the App Store/Google Play, and there will be more games to come!

- Jay Randolph`;

/** Listed in this order: About first and DO NOT OPEN last. */
export const DOCUMENTS: readonly DocumentDef[] = [
  { id: 'about.txt', name: 'About.txt', content: ABOUT },
  { id: 'chaos-park-privacy-policy.txt', name: 'Chaos Park Privacy Policy.txt', content: '', href: '/chaos-park/privacy' },
  { id: 'chaos-park-support.txt', name: 'Chaos Park Support.txt', content: '', href: '/chaos-park/support' },
  { id: 'crash-crossing-privacy-policy.txt', name: 'Crash Crossing Privacy Policy.txt', content: '', href: '/crash-crossing/privacy' },
  { id: 'crash-crossing-support.txt', name: 'Crash Crossing Support.txt', content: '', href: '/crash-crossing/support' },
  { id: 'marketing.txt', name: 'Marketing.txt', content: '', href: '/marketing' },
  { id: 'do-not-open.txt', name: 'DO NOT OPEN.txt', content: 'Why would you do that...' },
  { id: 'CHANGELOG.md', name: 'CHANGELOG.md', content: changelog.trimEnd(), hidden: true },
];
