// Mouse/touch aim + keyboard shortcuts. The aim point is tracked in normalised
// device coordinates so the combat system can raycast through it directly.

export class InputManager {
  constructor(element, handlers) {
    this.el = element;
    this.h = handlers;
    this.aim = { x: 0, y: -0.05 }; // NDC
    this.aimPx = { x: 0, y: 0 };
    this.firing = false;
    this.firePressed = false; // edge-triggered, consumed by weapon system
    this.zoom = false;

    this._onMove = (e) => this._updateAim(e);
    this._onDown = (e) => {
      this._updateAim(e);
      if (e.button === 2) {
        this.zoom = true;
        this.h.onZoom?.(true);
        return;
      }
      if (e.button === 0 || e.pointerType === 'touch') {
        this.firing = true;
        this.firePressed = true;
      }
    };
    this._onUp = (e) => {
      if (e.button === 2) {
        this.zoom = false;
        this.h.onZoom?.(false);
        return;
      }
      this.firing = false;
    };
    this._onLeave = () => {
      this.firing = false;
    };
    this._onContext = (e) => e.preventDefault();
    this._onWheel = (e) => {
      e.preventDefault();
      this.h.onCycleWeapon?.(e.deltaY > 0 ? 1 : -1);
    };
    this._onKey = (e) => {
      const k = e.key.toLowerCase();
      if (['1', '2', '3', '4'].includes(k)) this.h.onSelectWeapon?.(Number(k) - 1);
      else if (k === 'r') this.h.onReload?.();
      else if (k === 'q') this.h.onLastWeapon?.();
      else if (k === 'escape' || k === 'p') this.h.onPause?.();
      else if (k === 'm') this.h.onMute?.();
      else if (k === 'c') this.h.onCommentary?.();
      else if (k === 'f') this.h.onFps?.();
      else if (k === ' ') {
        e.preventDefault();
        this.firing = e.type === 'keydown';
        if (e.type === 'keydown' && !e.repeat) this.firePressed = true;
        return;
      }
    };
    this._onKeyUp = (e) => {
      if (e.key === ' ') this.firing = false;
    };

    element.addEventListener('pointermove', this._onMove);
    element.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    element.addEventListener('pointerleave', this._onLeave);
    element.addEventListener('contextmenu', this._onContext);
    element.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _updateAim(e) {
    const r = this.el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    this.aimPx.x = px;
    this.aimPx.y = py;
    this.aim.x = (px / r.width) * 2 - 1;
    this.aim.y = -(py / r.height) * 2 + 1;
    this.h.onAimMove?.(px, py);
  }

  consumeFirePressed() {
    const v = this.firePressed;
    this.firePressed = false;
    return v;
  }

  reset() {
    this.firing = false;
    this.firePressed = false;
    this.zoom = false;
  }

  dispose() {
    const el = this.el;
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
    el.removeEventListener('pointerleave', this._onLeave);
    el.removeEventListener('contextmenu', this._onContext);
    el.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
