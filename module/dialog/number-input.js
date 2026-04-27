import { clamp } from "../utils.js";

/**
 * Reusable number-input stepper with +/- buttons and editable center field.
 *
 * Markup contract (the dialog template must include, scoped under rootSelector):
 *   .number-input-controls
 *     button.number-input-minus-btn > img
 *     .number-input-display > input.number-input-value
 *     button.number-input-plus-btn > img
 *
 * Usage in a dialog's activateListeners(html):
 *   this._difficultyInput = new NumberInput(html, '.difficulty-input-wrap', {
 *     min: 10, max: 40, step: 5, value: 15,
 *     onChange: (v) => { this._difficulty = v; }
 *   });
 *
 * Read at roll time via this._difficultyInput.value or via the onChange-tracked field.
 */
export class NumberInput {
  /**
   * @param {jQuery} html              The dialog's root html element
   * @param {string} rootSelector      Selector for the wrapping element that contains the controls
   * @param {Object} opts
   * @param {number} opts.min          Minimum value (clamp floor)
   * @param {number} opts.max          Maximum value (clamp ceiling)
   * @param {number} opts.step         Step size for +/- buttons and arrow keys
   * @param {number} opts.value        Initial value (clamped to range)
   * @param {Function} [opts.onChange] Optional callback(newValue) fired whenever value commits
   */
  constructor(html, rootSelector, opts) {
    this.min = opts.min;
    this.max = opts.max;
    this.step = opts.step;
    this.onChange = opts.onChange || null;

    this.$root = html.find(rootSelector);
    this.$input = this.$root.find('.number-input-value');
    this.$minus = this.$root.find('.number-input-minus-btn');
    this.$plus = this.$root.find('.number-input-plus-btn');
    this.$minusImg = this.$minus.find('img');
    this.$plusImg = this.$plus.find('img');

    this._value = clamp(opts.value, this.min, this.max);
    this._render();
    this._attach();
  }

  get value() { return this._value; }

  set value(v) {
    const next = clamp(Number(v) || this.min, this.min, this.max);
    this._value = next;
    this._render();
    if (this.onChange) this.onChange(this._value);
  }

  _render() {
    // Avoid moving the caret if the input is focused and already shows a value.
    if (document.activeElement !== this.$input[0]) {
      this.$input.val(String(this._value));
    }
    const minusDisabled = this._value <= this.min;
    const plusDisabled = this._value >= this.max;
    this.$minus.toggleClass('disabled', minusDisabled);
    this.$plus.toggleClass('disabled', plusDisabled);
    this.$minusImg.attr('src',
      `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    this.$plusImg.attr('src',
      `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  _attach() {
    // +/- buttons: blur the input first so _render() can refresh the displayed value.
    this.$minus.on('click', () => {
      this.$input.blur();
      if (this._value > this.min) this.value = this._value - this.step;
    });
    this.$plus.on('click', () => {
      this.$input.blur();
      if (this._value < this.max) this.value = this._value + this.step;
    });

    // Strip non-digits as the user types; defer range-clamp until blur/Enter
    // so users can type "40" via "4" then "0" without intermediate clamping.
    this.$input.on('input', (ev) => {
      const cleaned = ev.target.value.replace(/[^0-9]/g, '');
      if (cleaned !== ev.target.value) ev.target.value = cleaned;
      if (cleaned !== '') {
        const n = parseInt(cleaned, 10);
        if (Number.isFinite(n)) this._value = n; // possibly out of range; clamped on blur
      }
    });

    // Commit (clamp) on blur or Enter.
    const commit = () => {
      const raw = this.$input.val();
      const n = raw === '' ? this.min : parseInt(raw, 10);
      this.value = Number.isFinite(n) ? n : this.min;
    };
    this.$input.on('blur', commit);
    this.$input.on('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
        this.$input.blur();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (this._value < this.max) this.value = Math.min(this.max, this._value + this.step);
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (this._value > this.min) this.value = Math.max(this.min, this._value - this.step);
      }
    });

    // Block scroll-wheel value changes while focused (prevents accidental edits).
    this.$input.on('wheel', (ev) => {
      if (document.activeElement === ev.target) ev.preventDefault();
    });
  }
}
