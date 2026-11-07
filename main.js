import { GameScene } from "./scenes/GameScene.js";
import { initYandexSDK } from "./systems/YandexSDK.js";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  width: 960,
  height: 640,
  backgroundColor: "#29433b",
  pixelArt: false,
  antialias: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 640
  },
  physics: {
    default: "arcade",
    arcade: { debug: false }
  },
  scene: [GameScene]
});

const sdkPromise = initYandexSDK();
window.miniFactory = {
  getSDK: () => window.ysdk || null,
  game
};

sdkPromise.then((sdk) => {
  if (sdk) window.ysdk = sdk;
  // GameScene signals readiness after its world and UI have been created.
  window.dispatchEvent(new CustomEvent("yandex-sdk-ready", { detail: sdk }));
}).catch((error) => console.warn("Yandex SDK is unavailable in local preview:", error));
