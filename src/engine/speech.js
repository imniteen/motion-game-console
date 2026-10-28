// Reading instructions out loud, for kids who can't read yet. Uses only the voices built into this computer
// (voice.localService): some browsers also offer online voices, which would send the text to a server, so
// those are never used. If there is no local voice, nothing is said (the text and animation still show).
let voice = null;
let enabled = true;
let picked = false;

function pick() {
  const synth = globalThis.speechSynthesis;
  if (!synth) return null;
  const local = synth.getVoices().filter((v) => v.localService && /^en/i.test(v.lang));
  // friendly, clear voices first when the computer has them
  const prefer = ['Samantha', 'Karen', 'Moira', 'Tessa', 'Daniel', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Zira'];
  voice = prefer.map((n) => local.find((v) => v.name.startsWith(n))).find(Boolean) ?? local[0] ?? null;
  picked = true;
  return voice;
}

globalThis.speechSynthesis?.addEventListener?.('voiceschanged', pick);

export function setVoiceEnabled(on) {
  enabled = on;
  if (!on) globalThis.speechSynthesis?.cancel();
}

/**
 * Say something. `interrupt` cuts off whatever is being said (a new screen); otherwise it waits its turn.
 * @param {string} text
 * @param {{ interrupt?: boolean }} [o]
 */
export function say(text, { interrupt = false } = {}) {
  const synth = globalThis.speechSynthesis;
  if (!enabled || !synth || !text) return;
  if (!picked || !voice) pick();
  if (!voice) return;
  if (interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.95;
  u.pitch = 1.1;
  synth.speak(u);
}

export function hush() {
  globalThis.speechSynthesis?.cancel();
}

export const speaking = () => !!globalThis.speechSynthesis?.speaking;
