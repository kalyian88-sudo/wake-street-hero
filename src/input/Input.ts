// STUB — replaced by the input agent. Keep the export name/signature.
import { makeStub } from '../dev/stub';
import type { ButtonState, IInput, InputFrame } from '../types';

const up = (): ButtonState => ({ down: false, pressed: false, released: false });

export function neutralInputFrame(): InputFrame {
  return { steer: 0, pitch: 0, jump: up(), trick: up(), grab: up(), handlePressed: false, heroPressed: false, pausePressed: false };
}

export function createInput(): IInput {
  const frame = neutralInputFrame();
  return makeStub<IInput>({
    poll: () => frame,
    joystick: { active: false, originX: 0, originY: 0, x: 0, y: 0 },
    touchMode: true,
  });
}
