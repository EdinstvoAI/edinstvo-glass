export interface Interaction {
  follow: number;
  press: number;
  stretch: number;
}

export const interactions = {
  none: { follow: 0, press: 0, stretch: 0 },
  calm: { follow: 0.5, press: 0.4, stretch: 0 },
  lively: { follow: 1, press: 1, stretch: 1 },
} as const satisfies Record<string, Interaction>;

export type InteractionName = keyof typeof interactions;

export class Spring {
  value: number;
  target: number;
  private velocity = 0;

  constructor(value = 0, private stiffness = 260, private damping = 20) {
    this.value = this.target = value;
  }

  step(dt: number) {
    this.velocity += ((this.target - this.value) * this.stiffness - this.velocity * this.damping) * dt;
    this.value += this.velocity * dt;
    if (this.settled) {
      this.value = this.target;
      this.velocity = 0;
    }
  }

  get settled() {
    return Math.abs(this.target - this.value) < 0.001 && Math.abs(this.velocity) < 0.01;
  }
}

export class Motion {
  x = new Spring();
  y = new Spring();
  held = new Spring();
  private springs = [this.x, this.y, this.held];
  private cleanup: (() => void) | null = null;

  constructor(private host: HTMLElement, private wake: () => void) {}

  get moving() {
    return this.springs.some((spring) => !spring.settled);
  }

  attach() {
    const { host } = this;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      this.x.target = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.y.target = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      this.wake();
    };
    const leave = () => {
      this.x.target = this.y.target = this.held.target = 0;
      this.wake();
    };
    const down = () => {
      this.held.target = 1;
      this.wake();
    };
    const up = () => {
      this.held.target = 0;
      this.wake();
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointerdown", down);
    addEventListener("pointerup", up);
    this.cleanup = () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointerdown", down);
      removeEventListener("pointerup", up);
    };
  }

  detach() {
    this.cleanup?.();
    this.cleanup = null;
    this.host.style.scale = "";
  }

  step(dt: number, interaction: Interaction) {
    for (const spring of this.springs) spring.step(dt);
    const grow = this.held.value * interaction.press * 0.05;
    const pull = this.held.value * interaction.stretch * 0.04;
    const sideways = Math.abs(this.x.value) - Math.abs(this.y.value);
    const scaleX = 1 + grow + pull * sideways;
    const scaleY = 1 + grow - pull * sideways;
    this.host.style.scale = scaleX === 1 && scaleY === 1 ? "" : `${scaleX} ${scaleY}`;
  }
}
