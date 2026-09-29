export function isFullscreenElement(element) {
  return Boolean(element) && document.fullscreenElement === element;
}

export function canRequestFullscreen(element) {
  return Boolean(element?.requestFullscreen);
}

export async function requestElementFullscreen(element) {
  if (!canRequestFullscreen(element) || isFullscreenElement(element)) {
    return false;
  }

  try {
    await element.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

export async function exitBrowserFullscreen() {
  if (!document.fullscreenElement || !document.exitFullscreen) {
    return false;
  }

  try {
    await document.exitFullscreen();
    return true;
  } catch {
    return false;
  }
}
