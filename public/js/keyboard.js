import { isWhiteKey, midiToName } from '/shared/theory.js';

const WHITE_KEY_WIDTH = 34;
const WHITE_KEY_HEIGHT = 130;
const BLACK_KEY_WIDTH = 20;
const BLACK_KEY_HEIGHT = 82;

/** Renders an on-screen piano keyboard as SVG and lets callers color individual keys. */
export class PianoKeyboard {
  constructor(container, { lowMidi = 48, highMidi = 84 } = {}) {
    this.container = container;
    this.lowMidi = lowMidi;
    this.highMidi = highMidi;
    this.keyEls = new Map();
    this._render();
  }

  _render() {
    const whiteMidis = [];
    for (let m = this.lowMidi; m <= this.highMidi; m++) {
      if (isWhiteKey(m)) whiteMidis.push(m);
    }
    const width = whiteMidis.length * WHITE_KEY_WIDTH;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${WHITE_KEY_HEIGHT}`);
    svg.setAttribute('class', 'piano-keyboard');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'On-screen piano keyboard');

    const whiteXByMidi = new Map();
    whiteMidis.forEach((m, i) => whiteXByMidi.set(m, i * WHITE_KEY_WIDTH));

    for (const m of whiteMidis) {
      svg.appendChild(this._makeKey(m, whiteXByMidi.get(m), 0, WHITE_KEY_WIDTH, WHITE_KEY_HEIGHT, 'white'));
    }

    for (let m = this.lowMidi; m <= this.highMidi; m++) {
      if (isWhiteKey(m)) continue;
      const belowX = whiteXByMidi.get(m - 1);
      const aboveX = whiteXByMidi.get(m + 1);
      const whiteBelow = belowX !== undefined ? belowX : aboveX - WHITE_KEY_WIDTH;
      const x = whiteBelow + WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
      svg.appendChild(this._makeKey(m, x, 0, BLACK_KEY_WIDTH, BLACK_KEY_HEIGHT, 'black'));
    }

    this.container.replaceChildren(svg);
  }

  _makeKey(midi, x, y, w, h, kind) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', 2);
    rect.setAttribute('class', `piano-key piano-key--${kind}`);
    rect.dataset.midi = String(midi);
    rect.dataset.name = midiToName(midi);
    this.keyEls.set(midi, rect);
    return rect;
  }

  /** state: null | 'target' | 'pressed' | 'correct' | 'incorrect' */
  setKeyState(midi, state) {
    const el = this.keyEls.get(midi);
    if (!el) return;
    el.classList.remove('is-target', 'is-pressed', 'is-correct', 'is-incorrect');
    if (state) el.classList.add(`is-${state}`);
  }

  clearStates() {
    for (const el of this.keyEls.values()) {
      el.classList.remove('is-target', 'is-pressed', 'is-correct', 'is-incorrect');
    }
  }

  markKnown(knownMidis) {
    const known = new Set(knownMidis);
    for (const [midi, el] of this.keyEls) {
      el.classList.toggle('is-known', known.has(midi));
    }
  }

  /** Colors a key by SRS mastery level: 'new' | 'learning' | 'review' | 'mastered'. */
  setKeyLevel(midi, level) {
    const el = this.keyEls.get(midi);
    if (!el) return;
    el.classList.remove('lvl-new', 'lvl-learning', 'lvl-review', 'lvl-mastered');
    if (level) el.classList.add(`lvl-${level}`);
  }
}
