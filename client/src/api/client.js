const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    window.location.href = '/login';
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  get:    (path)         => request(path),
  post:   (path, body)   => request(path, { method: 'POST',   body }),
  patch:  (path, body)   => request(path, { method: 'PATCH',  body }),
  delete: (path)         => request(path, { method: 'DELETE' }),

  auth: {
    login:          (body) => api.post('/auth/login', body),
    logout:         ()     => api.post('/auth/logout'),
    me:             ()     => api.get('/auth/me'),
    register:       (body) => api.post('/auth/register', body),
    changePassword: (body) => api.post('/auth/change-password', body),
  },
  pilots: {
    list:           ()      => api.get('/pilots'),
    get:            (id)    => api.get(`/pilots/${id}`),
    create:         (body)  => api.post('/pilots', body),
    update:         (id, b) => api.patch(`/pilots/${id}`, b),
    delete:         (id)    => api.delete(`/pilots/${id}`),
    selectPsa:      (id, b) => api.post(`/pilots/${id}/psa`, b),
    availablePsas:  (id)    => api.get(`/pilots/${id}/available-psas`),
    rankStatus:     (id)    => api.get(`/pilots/${id}/rank-status`),
    dismissRankup:  (id)    => api.post(`/pilots/${id}/dismiss-rankup`),
  },
  xp: {
    award:     (body) => api.post('/xp/award', body),
    damage:    (body) => api.post('/xp/damage', body),
    kill:      (body) => api.post('/xp/kill', body),
    objective: (body) => api.post('/xp/objective', body),
    log:       (pid)  => api.get(`/xp/pilot/${pid}`),
  },
  units: {
    list:           ()      => api.get('/units'),
    get:            (id)    => api.get(`/units/${id}`),
    create:         (body)  => api.post('/units', body),
    update:         (id, b) => api.patch(`/units/${id}`, b),
    applyDamage:    (id, b) => api.patch(`/units/${id}/damage`, b),
    assignPilot:    (id, b) => api.post(`/units/${id}/assign-pilot`, b),
    unassignPilot:  (id)    => api.post(`/units/${id}/unassign-pilot`),
    saleValue:      (id)    => api.get(`/units/${id}/sale-value`),
    delete:         (id)    => api.delete(`/units/${id}`),
  },
  repairs: {
    list:     ()      => api.get('/repairs'),
    get:      (id)    => api.get(`/repairs/${id}`),
    create:   (body)  => api.post('/repairs', body),
    approve:  (id)    => api.patch(`/repairs/${id}/approve`),
    complete: (id)    => api.patch(`/repairs/${id}/complete`),
    cancel:   (id)    => api.patch(`/repairs/${id}/cancel`),
  },
  accounting: {
    balance:        ()     => api.get('/accounting/balance'),
    ledger:         (q)    => api.get(`/accounting/ledger${q ? '?' + new URLSearchParams(q) : ''}`),
    deposit:        (body) => api.post('/accounting/deposit', body),
    withdraw:       (body) => api.post('/accounting/withdraw', body),
    missionPayout:  (body) => api.post('/accounting/mission-payout', body),
    sellUnit:       (body) => api.post('/accounting/sell-unit', body),
  },
  contracts: {
    list:              ()      => api.get('/contracts'),
    create:            (body)  => api.post('/contracts', body),
    update:            (id, b) => api.patch(`/contracts/${id}`, b),
    sessions:          (cid)   => api.get(`/contracts/${cid}/sessions`),
    createSession:     (cid,b) => api.post(`/contracts/${cid}/sessions`, b),
    getSession:        (id)    => api.get(`/contracts/sessions/${id}`),
    startSession:      (id)    => api.post(`/contracts/sessions/${id}/start`),
    endSession:        (id)    => api.post(`/contracts/sessions/${id}/end`),
    completeSession:   (id)    => api.post(`/contracts/sessions/${id}/complete`),
    objectives:        (id)    => api.get(`/contracts/sessions/${id}/objectives`),
    addObjective:      (id,b)  => api.post(`/contracts/sessions/${id}/objectives`, b),
    updateObjective:   (oid,b) => api.patch(`/contracts/sessions/objectives/${oid}`, b),
  },
  play: {
    preview:    (body)      => api.post('/play/preview', body),
    import:     (body)      => api.post('/play/import', body),
    session:    (sid)       => api.get(`/play/session/${sid}`),
    addEnemy:   (body)      => api.post('/play/enemy', body),
    updateEnemy:(id, body)  => api.patch(`/play/enemy/${id}`, body),
    logDamage:  (id, body)  => api.post(`/play/enemy/${id}/damage-log`, body),
    damageLog:  (id, turn)  => api.get(`/play/enemy/${id}/damage-log${turn ? '?turn=' + turn : ''}`),
    assignKill: (id, body)  => api.post(`/play/enemy/${id}/kill`, body),
  },
  salvage: {
    build:   (sid)      => api.post(`/salvage/build/${sid}`),
    list:    (sid)      => api.get(`/salvage/${sid}`),
    claim:   (id, body) => api.post(`/salvage/${id}/claim`, body),
    dismiss: (id)       => api.post(`/salvage/${id}/dismiss`),
  },
  notifications: {
    list:    ()   => api.get('/notifications'),
    read:    (id) => api.patch(`/notifications/${id}/read`),
    readAll: ()   => api.post('/notifications/read-all'),
  },
};
