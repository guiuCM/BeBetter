// Simple game-like state manager for Be Better
const App = (function () {
  const STORAGE_KEY = 'be_better_state_v1';

  const defaultState = {
    xp: 0,
    coins: 50,
    tasks: {}, // id -> completed boolean
    itemsOwned: {},
  };

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { ...defaultState };
    } catch (e) {
      console.warn('Could not load state, using defaults', e);
      return { ...defaultState };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save state', e);
    }
  }

  function getState() { return state; }

  function addXp(amount) {
    state.xp += amount;
    saveState();
    emit('xpChanged', { xp: state.xp, delta: amount });
  }

  function addCoins(amount) {
    state.coins += amount;
    saveState();
    emit('coinsChanged', { coins: state.coins, delta: amount });
  }

  function spendCoins(amount) {
    if (state.coins < amount) return false;
    state.coins -= amount;
    saveState();
    emit('coinsChanged', { coins: state.coins, delta: -amount });
    return true;
  }

  function toggleTask(id, reward = { xp: 10, coins: 5 }) {
    console.debug('toggleTask called for', id, 'reward=', reward);
    const completed = !!state.tasks[id];
    if (completed) {
      // uncomplete
      state.tasks[id] = false;
      // optionally deduct rewards (no for now)
    } else {
      state.tasks[id] = true;
      addXp(reward.xp);
      addCoins(reward.coins);
    }
    saveState();
    emit('taskToggled', { id, completed: !!state.tasks[id] });
  }

  function buyItem(itemId, price) {
    if (!spendCoins(price)) return false;
    state.itemsOwned[itemId] = (state.itemsOwned[itemId] || 0) + 1;
    saveState();
    emit('itemBought', { itemId, count: state.itemsOwned[itemId] });
    return true;
  }

  function on(eventName, handler) {
    document.addEventListener('app:' + eventName, (e) => handler(e.detail));
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent('app:' + name, { detail }));
  }

  // Public API
  return {
    getState,
    addXp,
    addCoins,
    toggleTask,
    buyItem,
    on,
    _saveState: saveState,
  };
})();

