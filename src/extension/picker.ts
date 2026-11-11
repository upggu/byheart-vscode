import * as vscode from 'vscode';
import { listBooks, listChapters, type BookEntry, type ChapterEntry } from './library';

interface BookItem extends vscode.QuickPickItem {
  book?: BookEntry;
  editBooks?: true;
}
interface ChapterItem extends vscode.QuickPickItem {
  chapter?: ChapterEntry;
  editBooks?: true;
}

const isKo = () => vscode.env.language.toLowerCase().startsWith('ko');
const editBooksLabel = () => (isKo() ? '$(edit) 교재 편집 (폴더를 새 창으로 열기)' : '$(edit) Edit books (open the folder in a new window)');

/**
 * Design 5.1: book → chapter. One book skips the first step. The last item of
 * the first list shown runs `editBooks`, so it is reachable even with only the
 * built-in book.
 */
export async function pickChapter(root: string, builtin: BookEntry[], editBooks: () => Promise<void>): Promise<{ book: BookEntry; chapter: ChapterEntry } | undefined> {
  const books = await listBooks(root, builtin);
  let book: BookEntry | undefined;
  if (books.length === 1) {
    book = books[0];
  } else {
    const items: BookItem[] = books.map((b) => ({ label: b.title, description: b.readOnly ? (isKo() ? '내장' : 'built-in') : undefined, book: b }));
    items.push({ label: editBooksLabel(), editBooks: true });
    const chosen = await vscode.window.showQuickPick(items, { placeHolder: isKo() ? '교재를 고르세요' : 'Choose a book', matchOnDescription: true });
    if (!chosen) return undefined;
    if (chosen.editBooks) {
      await editBooks();
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
  if (books.length === 1) items.push({ label: editBooksLabel(), editBooks: true });
  const chosen = await vscode.window.showQuickPick(items, { placeHolder: isKo() ? '챕터를 고르세요' : 'Choose a chapter', matchOnDescription: true });
  if (!chosen) return undefined;
  if (chosen.editBooks || !chosen.chapter) {
    await editBooks();
    return undefined;
  }
  if (chosen.chapter.error) {
    void vscode.window.showErrorMessage(`${chosen.chapter.ref.chapterId}: ${chosen.chapter.error}`);
    return undefined;
  }
  return { book, chapter: chosen.chapter };
}
