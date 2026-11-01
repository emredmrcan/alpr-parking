const barriersEl = document.getElementById('barriers');
const lastResultEl = document.getElementById('lastResult');
const barrierIdEl = document.getElementById('barrierId');
const openSecondsEl = document.getElementById('openSeconds');
const policyEl = document.getElementById('policy');
const faultDelayMsEl = document.getElementById('faultDelayMs');
const faultJitterMsEl = document.getElementById('faultJitterMs');
const faultFailRateEl = document.getElementById('faultFailRate');
const faultModeEl = document.getElementById('faultMode');
const faultTimeoutMsEl = document.getElementById('faultTimeoutMs');
const faultStuckOpenEl = document.getElementById('faultStuckOpen');
const faultStuckClosedEl = document.getElementById('faultStuckClosed');
const openBtn = document.getElementById('openBtn');
const closeBtn = document.getElementById('closeBtn');
const applyFaultBtn = document.getElementById('applyFaultBtn');
const loadFaultBtn = document.getElementById('loadFaultBtn');
const clearFaultBtn = document.getElementById('clearFaultBtn');

function setResult(text) {
  lastResultEl.removeAttribute('data-i18n');
  lastResultEl.textContent = text;
}

function secondsLeft(openUntil) {
  if (!openUntil) return 0;
  const ms = new Date(openUntil).getTime() - Date.now();
  return Math.max(0, ms / 1000);
}

function renderCard(b) {
  const open = b.state === 'OPEN';
  const left = secondsLeft(b.open_until);
  const statusClass = open ? 'status-open' : 'status-closed';
  const statusText = open ? t('stateOpen', left.toFixed(1)) : t('stateClosed');
  return `
    <article class="barrier ${statusClass}">
      <div class="barrier-head">
        <strong>${t('barrier')} #${b.barrier_id}</strong>
        <span>${statusText}</span>
      </div>
      <div class="meta">
        <span>${t('policyMeta')}: ${b.policy}</span>
        <span>${t('openTime')}: ${b.open_seconds.toFixed(1)}</span>
        <span>${t('queue')}: ${b.queue_depth}</span>
      </div>
      <div class="meta">
        <span>${t('commands')}: ${b.total_commands}</span>
        <span>${t('accepted')}: ${b.accepted_commands}</span>
        <span>${t('rejectedBusy')}: ${b.rejected_busy}</span>
        <span>${t('failed')}: ${b.failed_commands}</span>
        <span>${t('cycles')}: ${b.total_cycles}</span>
      </div>
      <div class="meta">
        <span>${t('delay')}: ${b.fault_profile.fixed_delay_ms}ms</span>
        <span>${t('jitterMeta')}: ${b.fault_profile.jitter_ms}ms</span>
        <span>${t('failRateMeta')}: ${b.fault_profile.fail_rate_percent}%</span>
        <span>${t('mode')}: ${b.fault_profile.failure_mode}</span>
        <span>${t('stuckOpenMeta')}: ${b.fault_profile.stuck_open}</span>
        <span>${t('stuckClosedMeta')}: ${b.fault_profile.stuck_closed}</span>
      </div>
    </article>
  `;
}

async function refresh() {
  try {
    const r = await fetch('/barriers');
    const data = await r.json();
    if (!data.barriers || !data.barriers.length) {
      barriersEl.innerHTML = `<p class="empty">${t('noBarriers')}</p>`;
      return;
    }
    barriersEl.innerHTML = data.barriers.map(renderCard).join('');
  } catch (err) {
    barriersEl.innerHTML = `<p class="empty">${t('loadError')}: ${String(err)}</p>`;
  }
}

async function sendOpen() {
  const id = Number(barrierIdEl.value || 1);
  const openSeconds = Number(openSecondsEl.value || 10);
  const policy = policyEl.value || 'ignore';
  const q = new URLSearchParams({
    open_seconds: String(openSeconds),
    policy,
  }).toString();
  const r = await fetch(`/open/${id}?${q}`, { method: 'POST' });
  const data = await r.json();
  setResult(JSON.stringify(data, null, 2));
  await refresh();
}

async function sendClose() {
  const id = Number(barrierIdEl.value || 1);
  const r = await fetch(`/close/${id}`, { method: 'POST' });
  const data = await r.json();
  setResult(JSON.stringify(data, null, 2));
  await refresh();
}

function getFaultPayload() {
  return {
    fixed_delay_ms: Number(faultDelayMsEl.value || 0),
    jitter_ms: Number(faultJitterMsEl.value || 0),
    fail_rate_percent: Number(faultFailRateEl.value || 0),
    failure_mode: faultModeEl.value || 'http_500',
    timeout_ms: Number(faultTimeoutMsEl.value || 5000),
    stuck_open: Boolean(faultStuckOpenEl.checked),
    stuck_closed: Boolean(faultStuckClosedEl.checked),
  };
}

function setFaultInputs(data) {
  faultDelayMsEl.value = String(data.fixed_delay_ms ?? 0);
  faultJitterMsEl.value = String(data.jitter_ms ?? 0);
  faultFailRateEl.value = String(data.fail_rate_percent ?? 0);
  faultModeEl.value = data.failure_mode ?? 'http_500';
  faultTimeoutMsEl.value = String(data.timeout_ms ?? 5000);
  faultStuckOpenEl.checked = Boolean(data.stuck_open);
  faultStuckClosedEl.checked = Boolean(data.stuck_closed);
}

async function applyFaults() {
  const id = Number(barrierIdEl.value || 1);
  const r = await fetch(`/faults/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(getFaultPayload()),
  });
  const data = await r.json();
  setResult(JSON.stringify(data, null, 2));
  await refresh();
}

async function loadFaults() {
  const id = Number(barrierIdEl.value || 1);
  const r = await fetch(`/faults/${id}`);
  const data = await r.json();
  setFaultInputs(data);
  setResult(JSON.stringify(data, null, 2));
}

async function clearFaults() {
  setFaultInputs({
    fixed_delay_ms: 0,
    jitter_ms: 0,
    fail_rate_percent: 0,
    failure_mode: 'http_500',
    timeout_ms: 5000,
    stuck_open: false,
    stuck_closed: false,
  });
  await applyFaults();
}

openBtn.addEventListener('click', () => {
  sendOpen().catch((err) => {
    setResult(String(err));
  });
});

closeBtn.addEventListener('click', () => {
  sendClose().catch((err) => {
    setResult(String(err));
  });
});

applyFaultBtn.addEventListener('click', () => {
  applyFaults().catch((err) => {
    setResult(String(err));
  });
});

loadFaultBtn.addEventListener('click', () => {
  loadFaults().catch((err) => {
    setResult(String(err));
  });
});

clearFaultBtn.addEventListener('click', () => {
  clearFaults().catch((err) => {
    setResult(String(err));
  });
});

applyStaticTranslations();
setInterval(refresh, 1000);
refresh();
