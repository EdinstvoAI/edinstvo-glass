export interface Interaction {
  follow: number;
  press: number;
  stretch: number;
}

export const interactions = {
  none: { follow: 0, press: 0, stretch: 0 },
  calm: { follow: 0.5, press: 0.4, stretch: 0.4 },
  lively: { follow: 1, press: 1, stretch: 1 },
} as const satisfies Record<string, Interaction>;

export type InteractionName = keyof typeof interactions;

export class Spring {
  value: number;
  target: number;
  velocity = 0;

  constructor(value = 0, private stiffness = 260, private damping = 20) {
    this.value = this.target = value;
  }

  step(dt: number) {
    this.velocity += ((this.target - this.value) * this.stiffness - this.velocity * this.damping) * dt;
    this.value += this.velocity * dt;
    if (this.settled) this.snap(this.target);
  }

  snap(value: number) {
    this.value = this.target = value;
    this.velocity = 0;
  }

  shift(delta: number) {
    this.value += delta;
    this.target += delta;
  }

  get settled() {
    return Math.abs(this.target - this.value) < 0.01 && Math.abs(this.velocity) < 0.05;
  }
}

const liquid = () => new Spring(0, 190, 15);
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export interface ShapeBox { x: number; y: number; halfW: number; halfH: number; radius: number }

export class Shape {
  x = liquid();
  y = liquid();
  w = liquid();
  h = liquid();
  pointerX = new Spring();
  pointerY = new Spring();
  held = new Spring(0, 320, 22);
  glow = new Spring(0, 60, 14);
  touchX = 0;
  touchY = 0;
  radius = 0;
  placed = false;
  private springs = [this.x, this.y, this.w, this.h, this.pointerX, this.pointerY, this.held, this.glow];
  private cleanup: (() => void) | null = null;

  constructor(readonly element: HTMLElement, private wake: () => void) {}

  get moving() {
    return this.springs.some((spring) => !spring.settled);
  }

  get pressed() {
    return this.held.target === 1;
  }

  attach() {
    const { element } = this;
    const aim = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      this.pointerX.target = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, 1);
      this.pointerY.target = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, 1);
      this.touchX = event.clientX;
      this.touchY = event.clientY;
      this.wake();
    };
    const leave = () => {
      if (this.pressed) return;
      this.pointerX.target = this.pointerY.target = 0;
      this.wake();
    };
    const down = (event: PointerEvent) => {
      aim(event);
      this.held.target = 1;
      this.glow.target = 1;
      this.wake();
      addEventListener("pointermove", aim);
    };
    const up = () => {
      if (!this.pressed) return;
      removeEventListener("pointermove", aim);
      this.held.target = this.glow.target = 0;
      this.pointerX.target = this.pointerY.target = 0;
      this.wake();
    };
    element.addEventListener("pointermove", aim);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointerdown", down);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    this.cleanup = () => {
      element.removeEventListener("pointermove", aim);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointerdown", down);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      removeEventListener("pointermove", aim);
    };
  }

  detach() {
    this.cleanup?.();
    this.cleanup = null;
    this.element.style.removeProperty("--glass-scale");
  }

  read(rect: DOMRect, scrolled: boolean, animate: boolean, grow: boolean) {
    const { x, y, w, h } = this;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (!this.placed || !animate) {
      x.snap(cx);
      y.snap(cy);
      if (this.placed || !grow || !animate) {
        w.snap(rect.width);
        h.snap(rect.height);
      } else {
        w.target = rect.width;
        h.target = rect.height;
      }
      this.placed = true;
      return;
    }
    if (scrolled) {
      x.shift(cx - x.target);
      y.shift(cy - y.target);
    }
    x.target = cx;
    y.target = cy;
    w.target = rect.width;
    h.target = rect.height;
  }

  step(dt: number) {
    for (const spring of this.springs) spring.step(dt);
  }

  box(interaction: Interaction, scale: number): ShapeBox {
    const swell = 1 + this.held.value * interaction.press * 0.06;
    const pull = this.held.value * interaction.stretch * 0.06 * (Math.abs(this.pointerX.value) - Math.abs(this.pointerY.value));
    const speedX = clamp(this.x.velocity / 2400, 0.22) * interaction.stretch;
    const speedY = clamp(this.y.velocity / 2400, 0.22) * interaction.stretch;
    const squash = Math.abs(speedX) - Math.abs(speedY);
    const halfW = Math.max(this.w.value, 0) / 2 * swell * (1 + pull + squash) * scale;
    const halfH = Math.max(this.h.value, 0) / 2 * swell * (1 - pull - squash) * scale;
    this.element.style.setProperty("--glass-scale", swell.toFixed(4));
    return { x: this.x.value, y: this.y.value, halfW, halfH, radius: Math.min(this.radius, halfW, halfH) };
  }
}
