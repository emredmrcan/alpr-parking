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
const openBtn = document.getElementById('openBtn');
const closeBtn = document.getElementById('closeBtn');
const applyFaultBtn = document.getElementById('applyFaultBtn');
const loadFaultBtn = document.getElementById('loadFaultBtn');
const clearFaultBtn = document.getElementById('clearFaultBtn');

function secondsLeft(openUntil) {
  if (!openUntil) return 0;
  const ms = new Date(openUntil).getTime() - Date.now();
  return Math.max(0, ms / 1000);
}

function renderCard(b) {
  const open = b.state === 'OPEN';
  const left = secondsLeft(b.open_until);
  const statusClass = open ? 'status-open' : 'status-closed';
  const statusText = open ? `AÇIK (${left.toFixed(1)} sn kaldı)` : 'KAPALI';
  return `
    <article class="barrier ${statusClass}">
      <div class="barrier-head">
        <strong>Bariyer #${b.barrier_id}</strong>
        <span>${statusText}</span>
      </div>
      <div class="meta">
        <span>politika: ${b.policy}</span>
        <span>açık_süre: ${b.open_seconds.toFixed(1)}</span>
        <span>kuyruk: ${b.queue_depth}</span>
      </div>
      <div class="meta">
        <span>komut: ${b.total_commands}</span>
        <span>kabul: ${b.accepted_commands}</span>
        <span>red_meşgul: ${b.rejected_busy}</span>
        <span>hata: ${b.failed_commands}</span>
        <span>döngü: ${b.total_cycles}</span>
      </div>
      <div class="meta">
        <span>gecikme: ${b.fault_profile.fixed_delay_ms}ms</span>
        <span>jitter: ${b.fault_profile.jitter_ms}ms</span>
        <span>hata_oranı: ${b.fault_profile.fail_rate_percent}%</span>
        <span>mod: ${b.fault_profile.failure_mode}</span>
        <span>takılı_açık: ${b.fault_profile.stuck_open}</span>
      </div>
    </article>
  `;
}

async function refresh() {
  try {
    const r = await fetch('/barriers');
    const data = await r.json();
    if (!data.barriers || !data.barriers.length) {
      barriersEl.innerHTML = '<p class="empty">Henüz bariyer yok. Bir açma komutu gönderin.</p>';
      return;
    }
    barriersEl.innerHTML = data.barriers.map(renderCard).join('');
  } catch (err) {
    barriersEl.innerHTML = `<p class="empty">Yükleme hatası: ${String(err)}</p>`;
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
  lastResultEl.textContent = JSON.stringify(data, null, 2);
  await refresh();
}

async function sendClose() {
  const id = Number(barrierIdEl.value || 1);
  const r = await fetch(`/close/${id}`, { method: 'POST' });
  const data = await r.json();
  lastResultEl.textContent = JSON.stringify(data, null, 2);
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
  };
}

function setFaultInputs(data) {
  faultDelayMsEl.value = String(data.fixed_delay_ms ?? 0);
  faultJitterMsEl.value = String(data.jitter_ms ?? 0);
  faultFailRateEl.value = String(data.fail_rate_percent ?? 0);
  faultModeEl.value = data.failure_mode ?? 'http_500';
  faultTimeoutMsEl.value = String(data.timeout_ms ?? 5000);
  faultStuckOpenEl.checked = Boolean(data.stuck_open);
}

async function applyFaults() {
  const id = Number(barrierIdEl.value || 1);
  const r = await fetch(`/faults/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(getFaultPayload()),
  });
  const data = await r.json();
  lastResultEl.textContent = JSON.stringify(data, null, 2);
  await refresh();
}

async function loadFaults() {
  const id = Number(barrierIdEl.value || 1);
  const r = await fetch(`/faults/${id}`);
  const data = await r.json();
  setFaultInputs(data);
  lastResultEl.textContent = JSON.stringify(data, null, 2);
}

async function clearFaults() {
  setFaultInputs({
    fixed_delay_ms: 0,
    jitter_ms: 0,
    fail_rate_percent: 0,
    failure_mode: 'http_500',
    timeout_ms: 5000,
    stuck_open: false,
  });
  await applyFaults();
}

openBtn.addEventListener('click', () => {
  sendOpen().catch((err) => {
    lastResultEl.textContent = String(err);
  });
});

closeBtn.addEventListener('click', () => {
  sendClose().catch((err) => {
    lastResultEl.textContent = String(err);
  });
});

applyFaultBtn.addEventListener('click', () => {
  applyFaults().catch((err) => {
    lastResultEl.textContent = String(err);
  });
});

loadFaultBtn.addEventListener('click', () => {
  loadFaults().catch((err) => {
    lastResultEl.textContent = String(err);
  });
});

clearFaultBtn.addEventListener('click', () => {
  clearFaults().catch((err) => {
    lastResultEl.textContent = String(err);
  });
});

setInterval(refresh, 1000);
refresh();
