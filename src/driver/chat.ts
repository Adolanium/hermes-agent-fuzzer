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

export async function clickComposerSend(page: Page): Promise<boolean> {
  return evalInPage<boolean>(
    page,
    `var root = document.querySelector('[data-slot="composer-root"]') || document.querySelector('[data-slot="composer-dock"]') || document;
     var send = root.querySelector('button[type="submit"]');
     if (!send) return false;
     send.disabled = false;
     send.removeAttribute('disabled');
     send.click();
     return true;`,
  )
}

export async function pressComposerEnter(page: Page): Promise<boolean> {
  return evalInPage<boolean>(
    page,
    `var editor = document.querySelector('[data-slot="composer-rich-input"]');
     if (!editor) return false;
     editor.focus();
     var ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
     editor.dispatchEvent(ev);
     return true;`,
  )
}

export async function submitComposer(page: Page, text: string): Promise<boolean> {
  const editor = page.locator('[data-slot="composer-rich-input"]').first()
  if ((await editor.count()) === 0) {
    return false
  }
  try {
    await editor.click({ timeout: 2000 })
    await page.keyboard.type(text.slice(0, 200), { delay: 2 })
    await page.keyboard.press('Enter')
    return true
  } catch {
    const inserted = await insertComposerText(page, text)
    if (!inserted) {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
    const sent = await clickComposerSend(page)
    if (sent) {
      return true
    }
    return pressComposerEnter(page)
  }
}

export function composerLooksSendable(contentEditable: string | null, placeholder: string): boolean {
  if (contentEditable === 'false') {
    return false
  }
  const ph = placeholder.toLowerCase()
  return !ph.includes('starting hermes') && !ph.includes('reconnecting')
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
