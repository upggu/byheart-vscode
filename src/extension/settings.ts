import { isAbsolute, join, resolve } from 'node:path';

/** Design 5.1: '' → <home>/.byheart, '~/x' → <home>/x, relative → <home>/<rel>, absolute as is. */
export function resolveRoot(folderSetting: string, homedir: string): string {
  const value = folderSetting.trim();
  if (!value) return join(homedir, '.byheart');
  if (value === '~') return homedir;
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir, value.slice(2));
  if (isAbsolute(value)) return resolve(value);
  return join(homedir, value);
}
