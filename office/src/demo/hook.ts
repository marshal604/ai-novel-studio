// ?demo: the recorder (art/record.mjs) calls __demo.advance(1) then screenshots, so the capture is a
// perfectly smooth 60 fps regardless of machine speed (adapted from digimon-survivor/src/demo).
import type Phaser from 'phaser';

const DT = 1 / 60;

interface Host {
  game: Phaser.Game;
  /** advance the sim and redraw by dt seconds */
  step: (dt: number) => void;
  done: () => boolean;
}

export function installDemo(h: Host) {
  let frame = 0;
  const ready = setInterval(() => {
    if (!h.game.scene.isActive('office')) return;
    clearInterval(ready);
    // stop Phaser's own clock: every frame is rendered on demand by advance()
    h.game.loop.sleep();
    Object.assign(window, {
      __demo: {
        advance(n = 1) {
          for (let i = 0; i < n; i++) {
            h.step(DT);
            frame++;
          }
          h.game.step(performance.now(), DT * 1000);
          return { t: frame / 60, done: h.done() };
        },
      },
    });
  }, 50);
}
