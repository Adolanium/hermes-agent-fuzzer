import type { Page } from 'playwright'

import { isDenied } from '../safety/denylist.ts'
import { ACTIONABLE_ROLES, HASH_ROUTES, type ActionLocator, type ModelView, type UiSnapshot, type Widget, type WindowKind } from '../types.ts'
import { evalInPage } from './eval.ts'
import { EDITABLE_ROLES, isJunkWidget, ROLE_SELECTORS, type RawWidget, withNameNth } from './widgets.ts'

export function routeFromUrl(url: string): string {
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1) {
    return '/'
  }
  const hash = url.slice(hashIndex + 1)
  if (!hash) {
    return '/'
  }
  return hash.startsWith('/') ? hash : `/${hash}`
}

export function routePath(route: string): string {
  const cut = route.search(/[?#]/)
  return cut === -1 ? route : route.slice(0, cut)
}

function isHashRoute(route: string): route is (typeof HASH_ROUTES)[number] {
  return (HASH_ROUTES as readonly string[]).includes(route)
}

export function previewBody(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const overlay = flat.match(
    /let'?s get you setup.{0,140}|i'?ll choose a provider later.{0,80}|connect a model provider.{0,80}|no inference provider is configured.{0,80}/i,
  )
  if (overlay?.[0]) {
    return overlay[0].slice(0, 180)
  }
  return flat.slice(0, 180)
}

export function looksLikeOnboarding(text: string): boolean {
  if (
    /let'?s get you setup|i'?ll choose a provider later|connect a model provider|no inference provider is configured|choose a provider later/i.test(
      text,
    )
  ) {
    return true
  }
  const picker = /choose a provider|add a provider|pick a provider|looking up providers/i.test(text)
  if (picker && !/new session/i.test(text)) {
    return true
  }
  return /starting hermes/i.test(text) && !/new session/i.test(text)
}

export function classifyView(route: string, extras: { dialog: boolean; palette: boolean; window: WindowKind }): ModelView {
  route = routePath(route)
  if (extras.window === 'hud') {
    return 'hud'
  }
  if (extras.window === 'quick') {
    return 'quick'
  }
  if (extras.palette) {
    return 'palette'
  }
  if (extras.dialog) {
    return 'dialog'
  }
  if (isHashRoute(route)) {
    if (route === '/') {
      return 'chat'
    }
    return route.slice(1) as ModelView
  }
  if (route === '/') {
    return 'chat'
  }
  if (/^\/[^/]+$/.test(route)) {
    const segment = route.slice(1)
    const looksLikeSession = /[0-9]/.test(segment) || segment.includes('-') || segment.length > 20
    return looksLikeSession ? 'chat' : 'extension'
  }
  return 'extension'
}

type DomScan = {
  title: string
  bodyText: string
  dialogTitle: string | null
  paletteVisible: boolean
  widgets: RawWidget[]
}

const SCAN_BODY = `
  var roles = arg.roles;
  var selectors = arg.selectors;
  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    var style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
    var box = el.getBoundingClientRect();
    return box.width >= 2 && box.height >= 2 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
  }
  function nameOf(el) {
    var labeled = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '')
      .replace(/\\s+/g, ' ')
      .trim();
    if (labeled) return labeled.slice(0, 60);
    var text = (el.innerText || '').replace(/\\s+/g, ' ').trim();
    if (text.length > 0 && text.length <= 48) return text;
    return '';
  }
  var widgets = [];
  var seen = [];
  function already(el) {
    for (var i = 0; i < seen.length; i++) if (seen[i] === el) return true;
    return false;
  }
  for (var r = 0; r < roles.length; r++) {
    var role = roles[r];
    var selector = selectors[role];
    if (!selector) continue;
    var nodes = document.querySelectorAll(selector);
    var kept = 0;
    for (var n = 0; n < nodes.length && kept < 30; n++) {
      var node = nodes[n];
      if (already(node) || !visible(node)) continue;
      seen.push(node);
      var nodeBox = node.getBoundingClientRect();
      widgets.push({
        role: role,
        name: nameOf(node) || role,
        editable: role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton',
        x: Math.round(nodeBox.left + nodeBox.width / 2),
        y: Math.round(nodeBox.top + nodeBox.height / 2),
        testid: node.getAttribute('data-testid') || node.getAttribute('data-test-id') || ''
      });
      kept++;
    }
  }
  var edits = document.querySelectorAll('[contenteditable="true"]');
  var editKept = 0;
  for (var e = 0; e < edits.length && editKept < 8; e++) {
    var edit = edits[e];
    if (already(edit) || !visible(edit)) continue;
    seen.push(edit);
    var editBox = edit.getBoundingClientRect();
    widgets.push({
      role: 'textbox',
      name: nameOf(edit) || 'composer',
      editable: true,
      x: Math.round(editBox.left + editBox.width / 2),
      y: Math.round(editBox.top + editBox.height / 2),
      testid: edit.getAttribute('data-testid') || edit.getAttribute('data-test-id') || ''
    });
    editKept++;
  }
  var dialog = document.querySelector('[role="dialog"]');
  var dialogTitle = null;
  if (dialog) {
    dialogTitle = (dialog.getAttribute('aria-label') || dialog.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 80) || null;
  }
  return {
    title: document.title,
    bodyText: ((document.getElementById('root') && document.getElementById('root').innerText) || '').slice(0, 2000),
    dialogTitle: dialogTitle,
    paletteVisible: Boolean(document.querySelector('[cmdk-root], [data-slot="command"]')),
    widgets: widgets
  };
`

async function scanDom(page: Page): Promise<DomScan> {
  return evalInPage<DomScan, { roles: string[]; selectors: Record<string, string> }>(page, SCAN_BODY, {
    roles: [...ACTIONABLE_ROLES],
    selectors: { ...ROLE_SELECTORS },
  })
}

function toWidgets(raw: RawWidget[], window: WindowKind, unsafeSurfaces: boolean): Widget[] {
  const named = withNameNth(
    raw.filter((item) => !isDenied(item.name, 'click', unsafeSurfaces) && !isJunkWidget(item.name, item.role)),
  )
  return named.map((item) => {
    let locator: ActionLocator
    if (item.testid) {
      locator = { strategy: 'testid', testid: item.testid, nth: item.nth, window }
    } else if (item.editable && item.role === 'textbox' && item.name === 'composer') {
      locator = { strategy: 'css', css: '[contenteditable="true"]', nth: item.nth, window }
    } else {
      locator = { strategy: 'role', role: item.role, name: item.name, nth: item.nth, window }
    }
    return {
      locator,
      role: item.role,
      name: item.name,
      editable: item.editable || EDITABLE_ROLES.has(item.role),
      x: item.x,
      y: item.y,
    }
  })
}

export async function snapshotWindow(page: Page, window: WindowKind, unsafeSurfaces: boolean): Promise<UiSnapshot> {
  const url = page.url()
  const route = routeFromUrl(url)
  const scan = await scanDom(page)
  let bootPhase = 'ready'
  if (/connecting|starting|booting|resolving hermes/i.test(scan.bodyText) && !/new session/i.test(scan.bodyText)) {
    bootPhase = 'boot'
  } else if (looksLikeOnboarding(scan.bodyText)) {
    bootPhase = 'onboard'
  } else if (/something broke|error boundary|no queryclient/i.test(scan.bodyText)) {
    bootPhase = 'error'
  }
  const widgets = toWidgets(scan.widgets, window, unsafeSurfaces)
  const view = classifyView(route, {
    dialog: Boolean(scan.dialogTitle),
    palette: scan.paletteVisible,
    window,
  })
  return {
    window,
    url,
    title: scan.title,
    route,
    view: bootPhase === 'boot' ? 'boot' : bootPhase === 'onboard' ? 'onboard' : view,
    dialogTitle: scan.dialogTitle,
    bootPhase,
    bodyPreview: previewBody(scan.bodyText),
    widgets,
    roleNames: [...new Set(widgets.map((w) => `${w.role}:${w.name}`))].sort(),
  }
}

export async function snapshotAll(pages: Map<WindowKind, Page>, unsafeSurfaces: boolean): Promise<UiSnapshot[]> {
  const snaps: UiSnapshot[] = []
  for (const [kind, page] of pages) {
    if (page.isClosed()) {
      continue
    }
    snaps.push(await snapshotWindow(page, kind, unsafeSurfaces))
  }
  return snaps
}
