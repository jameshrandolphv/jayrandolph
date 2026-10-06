import { describe, expect, it } from 'vitest';
import { FixedStep } from './fixed-step';
import { FramePacer } from './frame-pacer';
import { renderText, textWidth } from './pixel-font';
import { Pixels } from './pixels';

describe('FixedStep', () => {
  it('runs a whole number of ticks and carries the remainder', () => {
    const step = new FixedStep(10);
    let ticks = 0;
    step.advance(25, () => ticks++);
    expect(ticks).toBe(2);
    step.advance(5, () => ticks++);
    expect(ticks).toBe(3);
  });

  it('snaps near-exact frame times so the leftover stays constant', () => {
    const step = new FixedStep(16.667);
    let ticks = 0;
    step.advance(16.667, () => ticks++);
    const alpha = step.alpha;
    for (const frame of [15.9, 17.4, 16.2, 17.0]) {
      step.advance(frame, () => ticks++);
      expect(step.alpha).toBeCloseTo(alpha, 10);
    }
    expect(ticks).toBe(5);
  });

  it('clamps long frames', () => {
    const step = new FixedStep(10, 50);
    let ticks = 0;
    step.advance(10_000, () => ticks++);
    expect(ticks).toBe(5);
  });
});

describe('FramePacer', () => {
  const run = (pacer: FramePacer, deltas: number[]) => deltas.map((d) => pacer.pace(d));

  it('passes steady frames through', () => {
    const given = run(new FramePacer(), Array(40).fill(16.7));
    for (const g of given.slice(10)) expect(g).toBeCloseTo(16.7, 5);
  });

  it('spreads a late frame and the burst after it over several frames', () => {
    const steady = Array(30).fill(17);
    const burst = [43, 1, 6, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17];
    const given = run(new FramePacer(), [...steady, ...burst]).slice(30);
    expect(Math.max(...given)).toBeLessThan(23);
    expect(Math.min(...given)).toBeGreaterThan(13);
    // Nothing is lost: the extra time handed out later matches what arrived.
    const arrived = steady.concat(burst).slice(30).reduce((a, b) => a + b, 0);
    expect(given.reduce((a, b) => a + b, 0)).toBeCloseTo(arrived, 0);
  });

  it('passes a long freeze through and starts over', () => {
    const pacer = new FramePacer();
    run(pacer, Array(30).fill(17));
    expect(pacer.pace(5000)).toBe(5000);
    expect(pacer.pace(17)).toBe(17);
  });
});

describe('Pixels', () => {
  it('draws rectangles and clips to bounds', () => {
    const p = new Pixels(4, 4).rect(-2, -2, 4, 4, '#ffffff');
    expect(p.has(1, 1)).toBe(true);
    expect(p.has(2, 2)).toBe(false);
  });

  it('outlines only transparent neighbours', () => {
    const p = new Pixels(5, 5).set(2, 2, '#ffffff').outlined('#000000');
    expect([...p.data.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 3)]).toEqual([255, 255, 255]);
    expect(p.has(1, 2) && p.has(3, 2) && p.has(2, 1) && p.has(2, 3)).toBe(true);
    expect(p.has(1, 1)).toBe(false);
  });

  it('builds sprites from palette rows', () => {
    const p = Pixels.fromRows(['#.', '.#'], { '#': '#ff0000' });
    expect(p.has(0, 0) && p.has(1, 1)).toBe(true);
    expect(p.has(1, 0)).toBe(false);
  });
});

describe('pixel font', () => {
  it('sizes text including outlines', () => {
    const plain = renderText('AB', { fill: '#fff' });
    expect(plain.width).toBe(textWidth('AB'));
    const outlined = renderText('AB', { fill: '#ffffff', outlines: ['#000000', '#111111'] });
    expect(outlined.width).toBe(plain.width + 4);
    expect(outlined.height).toBe(plain.height + 4);
  });

  it('covers every character the game draws', () => {
    for (const text of ['FLAPPY CAT', 'GET READY', 'GAME OVER', 'START', 'MEDAL', 'SCORE', 'BEST', 'PAUSED', 'TAP', 'OK', '0123456789']) {
      const pixels = renderText(text, { fill: '#ffffff' });
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') continue;
        let any = false;
        for (let y = 0; y < pixels.height && !any; y++) for (let x = i * 6; x < i * 6 + 5; x++) any ||= pixels.has(x, y);
        expect(any, `${text}[${i}]`).toBe(true);
      }
    }
  });
});
