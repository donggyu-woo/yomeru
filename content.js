(() => {
  const MAX_CHARS = 3000;

  let { triggerMode } = DEFAULT_SETTINGS;
  let current = null;
  let requestId = 0;

  chrome.storage.local.get(DEFAULT_SETTINGS).then((s) => (triggerMode = s.triggerMode));
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.triggerMode) triggerMode = changes.triggerMode.newValue;
  });

  const host = document.createElement('yomeru-root');
  host.style.cssText =
    'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host {
        --bg: #ffffff; --fg: #1f2328; --muted: #656d76; --line: #d0d7de; --accent: #0969da;
      }
      @media (prefers-color-scheme: dark) {
        :host { --bg: #1f2428; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --accent: #4493f8; }
      }
      [hidden] { display: none !important; }
      .trigger {
        position: absolute; width: 26px; height: 26px; padding: 0;
        border: 1px solid var(--line); border-radius: 6px;
        background: var(--bg); color: var(--accent);
        font: 600 14px/1 system-ui, sans-serif; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, .18);
      }
      .trigger:hover { border-color: var(--accent); }
      .panel {
        position: absolute; box-sizing: border-box;
        width: max-content; min-width: 200px; max-width: min(420px, calc(100vw - 16px));
        max-height: 50vh; overflow: auto; padding: 10px 12px;
        border: 1px solid var(--line); border-radius: 10px;
        background: var(--bg); color: var(--fg);
        font: 14px/1.55 system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .2);
      }
      .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .meta { flex: 1; font-size: 11px; color: var(--muted); }
      .dict-link {
        border: 1px solid #03a94d80; border-radius: 5px; background: transparent;
        color: #03a94d; font: 11px system-ui, sans-serif; padding: 1px 7px; cursor: pointer;
      }
      .dict-link:hover { color: var(--fg); }
      .body { white-space: pre-wrap; word-break: break-word; font-size: 13px; font-weight: 600; }
      .body.error { color: #cf222e; font-size: 13px; font-weight: 400; }
      .body:not(.error)::before { content: '* '; }
      .body:empty { display: none; }
      .dict { margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid var(--line); list-style: none; }
      .dict:empty { display: none; }
      .dict li { font-size: 13px; margin: 2px 0; }
      .dict b { color: var(--accent); font-weight: 600; margin-right: 4px; }
    </style>
    <button class="trigger" type="button" title="번역 (yomeru)" hidden>訳</button>
    <div class="panel" role="dialog" hidden>
      <div class="head">
        <span class="meta"></span>
        <button class="dict-link" type="button" hidden>네이버 사전</button>
      </div>
      <div class="body"></div>
      <ul class="dict"></ul>
    </div>`;

  const triggerBtn = shadow.querySelector('.trigger');
  const panel = shadow.querySelector('.panel');
  const meta = shadow.querySelector('.meta');
  const dictBtn = shadow.querySelector('.dict-link');
  const body = shadow.querySelector('.body');
  const dictList = shadow.querySelector('.dict');

  const langNames = (() => {
    try {
      return new Intl.DisplayNames(['ko'], { type: 'language' });
    } catch {
      return null;
    }
  })();
  const langName = (code) => {
    try {
      return langNames?.of(code) ?? code;
    } catch {
      return code;
    }
  };

  function readSelection(point = null) {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || sel.rangeCount === 0) return null;
    return { text: text.slice(0, MAX_CHARS), range: sel.getRangeAt(0).cloneRange(), point };
  }

  function rangeRect(sel) {
    const rects = sel.range ? [...sel.range.getClientRects()].filter((r) => r.width > 0) : [];
    return rects.at(-1) ?? null;
  }

  function anchorRect(sel) {
    return (
      rangeRect(sel) ??
      (sel.point && new DOMRect(sel.point.x, sel.point.y, 0, 0)) ??
      new DOMRect(window.innerWidth / 2 - 150, 60, 0, 0)
    );
  }

  function show(el) {
    if (!host.isConnected) document.documentElement.appendChild(host);
    el.hidden = false;
  }

  function placeTrigger(rect) {
    show(triggerBtn);
    triggerBtn.style.left = `${Math.max(8, Math.min(rect.right, window.innerWidth - 34))}px`;
    triggerBtn.style.top = `${rect.bottom + 4}px`;
  }

  function placePanel(rect) {
    show(panel);
    const { offsetWidth: w, offsetHeight: h } = panel;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 16));
    const fitsBelow = rect.bottom + h + 12 < window.innerHeight;
    const top = fitsBelow || rect.top < h + 12 ? rect.bottom + 6 : rect.top - h - 6;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function reposition() {
    if (!current || (triggerBtn.hidden && panel.hidden)) return;
    const rect = rangeRect(current);
    if (!rect) return hideAll();
    if (!triggerBtn.hidden) placeTrigger(rect);
    if (!panel.hidden) placePanel(rect);
  }

  function hideAll() {
    requestId++;
    triggerBtn.hidden = true;
    panel.hidden = true;
  }

  async function showTranslation(sel) {
    const id = ++requestId;
    triggerBtn.hidden = true;
    meta.textContent = '번역 중…';
    body.textContent = '';
    body.classList.remove('error');
    dictList.replaceChildren();
    dictBtn.hidden = !isWord(sel.text, detectLang(sel.text));
    placePanel(anchorRect(sel));

    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'translate', text: sel.text });
    } catch {
      res = { ok: false, error: '확장 프로그램이 다시 로드되었습니다. 페이지를 새로고침해 주세요.' };
    }
    if (id !== requestId) return;

    if (!res?.ok) {
      meta.textContent = '번역 실패';
      body.textContent = res?.error ?? '알 수 없는 오류가 발생했습니다.';
      body.classList.add('error');
    } else {
      const r = res.result;
      meta.textContent = `${r.provider} · ${langName(r.detected)} → ${langName(r.target)}`;
      body.textContent = r.text;
      for (const { pos, terms } of r.dict ?? []) {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = pos;
        li.append(b, terms.join(', '));
        dictList.append(li);
      }
    }
    placePanel(anchorRect(sel));
  }

  const fromUs = (e) => e.composedPath().includes(host);

  document.addEventListener('mousedown', (e) => {
    if (!fromUs(e)) hideAll();
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || fromUs(e) || triggerMode === 'menu') return;
    const point = { x: e.clientX, y: e.clientY };
    setTimeout(() => {
      const sel = readSelection(point);
      if (!sel || !detectLang(sel.text)) return;
      current = sel;
      if (triggerMode === 'auto') showTranslation(sel);
      else placeTrigger(anchorRect(sel));
    }, 10);
  });

  document.addEventListener('scroll', reposition, { capture: true, passive: true });
  window.addEventListener('resize', reposition);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAll();
  });

  triggerBtn.addEventListener('mousedown', (e) => e.preventDefault());
  triggerBtn.addEventListener('click', () => current && showTranslation(current));

  dictBtn.addEventListener('click', () => {
    if (!current) return;
    chrome.runtime.sendMessage({ type: 'open-dict', text: current.text, lang: detectLang(current.text) });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'translate-selection') return;
    const sel =
      readSelection() ?? (msg.text && { text: msg.text.slice(0, MAX_CHARS), range: null, point: null });
    if (sel) {
      current = sel;
      showTranslation(sel);
    }
  });
})();
