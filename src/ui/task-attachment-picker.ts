import { FuzzySuggestModal, TFile, type App } from 'obsidian';

export type TaskAttachmentKind = 'document' | 'image';

export interface TaskAttachmentPickerPort {
  open(
    kind: TaskAttachmentKind,
    sourcePath: string,
    onChoose: (markdown: string) => void,
  ): void;
}

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

function isImage(file: TFile): boolean {
  return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

class VaultAttachmentSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private readonly kind: TaskAttachmentKind,
    private readonly choose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder(kind === 'image' ? '选择 Vault 中的图片' : '选择 Vault 中的文档');
  }

  getItems(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((file) => (this.kind === 'image' ? isImage(file) : !isImage(file)));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.choose(file);
  }
}

export class ObsidianTaskAttachmentPicker implements TaskAttachmentPickerPort {
  constructor(private readonly app: App) {}

  open(
    kind: TaskAttachmentKind,
    sourcePath: string,
    onChoose: (markdown: string) => void,
  ): void {
    new VaultAttachmentSuggestModal(this.app, kind, (file) => {
      const link = this.app.fileManager.generateMarkdownLink(file, sourcePath);
      onChoose(kind === 'image' ? `!${link}` : link);
    }).open();
  }
}
