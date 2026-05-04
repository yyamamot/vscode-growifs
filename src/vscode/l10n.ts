type VscodeL10n = {
  t?(message: string, ...args: Array<string | number | boolean>): string;
};

type VscodeModule = {
  l10n?: VscodeL10n;
};

function formatMessage(
  message: string,
  args: Array<string | number | boolean>,
): string {
  return message.replace(/\{(\d+)\}/g, (match, indexText) => {
    const index = Number(indexText);
    return args[index] === undefined ? match : String(args[index]);
  });
}

export function localize(
  message: string,
  ...args: Array<string | number | boolean>
): string {
  const l10n = loadVscodeL10n();
  return typeof l10n?.t === "function"
    ? l10n.t(message, ...args)
    : formatMessage(message, args);
}

function loadVscodeL10n(): VscodeL10n | undefined {
  try {
    const requireFn = new Function("return require")() as (
      name: string,
    ) => VscodeModule;
    return requireFn("vscode").l10n;
  } catch {
    return undefined;
  }
}