// UI wiring
document.addEventListener('DOMContentLoaded', () => {
  let isApplyingRemote = false;
  // update counters if present (legacy) and styled stats
  const xpEl = document.querySelector('#xp-count');
  const coinsEl = document.querySelector('#coins-count');
  const statXp = document.querySelector('#stat-xp');
  const statCoins = document.querySelector('#stat-coins');

  function refreshCounters() {
    const s = App.getState();
    if (xpEl) xpEl.textContent = s.xp;
    if (coinsEl) coinsEl.textContent = s.coins;
    if (statXp) statXp.textContent = s.xp;
    if (statCoins) statCoins.textContent = s.coins;
    // compute level and next level xp
    const levelEl = document.querySelector('#stat-level');
    const nextEl = document.querySelector('#stat-next');
    if (levelEl || nextEl) {
      const level = Math.floor(s.xp / 100) + 1;
      const nextXp = level * 100 - s.xp;
      if (levelEl) levelEl.textContent = level;
      if (nextEl) nextEl.textContent = `${nextXp} XP`;
    }
  }

  refreshCounters();

  App.on('xpChanged', refreshCounters);
  App.on('coinsChanged', refreshCounters);

  // --- Authentication UI handlers (client-side) ---
  const TOKEN_KEY = 'be_better_token';

  // API base: point to the node server. If you serve static files from a different server
  // (e.g. python -m http.server) keep this pointing to your node backend (default port 3000).
  const API_BASE = 'http://localhost:3000';

  async function apiPost(path, body) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) headers.Authorization = 'Bearer ' + token;
      const res = await fetch(API_BASE + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return json || { error: 'Request failed with status ' + res.status };
      }
      return json;
    } catch (e) {
      console.error('Network error calling', path, e);
      return { error: 'network error' };
    }
  }

  // Sync xp/coins deltas to server when logged in
  App.on('xpChanged', ({ xp, delta }) => {
    console.debug('xpChanged handler invoked, delta=', delta);
    if (isApplyingRemote) { console.debug('Skipping xp sync: applying remote flag'); return; }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { console.debug('No token, skipping xp persist'); return; }
    console.debug('Sending /user/modify xpDelta=', delta);
    apiPost('/user/modify', { xpDelta: delta }).then((res) => {
      console.debug('/user/modify response for xp:', res);
      if (res && res.user) {
        isApplyingRemote = true;
        const s = App.getState();
        s.xp = res.user.xp || s.xp;
        if (res.user.level !== undefined) s.level = res.user.level;
        App._saveState();
        document.dispatchEvent(new CustomEvent('app:xpChanged', { detail: { xp: s.xp, delta: 0 } }));
        document.dispatchEvent(new CustomEvent('app:coinsChanged', { detail: { coins: s.coins, delta: 0 } }));
        isApplyingRemote = false;
      }
    }).catch((err) => console.error('Persist xp failed', err));
  });

  App.on('coinsChanged', ({ coins, delta }) => {
    console.debug('coinsChanged handler invoked, delta=', delta);
    if (isApplyingRemote) { console.debug('Skipping coins sync: applying remote flag'); return; }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { console.debug('No token, skipping coins persist'); return; }
    console.debug('Sending /user/modify coinsDelta=', delta);
    apiPost('/user/modify', { coinsDelta: delta }).then((res) => {
      console.debug('/user/modify response for coins:', res);
      if (res && res.user) {
        isApplyingRemote = true;
        const s = App.getState();
        s.coins = res.user.coins || s.coins;
        if (res.user.level !== undefined) s.level = res.user.level;
        App._saveState();
        document.dispatchEvent(new CustomEvent('app:coinsChanged', { detail: { coins: s.coins, delta: 0 } }));
        document.dispatchEvent(new CustomEvent('app:xpChanged', { detail: { xp: s.xp, delta: 0 } }));
        isApplyingRemote = false;
      }
    }).catch((err) => console.error('Persist coins failed', err));
  });

  const registerForm = document.querySelector('#register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const username = form.querySelector('#username').value.trim();
      const email = form.querySelector('#email') ? form.querySelector('#email').value.trim() : '';
      const password = form.querySelector('#password').value;
      const confirm = form.querySelector('#confirm-password').value;
      if (password !== confirm) { alert('Passwords do not match'); return; }
      const res = await apiPost('/register', { username, email, password });
      if (res && res.ok) {
  alert('Registered! Please login.');
  window.location.href = '/index.html';
      } else {
        const msg = res && (res.error || res.details) ? (res.error || res.details) : 'unknown';
        alert('Register failed: ' + msg);
      }
    });
  }

  const loginForm = document.querySelector('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const username = form.querySelector('#username').value.trim();
      const password = form.querySelector('#password').value;
      const res = await apiPost('/login', { username, password });
      if (res && res.ok && res.token) {
        localStorage.setItem(TOKEN_KEY, res.token);
        // optionally fetch user data
  alert('Logged in');
  window.location.href = '/ini.html';
      } else {
        const msg = res && res.error ? res.error : 'invalid credentials';
        alert('Login failed: ' + msg);
      }
    });
  }

  // Load user from server if token present and sync state + UI
  async function loadUserFromServer() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
      const res = await fetch(API_BASE + '/user', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) { console.warn('Could not fetch user from server'); return null; }
      const data = await res.json();
      if (data && data.user) {
        const u = data.user;
        // sync App state
        const s = App.getState();
        s.xp = u.xp || 0;
        s.coins = u.coins || 0;
        if (u.level !== undefined) s.level = u.level;
        App._saveState();
        // update welcome
        const welcome = document.querySelector('#welcome-username');
        if (welcome) welcome.textContent = u.username || 'User';
  // emit typed events so listeners persist to server if needed
  document.dispatchEvent(new CustomEvent('app:xpChanged', { detail: { xp: s.xp, delta: 0 } }));
  document.dispatchEvent(new CustomEvent('app:coinsChanged', { detail: { coins: s.coins, delta: 0 } }));
        return u;
      }
    } catch (e) {
      console.warn('loadUserFromServer failed', e);
    }
    return null;
  }

  // call it on load
  loadUserFromServer();

  // Tasks
  const pendingList = document.querySelector('#pending-tasks .task-list');
  const completedList = document.querySelector('#completed-tasks .task-list');
  const addTaskBtn = document.querySelector('#add-task-btn');
  const taskPool = document.querySelector('#task-pool');
  const poolList = document.querySelector('#pool-list');
  const closePool = document.querySelector('#close-pool');

  // Available example tasks (self-improvement)
  const availableTasks = [
    { id: 'task-exercise', title: 'Exercise 30 minutes', reward: { xp: 20, coins: 10 } },
    { id: 'task-journal', title: 'Write morning journal', reward: { xp: 15, coins: 5 } },
    { id: 'task-sleep', title: 'Go to bed before 23:00', reward: { xp: 10, coins: 6 } },
    { id: 'task-no-phone', title: 'No phone 1 hour', reward: { xp: 12, coins: 4 } },
    { id: 'task-hydrate', title: 'Drink 2L water', reward: { xp: 8, coins: 3 } },
  ];

  function moveTaskElement(id, completed) {
    const el = document.querySelector(`[data-task-id="${id}"]`);
    if (!el) return;
    let checkbox = el.querySelector('input[type="checkbox"]');
    if (checkbox) {
      // replace checkbox with a clone to remove previous event listeners
  console.debug('Replacing checkbox for', id, 'completed=', completed);
  const newCheckbox = checkbox.cloneNode(true);
  newCheckbox.checked = !!completed;
  newCheckbox.disabled = false;
  checkbox.parentNode.replaceChild(newCheckbox, checkbox);
  checkbox = newCheckbox;
      // attach fresh handler using reward if available
      const reward = (typeof availableTasks !== 'undefined') ? (availableTasks.find(t => t.id === id) || {}).reward : undefined;
      checkbox.addEventListener('change', () => {
        App.toggleTask(id, reward);
        // re-render pool to update add buttons
        renderPool();
      });
    }
    if (completed) {
      // move to completed list
      if (completedList) completedList.appendChild(el);
    } else {
      // move to pending list
      if (pendingList) pendingList.appendChild(el);
    }
  }

  function countActiveTasks() {
    const s = App.getState();
    // count tasks that are present and not completed (boolean false or undefined means pending)
    let count = 0;
    Object.keys(s.tasks).forEach(k => {
      if (s.tasks[k] === true) count++; // completed
      else if (s.tasks[k] === false) count++; // pending present
    });
    // also count any initial DOM tasks that may not be in state yet
    document.querySelectorAll('#pending-tasks [data-task-id]').forEach(el => {
      const id = el.getAttribute('data-task-id');
      const sState = s.tasks[id];
      if (sState === undefined) count++; // it's in the DOM but not in state, consider active
    });
    return count;
  }

  function renderPool() {
    if (!poolList) return;
    poolList.innerHTML = '';
    const s = App.getState();
    availableTasks.forEach(t => {
      const li = document.createElement('li');
      li.textContent = t.title;
      // add button
      const btn = document.createElement('button');
      btn.className = 'add-btn';
      btn.textContent = 'Add';
      // disable if already in state and completed
      const already = s.tasks[t.id];
      if (already === true) {
        btn.disabled = true;
        btn.textContent = 'Completed';
      }
      // disable if max 5 reached
      if (countActiveTasks() >= 5) btn.disabled = true;
      btn.addEventListener('click', () => {
        // prevent adding completed tasks
        if (s.tasks[t.id] === true) return;
        // enforce max 5 active tasks
        if (countActiveTasks() >= 5) { alert('Maximum 5 tasks allowed'); return; }
        // add task to DOM and state
        const newLi = document.createElement('li');
        newLi.setAttribute('data-task-id', t.id);
        newLi.innerHTML = `<label><input type="checkbox"> ${t.title}</label>`;
        if (pendingList) pendingList.appendChild(newLi);
        // set in state: false = pending
        s.tasks[t.id] = false;
        App._saveState();
        // bind event
        const checkbox = newLi.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.addEventListener('change', () => App.toggleTask(t.id, t.reward));
        // refresh pool buttons
        renderPool();
      });
      const span = document.createElement('span');
      span.appendChild(btn);
      li.appendChild(span);
      poolList.appendChild(li);
    });
  }

  if (addTaskBtn) addTaskBtn.addEventListener('click', () => {
    if (taskPool) {
      renderPool();
      taskPool.classList.remove('hidden');
      taskPool.setAttribute('aria-hidden', 'false');
    }
  });
  if (closePool) closePool.addEventListener('click', () => {
    if (taskPool) {
      taskPool.classList.add('hidden');
      taskPool.setAttribute('aria-hidden', 'true');
    }
  });

  // initialize tasks placement and bind events
  document.querySelectorAll('[data-task-id]').forEach((el) => {
    const id = el.getAttribute('data-task-id');
    const checkbox = el.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    const stateObj = App.getState();
    const completed = !!stateObj.tasks[id];
    // place in correct list
    moveTaskElement(id, completed);
    // bind change
    // find reward if present in availableTasks
    const reward = (typeof availableTasks !== 'undefined') ? (availableTasks.find(t => t.id === id) || {}).reward : undefined;
    checkbox.addEventListener('change', () => {
      App.toggleTask(id, reward);
      // re-render pool to reflect completed state
      renderPool();
    });
  });

  // react to toggles (so other parts of UI move elements)
  App.on('taskToggled', ({ id, completed }) => {
    moveTaskElement(id, completed);
  });

  // Buy buttons
  document.querySelectorAll('[data-buy-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-buy-id');
      const price = Number(btn.getAttribute('data-price')) || 0;
      const ok = App.buyItem(id, price);
      if (!ok) {
        alert('Not enough coins');
      } else {
        // small feedback
        btn.textContent = 'Bought ✓';
        setTimeout(() => { btn.textContent = 'Buy'; }, 900);
      }
    });
  });
});

//# sourceURL=app.js
