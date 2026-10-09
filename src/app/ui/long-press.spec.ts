import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LongPress, type LongPressEvent } from './long-press';

@Component({
  imports: [LongPress],
  template: `<button appLongPress [longPressFilter]="filter()" (longPress)="presses.push($event)" (click)="clicks = clicks + 1">x</button>`,
})
class Host {
  presses: LongPressEvent[] = [];
  clicks = 0;
  filter = signal((): boolean => true);
}

const pointer = (type: string, init: { x?: number; y?: number; pointerType?: string; id?: number } = {}) => {
  const event = new MouseEvent(type, { bubbles: true, clientX: init.x ?? 10, clientY: init.y ?? 20 });
  Object.assign(event, { pointerType: init.pointerType ?? 'touch', pointerId: init.id ?? 1, isPrimary: true });
  return event;
};

describe('LongPress', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    host = fixture.componentInstance;
    button = fixture.nativeElement.querySelector('button');
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('fires once a finger has been held still for half a second', () => {
    button.dispatchEvent(pointer('pointerdown', { x: 30, y: 40 }));
    vi.advanceTimersByTime(499);
    expect(host.presses).toHaveLength(0);
    vi.advanceTimersByTime(2);
    expect(host.presses).toEqual([{ x: 30, y: 40, target: button }]);
  });

  it('does not fire for a tap, a drag or a cancelled touch', () => {
    button.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(200);
    button.dispatchEvent(pointer('pointerup'));
    vi.advanceTimersByTime(1000);

    button.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    vi.advanceTimersByTime(200);
    button.dispatchEvent(pointer('pointermove', { x: 10, y: 40 }));
    vi.advanceTimersByTime(1000);

    button.dispatchEvent(pointer('pointerdown'));
    button.dispatchEvent(pointer('pointercancel'));
    vi.advanceTimersByTime(1000);
    expect(host.presses).toHaveLength(0);
  });

  it('forgives a little finger wobble', () => {
    button.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }));
    button.dispatchEvent(pointer('pointermove', { x: 13, y: 12 }));
    vi.advanceTimersByTime(600);
    expect(host.presses).toHaveLength(1);
  });

  it('ignores the mouse', () => {
    button.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(1000);
    expect(host.presses).toHaveLength(0);
  });

  it('swallows the click that follows a long press, but not the next tap', () => {
    button.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(600);
    button.dispatchEvent(pointer('pointerup'));
    button.click();
    expect(host.clicks).toBe(0);

    button.click();
    expect(host.clicks).toBe(1);
  });

  it('stops swallowing clicks after a moment, for browsers that send none', () => {
    button.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(600);
    button.dispatchEvent(pointer('pointerup'));
    vi.advanceTimersByTime(500);
    button.click();
    expect(host.clicks).toBe(1);
  });

  it('leaves a press alone, click included, when there is nothing to open', () => {
    host.filter.set(() => false);
    fixture.detectChanges();
    button.dispatchEvent(pointer('pointerdown'));
    vi.advanceTimersByTime(600);
    button.dispatchEvent(pointer('pointerup'));
    button.click();
    expect(host.presses).toHaveLength(0);
    expect(host.clicks).toBe(1);
  });
});
