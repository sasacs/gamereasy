let sdkInstance = null;
let readyRequested = false;
let gameplayActive = false;

export async function initYandexSDK() {
  if (!window.YaGames || typeof window.YaGames.init !== "function") return null;
  try {
    sdkInstance = await window.YaGames.init();
    window.ysdk = sdkInstance;
    console.info("Yandex Games SDK initialized");
    if (readyRequested) sdkInstance.features?.LoadingAPI?.ready?.();
    if (gameplayActive) sdkInstance.features?.GameplayAPI?.start?.();
    return sdkInstance;
  } catch (error) {
    console.warn("Yandex Games SDK initialization failed:", error);
    return null;
  }
}

export function signalGameReady() {
  readyRequested = true;
  (sdkInstance || window.ysdk)?.features?.LoadingAPI?.ready?.();
}

export function signalGameplayStart() {
  gameplayActive = true;
  (sdkInstance || window.ysdk)?.features?.GameplayAPI?.start?.();
}

export function signalGameplayStop() {
  gameplayActive = false;
  (sdkInstance || window.ysdk)?.features?.GameplayAPI?.stop?.();
}

export function showRewardedVideo({ onReward, onOpen, onClose, onError } = {}) {
  const sdk = sdkInstance || window.ysdk;
  if (!sdk?.adv?.showRewardedVideo) {
    onError?.(new Error("Реклама доступна после публикации на Яндекс Играх."));
    return false;
  }
  sdk.adv.showRewardedVideo({
    callbacks: {
      onOpen: () => onOpen?.(),
      onRewarded: () => onReward?.(),
      onClose: (wasShown) => onClose?.(wasShown),
      onError: (error) => onError?.(error)
    }
  });
  return true;
}
