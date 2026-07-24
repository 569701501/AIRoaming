export type DetachedPreviewWindowResult = "opened" | "blocked" | "navigation_failed";
export type PreparedDetachedPreviewWindowResult =
  | DetachedPreviewWindowResult
  | "preparation_failed";

export interface DetachedPreviewWindowHandle {
  opener: unknown;
  location: {
    replace(url: string): void;
  };
  close(): void;
}

export type DetachedPreviewWindowOpener = (
  url: string,
  target: string,
) => DetachedPreviewWindowHandle | null;

function closeDetachedPreviewWindow(previewWindow: DetachedPreviewWindowHandle): void {
  try {
    previewWindow.close();
  } catch {
    // The failed blank window is already beyond our control.
  }
}

export function openDetachedPreviewWindow(
  url: string,
  openWindow: DetachedPreviewWindowOpener = (windowUrl, target) => window.open(windowUrl, target),
): DetachedPreviewWindowResult {
  const previewWindow = openWindow("about:blank", "_blank");
  if (!previewWindow) return "blocked";

  try {
    previewWindow.opener = null;
    previewWindow.location.replace(url);
    return "opened";
  } catch {
    closeDetachedPreviewWindow(previewWindow);
    return "navigation_failed";
  }
}

export async function openDetachedPreviewWindowAfterPreparation(
  url: string,
  prepareNavigation: () => boolean | Promise<boolean>,
  openWindow: DetachedPreviewWindowOpener = (windowUrl, target) => window.open(windowUrl, target),
): Promise<PreparedDetachedPreviewWindowResult> {
  let previewWindow: DetachedPreviewWindowHandle | null = null;
  try {
    previewWindow = openWindow("about:blank", "_blank");
  } catch {
    previewWindow = null;
  }

  if (previewWindow) {
    try {
      previewWindow.opener = null;
    } catch {
      closeDetachedPreviewWindow(previewWindow);
      previewWindow = null;
    }
  }

  let ready: boolean;
  try {
    ready = await prepareNavigation();
  } catch {
    if (previewWindow) closeDetachedPreviewWindow(previewWindow);
    return "preparation_failed";
  }
  if (!ready) {
    if (previewWindow) closeDetachedPreviewWindow(previewWindow);
    return "preparation_failed";
  }
  if (!previewWindow) return "blocked";

  try {
    previewWindow.location.replace(url);
    return "opened";
  } catch {
    closeDetachedPreviewWindow(previewWindow);
    return "navigation_failed";
  }
}
