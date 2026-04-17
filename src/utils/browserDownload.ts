interface SavePickerAcceptOption {
  description?: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptionsLike {
  suggestedName?: string;
  types?: SavePickerAcceptOption[];
  excludeAcceptAllOption?: boolean;
}

interface SaveFilePickerHandleLike {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

type SavePickerWindow = Window & typeof globalThis & {
  showSaveFilePicker?: (options?: SaveFilePickerOptionsLike) => Promise<SaveFilePickerHandleLike>;
};

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getExtension(filename: string): string {
  const normalized = String(filename || '').trim();
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return '';
  return normalized.slice(dotIndex).toLowerCase();
}

function buildPickerTypes(blob: Blob, filename: string): SavePickerAcceptOption[] | undefined {
  const mimeType = String(blob.type || '').trim();
  const extension = getExtension(filename);
  if (!mimeType || !extension) return undefined;

  return [
    {
      description: 'Image file',
      accept: {
        [mimeType]: [extension],
      },
    },
  ];
}

export async function saveBlobWithPickerFallback(blob: Blob, filename: string): Promise<void> {
  const win = window as SavePickerWindow;
  if (typeof win.showSaveFilePicker !== 'function') {
    triggerBrowserDownload(blob, filename);
    return;
  }

  try {
    const handle = await win.showSaveFilePicker({
      suggestedName: filename,
      types: buildPickerTypes(blob, filename),
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }
    triggerBrowserDownload(blob, filename);
  }
}

