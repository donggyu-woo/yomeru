importScripts('shared.js');

const NAVER_DICT = {
  en: 'https://en.dict.naver.com/#/search?query=',
  ja: 'https://ja.dict.naver.com/#/search?query=',
};

// register the right-click menu on browser extension install or update
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'yomeru-translate',
    title: '"%s" 번역',
    contexts: ['selection'],
  });
});

// when the user clicks the translate menu, ask content.js to show the result
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'yomeru-translate' || tab?.id == null) return;
  chrome.tabs
    .sendMessage(tab.id, { type: 'translate-selection', text: info.selectionText }, { frameId: info.frameId })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // open the '네이버 사전' popup
  if (msg?.type === 'open-dict' && NAVER_DICT[msg.lang]) {
    chrome.windows.create({
      url: NAVER_DICT[msg.lang] + encodeURIComponent(msg.text),
      type: 'popup',
      width: 560,
      height: 760,
    });
    return;
  }
  if (msg?.type !== 'translate') return;
  translate(msg.text).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, error: err?.message ?? String(err) }),
  );
  return true;
});

async function translate(text) {
  const source = detectLang(text);
  if (!source) throw new Error('일본어 또는 영어 텍스트만 찾을 수 있습니다.');
  return googleTranslate(text, source);
}

async function googleTranslate(text, source) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', source);
  url.searchParams.set('tl', 'ko');
  url.searchParams.append('dt', 't');
  url.searchParams.append('dt', 'bd');

  const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ q: text }) });
  if (!res.ok) throw new Error(`Google 번역 요청 실패 (${res.status})`);
  const data = await res.json();

  return {
    provider: 'Google 번역',
    text: (data[0] ?? []).map((seg) => seg[0] ?? '').join(''),
    detected: source,
    target: 'ko',
    dict: (data[1] ?? []).map(([pos, terms]) => ({ pos, terms: terms.slice(0, 6) })),
  };
}
