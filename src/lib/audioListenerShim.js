// AudioListener shim for p5.sound 0.2 (Tone.js core).
//
// Tone creates a global Listener on audio-context init and wraps
// `listener.positionX` … `upZ` as AudioParams. Browsers still on the
// legacy AudioListener (no AudioParams, e.g. Firefox) make that throw
// "param must be an AudioParam" on the first loadSound — killing all
// audio before it starts. Mint inert stand-in params from the context
// itself so init succeeds; positional audio simply does nothing there.
//
// Runs on import — must be imported before anything creates audio nodes.
// Strictly additive: browsers with real AudioParams are untouched.
const PARAM_KEYS = [
  'positionX', 'positionY', 'positionZ',
  'forwardX', 'forwardY', 'forwardZ',
  'upX', 'upY', 'upZ',
];

const needsShim = (listener) => {
  if (!listener || typeof window.AudioParam !== 'function') return false;
  return PARAM_KEYS.some((key) => {
    try {
      return !(listener[key] instanceof window.AudioParam);
    } catch {
      return true;
    }
  });
};

const patchListenerSource = (Ctor) => {
  if (!Ctor || !Ctor.prototype) return;
  const desc = Object.getOwnPropertyDescriptor(Ctor.prototype, 'listener');
  if (!desc || typeof desc.get !== 'function') return;
  try {
    Object.defineProperty(Ctor.prototype, 'listener', {
      get() {
        const listener = desc.get.call(this);
        if (needsShim(listener)) {
          for (const key of PARAM_KEYS) {
            try {
              Object.defineProperty(listener, key, {
                value: this.createGain().gain,
                configurable: true,
              });
            } catch {
              // ignore — Tone will surface real failures
            }
          }
        }
        return listener;
      },
      configurable: true,
    });
  } catch {
    // ignore — non-standard AudioContext implementation
  }
};

if (typeof window !== 'undefined') {
  patchListenerSource(window.AudioContext);
  patchListenerSource(window.OfflineAudioContext);
  patchListenerSource(window.webkitAudioContext);
}
