import type { Page } from 'playwright'

import { evalInPage } from './eval.ts'

export async function composerPresent(page: Page): Promise<boolean> {
  return evalInPage<boolean>(
    page,
    'return Boolean(document.querySelector(\'[data-slot="composer-rich-input"]\'))',
  )
}

export async function insertComposerText(page: Page, text: string): Promise<boolean> {
  return evalInPage<boolean, string>(
    page,
    `var editor = document.querySelector('[data-slot="composer-rich-input"]');
     if (!editor) return false;
     editor.focus();
     editor.innerText = arg;
     editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: arg }));
     return true;`,
    text,
  )
}

export async function composerSendable(page: Page): Promise<boolean> {
  return evalInPage<boolean>(
    page,
    `var editor = document.querySelector('[data-slot="composer-rich-input"]');
     if (!editor) return false;
     var ph = editor.getAttribute('data-placeholder') || '';
     var editable = editor.getAttribute('contenteditable');
     if (editable === 'false') return false;
     ph = ph.toLowerCase();
     if (ph.indexOf('starting hermes') !== -1 || ph.indexOf('reconnecting') !== -1) return false;
     return true;`,
  )
}

export async function waitForComposer(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (page.isClosed()) {
      return false
    }
    if (await composerSendable(page).catch(() => false)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return composerPresent(page).catch(() => false)
}
