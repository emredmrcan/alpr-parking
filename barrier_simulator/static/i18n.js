// Minimal EN | TR i18n for the barrier simulator (no build step).
const TRANSLATIONS = {
  en: {
    title: 'Barrier Simulator',
    subtitle: 'Realistic multi-barrier simulator for local integration tests.',
    sendOpen: 'Send Open Command',
    barrierId: 'Barrier ID',
    openSeconds: 'Open Duration (s)',
    policy: 'Re-command Policy',
    open: 'POST /open/{id} (Open)',
    close: 'POST /close/{id} (Close)',
    noCommand: 'No command sent yet.',
    faultSim: 'Fault Simulation (per barrier)',
    fixedDelay: 'Fixed Delay (ms)',
    jitter: 'Jitter (ms)',
    failRate: 'Failure Rate (%)',
    failMode: 'Failure Mode',
    timeout: 'Timeout (ms)',
    stuckOpen: 'Stuck Open (manual close required)',
    stuckClosed: 'Stuck Closed (open command fails)',
    applyFaults: 'PUT /faults/{id} (Apply)',
    loadFaults: 'GET /faults/{id} (Load)',
    clearFaults: 'Clear Faults',
    liveStatus: 'Live Barrier Status',
    barrier: 'Barrier',
    stateOpen: (left) => `OPEN (${left} s left)`,
    stateClosed: 'CLOSED',
    policyMeta: 'policy', openTime: 'open_time', queue: 'queue',
    commands: 'commands', accepted: 'accepted', rejectedBusy: 'rejected_busy', failed: 'failed', cycles: 'cycles',
    delay: 'delay', jitterMeta: 'jitter', failRateMeta: 'fail_rate', mode: 'mode', stuckOpenMeta: 'stuck_open', stuckClosedMeta: 'stuck_closed',
    noBarriers: 'No barriers yet. Send an open command.',
    loadError: 'Load error',
  },
  tr: {
    title: 'Bariyer Simülasyonu',
    subtitle: 'Yerel entegrasyon testleri için gerçekçi çoklu bariyer simülasyonu.',
    sendOpen: 'Açma Komutu Gönder',
    barrierId: 'Bariyer ID',
    openSeconds: 'Açık Kalma Süresi (sn)',
    policy: 'Yeniden Komut Politikası',
    open: 'POST /open/{id} (Aç)',
    close: 'POST /close/{id} (Kapat)',
    noCommand: 'Henüz komut gönderilmedi.',
    faultSim: 'Hata Simülasyonu (bariyer bazlı)',
    fixedDelay: 'Sabit Gecikme (ms)',
    jitter: 'Jitter (ms)',
    failRate: 'Hata Oranı (%)',
    failMode: 'Hata Modu',
    timeout: 'Zaman Aşımı (ms)',
    stuckOpen: 'Açıkta Takılı Kalsın (manuel kapatma gerekir)',
    stuckClosed: 'Kapalıda Takılı Kalsın (açma komutu hata verir)',
    applyFaults: 'PUT /faults/{id} (Uygula)',
    loadFaults: 'GET /faults/{id} (Yükle)',
    clearFaults: 'Hataları Temizle',
    liveStatus: 'Canlı Bariyer Durumları',
    barrier: 'Bariyer',
    stateOpen: (left) => `AÇIK (${left} sn kaldı)`,
    stateClosed: 'KAPALI',
    policyMeta: 'politika', openTime: 'açık_süre', queue: 'kuyruk',
    commands: 'komut', accepted: 'kabul', rejectedBusy: 'red_meşgul', failed: 'hata', cycles: 'döngü',
    delay: 'gecikme', jitterMeta: 'jitter', failRateMeta: 'hata_oranı', mode: 'mod', stuckOpenMeta: 'takılı_açık', stuckClosedMeta: 'takılı_kapalı',
    noBarriers: 'Henüz bariyer yok. Bir açma komutu gönderin.',
    loadError: 'Yükleme hatası',
  },
};

const LANG_KEY = 'alpr-lang';

function detectLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && TRANSLATIONS[saved]) return saved;
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

let currentLang = detectLang();

function t(key, ...args) {
  const v = TRANSLATIONS[currentLang][key] ?? TRANSLATIONS.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  // Labels that wrap an input: translate only the leading text node.
  document.querySelectorAll('[data-i18n-label]').forEach((el) => {
    const node = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    const text = ' ' + t(el.dataset.i18nLabel) + ' ';
    if (node) node.textContent = text;
    else el.insertBefore(document.createTextNode(text), el.firstChild);
  });
  document.querySelectorAll('.lang-btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === currentLang));
  });
}

function setLang(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  applyStaticTranslations();
  if (typeof refresh === 'function') refresh();
}
