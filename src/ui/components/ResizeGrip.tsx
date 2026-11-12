import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useNotes } from '../NotesProvider';

const STEP = 20;
const BIG_STEP = 100;

interface Drag {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
}

/**
 * Corner handle that resizes the plugin window while it is open. Figma lets
 * only the plugin resize its own window, so the handle sends the wanted size to
 * Plugin Main, which clamps it and remembers it. Dragging uses screen
 * coordinates because the window itself moves under the pointer. The keyboard
 * works too: arrow keys change the size, Shift makes the step bigger.
 */
export function ResizeGrip() {
  const { actions } = useNotes();
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);

  function send(width: number, height: number) {
    if (frame.current !== null) return;
    // One request per frame is plenty and keeps the drag smooth.
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      actions.resizeWindow(width, height);
    });
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      screenX: event.screenX,
      screenY: event.screenY,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start) return;
    send(
      start.width + (event.screenX - start.screenX),
      start.height + (event.screenY - start.screenY),
    );
  }

  function onPointerEnd(event: PointerEvent<HTMLButtonElement>) {
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const delta: Record<string, [number, number]> = {
      ArrowRight: [step, 0],
      ArrowLeft: [-step, 0],
      ArrowDown: [0, step],
      ArrowUp: [0, -step],
    };
    const change = delta[event.key];
    if (!change) return;
    event.preventDefault();
    actions.resizeWindow(
      window.innerWidth + change[0],
      window.innerHeight + change[1],
    );
  }

  return (
    <button
      type="button"
      className="grip"
      aria-label="Resize the window (drag, or use the arrow keys)"
      title="Drag to resize the window"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M11 5L5 11M11 9L9 11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
