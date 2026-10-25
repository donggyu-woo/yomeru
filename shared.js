const DEFAULT_SETTINGS = { triggerMode: 'button' };

function detectLang(text) {
  if (/[぀-ヿㇰ-ㇿｦ-ﾟ㐀-䶿一-鿿]/.test(text)) return 'ja';
  if (/[a-zA-Z]/.test(text) && !/[가-힣]/.test(text)) return 'en';
  return null;
}

function isWord(text, lang) {
  if (lang === 'ja') return text.length <= 20 && !/[\s。、！？!?.,]/.test(text);
  if (lang === 'en') return text.length <= 30 && text.split(/\s+/).length <= 3 && !/[.!?,;:]/.test(text);
  return false;
}
