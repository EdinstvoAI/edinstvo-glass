export interface RotationAngles { rotationX: number; rotationY: number }

export function rotationPadding(width: number, height: number, thickness: number, x: number, y: number) {
  const a = x * Math.PI / 180, b = y * Math.PI / 180;
  const projectedWidth = Math.abs(Math.cos(b)) * width + Math.abs(Math.sin(b) * Math.sin(a)) * height + Math.abs(Math.sin(b) * Math.cos(a)) * thickness;
  const projectedHeight = Math.abs(Math.cos(a)) * height + Math.abs(Math.sin(a)) * thickness;
  return Math.ceil(Math.max(0, (projectedWidth - width) / 2, (projectedHeight - height) / 2));
}

export function dragRotation(host: HTMLElement, read: () => RotationAngles, write: (angles: RotationAngles) => void) {
  let pointer: number | null = null;
  let from = [0, 0];
  let initial: RotationAngles;
  const touchAction = host.style.touchAction;
  host.style.touchAction = "none";
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || pointer !== null) return;
    const target = event.target as Element;
    if (target.closest("button, a, input, select, textarea, [contenteditable]")) return;
    if (target.closest("[rotatable]") && target.closest("[rotatable]") !== host) return;
    pointer = event.pointerId;
    from = [event.clientX, event.clientY];
    initial = read();
    host.setPointerCapture(pointer);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    const clamp = (n: number) => Math.max(-80, Math.min(80, n));
    write({ rotationX: clamp(initial.rotationX - (event.clientY - from[1]) * 0.5), rotationY: clamp(initial.rotationY + (event.clientX - from[0]) * 0.5) });
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    if (host.hasPointerCapture(pointer)) host.releasePointerCapture(pointer);
    pointer = null;
  };
  host.addEventListener("pointerdown", down);
  host.addEventListener("pointermove", move);
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", up);
  host.addEventListener("lostpointercapture", up);
  return () => {
    if (pointer !== null && host.hasPointerCapture(pointer)) host.releasePointerCapture(pointer);
    host.removeEventListener("pointerdown", down);
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerup", up);
    host.removeEventListener("pointercancel", up);
    host.removeEventListener("lostpointercapture", up);
    host.style.touchAction = touchAction;
  };
}
