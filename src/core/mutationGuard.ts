import { realpath } from "node:fs/promises";
import path from "node:path";

export function isPathWithinOrEqual(parentPath: string, targetPath: string) {
  const relativePath = path.relative(
    path.resolve(parentPath),
    path.resolve(targetPath),
  );
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function isPathMissingError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as NodeJS.ErrnoException).code === "ENOENT" ||
      (error as NodeJS.ErrnoException).code === "ENOTDIR")
  );
}

export async function resolveRealPathForMutationGuard(targetPath: string) {
  const resolvedTargetPath = path.resolve(targetPath);
  const suffixSegments: string[] = [];
  let existingAncestorPath = resolvedTargetPath;

  while (true) {
    try {
      const realAncestorPath = await realpath(existingAncestorPath);
      return path.join(realAncestorPath, ...suffixSegments.reverse());
    } catch (error) {
      if (!isPathMissingError(error)) {
        throw error;
      }

      const parentPath = path.dirname(existingAncestorPath);
      if (parentPath === existingAncestorPath) {
        return resolvedTargetPath;
      }
      suffixSegments.push(path.basename(existingAncestorPath));
      existingAncestorPath = parentPath;
    }
  }
}

export async function assertPathOutsideExtensionRootForMutation(
  extensionRoot: string,
  targetPath: string,
) {
  const [realExtensionRoot, realTargetPath] = await Promise.all([
    resolveRealPathForMutationGuard(extensionRoot),
    resolveRealPathForMutationGuard(targetPath),
  ]);

  if (isPathWithinOrEqual(realExtensionRoot, realTargetPath)) {
    throw new Error(
      `Refusing to mutate extension install root path: ${targetPath}`,
    );
  }
}
