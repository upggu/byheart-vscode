import * as vscode from 'vscode';
import { booksDir, listBooks, listChapters, type BookEntry, type ChapterEntry } from './library';

interface BookItem extends vscode.QuickPickItem {
  book?: BookEntry;
  openFolder?: true;
}
interface ChapterItem extends vscode.QuickPickItem {
  chapter: ChapterEntry;
}

const isKo = () => vscode.env.language.toLowerCase().startsWith('ko');

export async function openBooksFolder(root: string): Promise<void> {
  await vscode.env.openExternal(vscode.Uri.file(booksDir(root)));
}

/** Design 5.1: book → chapter. One book skips the first step; the last item opens the folder. */
export async function pickChapter(root: string, builtin: BookEntry[]): Promise<{ book: BookEntry; chapter: ChapterEntry } | undefined> {
  const books = await listBooks(root, builtin);
  let book: BookEntry | undefined;
  if (books.length === 1) {
    book = books[0];
  } else {
    const items: BookItem[] = books.map((b) => ({ label: b.title, description: b.readOnly ? (isKo() ? '내장' : 'built-in') : undefined, book: b }));
    items.push({ label: isKo() ? '$(folder) 교재 폴더 열기' : '$(folder) Open books folder', openFolder: true });
    const chosen = await vscode.window.showQuickPick(items, { placeHolder: isKo() ? '교재를 고르세요' : 'Choose a book', matchOnDescription: true });
    if (!chosen) return undefined;
    if (chosen.openFolder) {
      await openBooksFolder(root);
      return undefined;
    }
    book = chosen.book;
  }
  if (!book) return undefined;
  const chapters = await listChapters(book);
  if (!chapters.length) {
    void vscode.window.showInformationMessage(isKo() ? `'${book.title}'에 챕터 파일(.byheart.json, .txt)이 없습니다.` : `No chapter files (.byheart.json, .txt) in '${book.title}'.`);
    return undefined;
  }
  const items: ChapterItem[] = chapters.map((c) => ({
    label: c.title,
    description: c.error ? `$(warning) ${c.error}` : c.description,
    chapter: c,
  }));
  const chosen = await vscode.window.showQuickPick(items, { placeHolder: isKo() ? '챕터를 고르세요' : 'Choose a chapter', matchOnDescription: true });
  if (!chosen) return undefined;
  if (chosen.chapter.error) {
    void vscode.window.showErrorMessage(`${chosen.chapter.ref.chapterId}: ${chosen.chapter.error}`);
    return undefined;
  }
  return { book, chapter: chosen.chapter };
}
