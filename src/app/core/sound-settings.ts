import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'sound-muted';

/** The global mute switch shared by the menu bar and every game's sound effects. */
@Injectable({ providedIn: 'root' })
export class SoundSettings {
  readonly muted = signal(read());

  toggle(): void {
    const muted = !this.muted();
    this.muted.set(muted);
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for the session only.
    }
  }
}

const read = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};
