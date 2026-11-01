// The Settings dialog: global Sound and Motion switches, opened from the
// top bar on the hub and on every game's home screen.
//
// Uses a native <dialog> (focus stays inside, Esc closes it, focus returns
// to the Settings button). The switches show and change the shared settings.

import { settings } from './settings.js';

/**
 * @param {{ open: HTMLElement, dialog: HTMLDialogElement, sound: HTMLElement, motion: HTMLElement, motionNote: HTMLElement }} elements
 */
export function createSettingsView({ open, dialog, sound, motion, motionNote }) {
  open.addEventListener('click', () => {
    dialog.showModal();
    sound.focus();
  });

  // A click on the dimmed backdrop (outside the panel) closes it too.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  sound.addEventListener('click', () => settings.setSound(!settings.sound));
  motion.addEventListener('click', () => settings.setMotion(!settings.motion));

  settings.subscribe((s) => {
    show(sound, s.sound);
    show(motion, s.motion);
    motionNote.hidden = !(s.motion && s.deviceReducesMotion());
  });
}

function show(button, on) {
  button.setAttribute('aria-checked', String(on));
  button.querySelector('.switch-state').textContent = on ? 'ON' : 'OFF';
}
