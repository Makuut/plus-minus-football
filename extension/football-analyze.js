const STORAGE_KEY = 'ttd_minimal_data';
    const DEFAULT_SETTINGS_KEY = 'ttd_default_settings';

    const PLAYER_COLORS = [
        '#e74c3c', '#2980b9', '#27ae60', '#f39c12', '#8e44ad',
        '#1abc9c', '#e67e22', '#2c3e50', '#e84393', '#00b894',
        '#6c5ce7', '#fdcb6e', '#d63031', '#0984e3', '#00cec9'
    ];

    const DEFAULT_CATEGORIES = ['ПАС', 'УДАР', 'ПЕРЕХВАТ', 'ОТБОР', 'ОБВОДКА'];
    const DEFAULT_TEAMS = ['Зеленые', 'Оранжевые'];
    const DEFAULT_PLAYERS = ['Ильдар', 'РусланС', 'Айнур', 'Влад', 'Алмаз', 'Максим', 'РусланЗ', 'Ирек', 'Дима', 'Паша'];
    const DEFAULT_CATEGORY_KEYS = { 'ПАС': 'q', 'УДАР': 'w', 'ПЕРЕХВАТ': 'e', 'ОТБОР': 'r', 'ОБВОДКА': 't' };
    const DEFAULT_PLAYER_KEYS = {
        'Ильдар': '1', 'РусланС': '2', 'Айнур': '3', 'Влад': '4', 'Алмаз': '5',
        'Максим': '6', 'РусланЗ': '7', 'Ирек': '8', 'Дима': '9', 'Паша': '0'
    };
    const PLAYER_KEY_POOL = '1234567890asdfghjklzxcvbnm'.split('');
    const CATEGORY_KEY_POOL = 'qwertyuiop[]'.split('');
    const DEFAULT_ACTION_KEYS = { plus: '+', minus: '-', removePlus: '/', removeMinus: '*' };

    let data = {
        players: {},
        categories: [],
        periods: [],
        activePeriod: null,
        nextPlayerId: 1,
        colorIndex: 0
    };

    let pendingAction = null;
    let activeDropdown = null;
    let shortcutBuffer = '';
    let shortcutTimer = null;

    function openConfirm(title, message, confirmText, action) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').innerHTML = message;
        const btn = document.getElementById('confirmDeleteBtn');
        btn.textContent = confirmText || 'Удалить';
        if (action.type === 'clearAllActions' || action.type === 'removeLastPlus' || action.type === 'removeLastMinus') {
            btn.className = 'btn btn-confirm-green';
        } else {
            btn.className = 'btn btn-confirm';
        }
        document.getElementById('confirmOverlay').classList.add('active');
        pendingAction = action;
    }

    function closeConfirm() {
        document.getElementById('confirmOverlay').classList.remove('active');
        pendingAction = null;
    }

    document.getElementById('confirmDeleteBtn').addEventListener('click', function() {
        if (!pendingAction) return;
        switch (pendingAction.type) {
            case 'deletePlayer':
                delete data.players[pendingAction.id];
                break;
            case 'deleteCategory':
                const key = pendingAction.key;
                data.categories = data.categories.filter(c => c.key !== key);
                for (const id in data.players) {
                    data.periods.forEach(p => { delete data.players[id].stats[p.key][key]; });
                }
                break;
            case 'deletePeriod':
                const pKey = pendingAction.key;
                data.periods = data.periods.filter(x => x.key !== pKey);
                for (const id in data.players) delete data.players[id].stats[pKey];
                if (data.activePeriod === pKey) data.activePeriod = data.periods[0]?.key || null;
                break;
            case 'clearAllActions':
                const pid = pendingAction.playerId;
                const pk = pendingAction.periodKey;
                const ck = pendingAction.categoryKey;
                if (data.players[pid] && data.players[pid].stats[pk]) {
                    data.players[pid].stats[pk][ck] = '';
                    setLastActionStatus(pid, ck, 'очищено');
                }
                break;
            case 'removeLastPlus':
                const pid3 = pendingAction.playerId;
                const pk3 = pendingAction.periodKey;
                const ck3 = pendingAction.categoryKey;
                if (data.players[pid3] && data.players[pid3].stats[pk3]) {
                    let current = data.players[pid3].stats[pk3][ck3] || '';
                    const lastPlus = current.lastIndexOf('+');
                    if (lastPlus !== -1) {
                        current = current.slice(0, lastPlus) + current.slice(lastPlus + 1);
                        data.players[pid3].stats[pk3][ck3] = current;
                    setLastActionStatus(pid3, ck3, 'уд +');
                    }
                }
                break;
            case 'removeLastMinus':
                const pid4 = pendingAction.playerId;
                const pk4 = pendingAction.periodKey;
                const ck4 = pendingAction.categoryKey;
                if (data.players[pid4] && data.players[pid4].stats[pk4]) {
                    let current = data.players[pid4].stats[pk4][ck4] || '';
                    const lastMinus = current.lastIndexOf('-');
                    if (lastMinus !== -1) {
                        current = current.slice(0, lastMinus) + current.slice(lastMinus + 1);
                        data.players[pid4].stats[pk4][ck4] = current;
                        setLastActionStatus(pid4, ck4, 'уд -');
                    }
                }
                break;
        }
        closeConfirm();
        renderAll();
        autoSave();
    });

    document.getElementById('confirmOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('confirmOverlay')) closeConfirm();
    });
    document.getElementById('settingsOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('settingsOverlay')) closeDefaultsSettings();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeConfirm();
            closeDefaultsSettings();
            closeAllDropdowns();
            resetShortcutBuffer();
            return;
        }
        handleShortcutKey(e);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            closeAllDropdowns();
        }
    });

    function closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu.active').forEach(el => {
            el.classList.remove('active');
        });
        activeDropdown = null;
    }

    function toggleDropdown(dropdownId, event) {
        event.stopPropagation();
        const menu = document.getElementById(dropdownId);
        if (!menu) return;

        closeAllDropdowns();
        menu.classList.toggle('active');
        if (menu.classList.contains('active')) {
            activeDropdown = dropdownId;
        } else {
            activeDropdown = null;
        }
    }

    function normalizeDefaultList(text, forceUppercase = false) {
        const seen = new Set();
        return String(text || '')
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean)
            .map(item => forceUppercase ? item.toUpperCase() : item)
            .filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function normalizeShortcutKey(value) {
        return String(value || '').trim().slice(0, 1).toLowerCase();
    }

    function normalizeDefaultShortcutList(text, forceUppercase = false) {
        const seen = new Set();
        return String(text || '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const parts = line.split('|');
                const rawName = parts[0].trim();
                const name = forceUppercase ? rawName.toUpperCase() : rawName;
                const shortcut = normalizeShortcutKey(parts.slice(1).join('|'));
                return { name, shortcut };
            })
            .filter(item => {
                if (!item.name) return false;
                const key = item.name.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function makeDefaultShortcutItems(labels, shortcutMap, forceUppercase = false) {
        return labels.map(label => {
            const name = forceUppercase ? label.toUpperCase() : label;
            return { name, shortcut: normalizeShortcutKey(shortcutMap[name] || '') };
        });
    }

    function normalizeSavedShortcutItems(items, fallbackLabels, shortcutMap, forceUppercase = false) {
        if (!Array.isArray(items)) return makeDefaultShortcutItems(fallbackLabels, shortcutMap, forceUppercase);
        return items
            .map(item => {
                if (typeof item === 'string') {
                    const name = forceUppercase ? item.trim().toUpperCase() : item.trim();
                    return { name, shortcut: normalizeShortcutKey(shortcutMap[name] || '') };
                }
                const rawName = String(item?.name || item?.label || '').trim();
                const name = forceUppercase ? rawName.toUpperCase() : rawName;
                return { name, shortcut: normalizeShortcutKey(item?.shortcut || shortcutMap[name] || '') };
            })
            .filter(item => item.name);
    }

    function formatShortcutItems(items) {
        return items.map(item => item.shortcut ? `${item.name} | ${item.shortcut}` : item.name).join('\n');
    }

    function getUsedPlayerShortcuts(exceptId = null) {
        const used = new Set();
        for (const id in data.players) {
            if (String(id) === String(exceptId)) continue;
            const shortcut = normalizeShortcutKey(data.players[id].shortcut);
            if (shortcut) used.add(shortcut);
        }
        return used;
    }

    function getUsedCategoryShortcuts(exceptKey = null) {
        const used = new Set();
        data.categories.forEach(category => {
            if (category.key === exceptKey) return;
            const shortcut = normalizeShortcutKey(category.shortcut);
            if (shortcut) used.add(shortcut);
        });
        return used;
    }

    function getNextAvailableShortcut(pool, used) {
        return pool.find(key => !used.has(key)) || '';
    }

    function getDefaultShortcutForName(items, name) {
        const found = items.find(item => item.name.toLowerCase() === String(name || '').trim().toLowerCase());
        return found ? found.shortcut : '';
    }

    function applyDefaultShortcutsToCurrentData() {
        const defaultPlayers = getDefaultPlayerItems();
        const usedPlayerShortcuts = new Set();
        Object.keys(data.players).sort((a, b) => parseInt(a) - parseInt(b)).forEach(id => {
            const player = data.players[id];
            const defaultShortcut = getDefaultShortcutForName(defaultPlayers, player.name);
            let shortcut = defaultShortcut || normalizeShortcutKey(player.shortcut);
            if (!shortcut || usedPlayerShortcuts.has(shortcut)) {
                shortcut = getNextAvailableShortcut(PLAYER_KEY_POOL, usedPlayerShortcuts);
            }
            player.shortcut = shortcut;
            if (shortcut) usedPlayerShortcuts.add(shortcut);
        });

        const defaultCategories = getDefaultCategoryItems();
        const usedCategoryShortcuts = new Set();
        data.categories.forEach(category => {
            const defaultShortcut = getDefaultShortcutForName(defaultCategories, category.label);
            let shortcut = defaultShortcut || normalizeShortcutKey(category.shortcut);
            if (!shortcut || usedCategoryShortcuts.has(shortcut)) {
                shortcut = getNextAvailableShortcut(CATEGORY_KEY_POOL, usedCategoryShortcuts);
            }
            category.shortcut = shortcut;
            if (shortcut) usedCategoryShortcuts.add(shortcut);
        });
    }

    function loadDefaultSettings() {
        try {
            const raw = localStorage.getItem(DEFAULT_SETTINGS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveDefaultSettings(settings) {
        localStorage.setItem(DEFAULT_SETTINGS_KEY, JSON.stringify(settings));
    }

    function getDefaultCategories() {
        return getDefaultCategoryItems().map(item => item.name);
    }

    function getDefaultCategoryItems() {
        const settings = loadDefaultSettings();
        return normalizeSavedShortcutItems(settings.categories, DEFAULT_CATEGORIES, DEFAULT_CATEGORY_KEYS, true);
    }

    function getDefaultTeams() {
        const settings = loadDefaultSettings();
        return Array.isArray(settings.teams) && settings.teams.length > 0
            ? settings.teams
            : DEFAULT_TEAMS;
    }

    function getDefaultPlayers() {
        return getDefaultPlayerItems().map(item => item.name);
    }

    function getDefaultPlayerItems() {
        const settings = loadDefaultSettings();
        return normalizeSavedShortcutItems(settings.players, DEFAULT_PLAYERS, DEFAULT_PLAYER_KEYS);
    }

    function getActionKeys() {
        const settings = loadDefaultSettings();
        return {
            plus: normalizeShortcutKey(settings.actionKeys?.plus || DEFAULT_ACTION_KEYS.plus),
            minus: normalizeShortcutKey(settings.actionKeys?.minus || DEFAULT_ACTION_KEYS.minus),
            removePlus: normalizeShortcutKey(settings.actionKeys?.removePlus || DEFAULT_ACTION_KEYS.removePlus),
            removeMinus: normalizeShortcutKey(settings.actionKeys?.removeMinus || DEFAULT_ACTION_KEYS.removeMinus)
        };
    }

    function openDefaultsSettings() {
        const actionKeys = getActionKeys();
        document.getElementById('defaultCategoriesInput').value = formatShortcutItems(getDefaultCategoryItems());
        document.getElementById('defaultTeamsInput').value = getDefaultTeams().join('\n');
        document.getElementById('defaultPlayersInput').value = formatShortcutItems(getDefaultPlayerItems());
        document.getElementById('positiveKeyInput').value = actionKeys.plus;
        document.getElementById('negativeKeyInput').value = actionKeys.minus;
        document.getElementById('removePositiveKeyInput').value = actionKeys.removePlus;
        document.getElementById('removeNegativeKeyInput').value = actionKeys.removeMinus;
        document.getElementById('settingsOverlay').classList.add('active');
    }

    function closeDefaultsSettings() {
        document.getElementById('settingsOverlay').classList.remove('active');
    }

    function saveDefaultsSettings() {
        const categories = normalizeDefaultShortcutList(document.getElementById('defaultCategoriesInput').value, true);
        const teams = normalizeDefaultList(document.getElementById('defaultTeamsInput').value);
        const players = normalizeDefaultShortcutList(document.getElementById('defaultPlayersInput').value);
        const actionKeys = {
            plus: normalizeShortcutKey(document.getElementById('positiveKeyInput').value) || DEFAULT_ACTION_KEYS.plus,
            minus: normalizeShortcutKey(document.getElementById('negativeKeyInput').value) || DEFAULT_ACTION_KEYS.minus,
            removePlus: normalizeShortcutKey(document.getElementById('removePositiveKeyInput').value) || DEFAULT_ACTION_KEYS.removePlus,
            removeMinus: normalizeShortcutKey(document.getElementById('removeNegativeKeyInput').value) || DEFAULT_ACTION_KEYS.removeMinus
        };
        if (categories.length === 0) return alert('Добавьте хотя бы один показатель по умолчанию');
        if (teams.length === 0) return alert('Добавьте хотя бы одну команду по умолчанию');
        if (new Set(Object.values(actionKeys)).size !== Object.values(actionKeys).length) {
            return alert('Клавиши действий должны отличаться друг от друга');
        }

        saveDefaultSettings({ categories, teams, players, actionKeys });
        applyDefaultShortcutsToCurrentData();
        closeDefaultsSettings();
        renderCategoryOptions();
        renderPlayerOptions();
        renderTeamOptions();
        autoSave();
    }

    function initData() {
        const p1 = 'p1';
        data = {
            players: {},
            categories: getDefaultCategoryItems().map((item, index) => ({ key: 'c' + (index + 1), label: item.name, shortcut: item.shortcut })),
            periods: [
                { key: p1, label: '1-10' }
            ],
            activePeriod: p1,
            nextPlayerId: 1,
            colorIndex: 0
        };
    }

    function getNextColor() {
        const color = PLAYER_COLORS[data.colorIndex % PLAYER_COLORS.length];
        data.colorIndex++;
        return color;
    }

    function addPlayerData(name, team, shortcut = '') {
        const id = data.nextPlayerId++;
        const color = getNextColor();
        const defaultShortcut = getDefaultShortcutForName(getDefaultPlayerItems(), name);
        const usedShortcuts = getUsedPlayerShortcuts();
        const preferredShortcut = normalizeShortcutKey(shortcut) || defaultShortcut;
        data.players[id] = {
            name: name,
            team: team || '—',
            color: color,
            shortcut: preferredShortcut && !usedShortcuts.has(preferredShortcut)
                ? preferredShortcut
                : getNextAvailableShortcut(PLAYER_KEY_POOL, usedShortcuts),
            stats: {}
        };
        data.periods.forEach(p => {
            data.players[id].stats[p.key] = {};
            data.categories.forEach(c => { data.players[id].stats[p.key][c.key] = ''; });
        });
        return id;
    }

    function assignColorsToAllPlayers() {
        const ids = Object.keys(data.players);
        ids.sort((a, b) => parseInt(a) - parseInt(b));
        ids.forEach((id, index) => {
            data.players[id].color = PLAYER_COLORS[index % PLAYER_COLORS.length];
        });
        data.colorIndex = ids.length;
    }

    function ensureShortcuts() {
        const defaultPlayers = getDefaultPlayerItems();
        const usedPlayerShortcuts = new Set();
        Object.keys(data.players).sort((a, b) => parseInt(a) - parseInt(b)).forEach(id => {
            const player = data.players[id];
            let shortcut = normalizeShortcutKey(player.shortcut);
            const defaultShortcut = getDefaultShortcutForName(defaultPlayers, player.name);
            if (!shortcut && defaultShortcut && !usedPlayerShortcuts.has(defaultShortcut)) {
                shortcut = defaultShortcut;
            }
            if (!shortcut || usedPlayerShortcuts.has(shortcut)) {
                shortcut = getNextAvailableShortcut(PLAYER_KEY_POOL, usedPlayerShortcuts);
            }
            player.shortcut = shortcut;
            if (shortcut) usedPlayerShortcuts.add(shortcut);
        });

        const defaultCategories = getDefaultCategoryItems();
        const usedCategoryShortcuts = new Set();
        data.categories.forEach(category => {
            let shortcut = normalizeShortcutKey(category.shortcut);
            const defaultShortcut = getDefaultShortcutForName(defaultCategories, category.label);
            if (!shortcut && defaultShortcut && !usedCategoryShortcuts.has(defaultShortcut)) {
                shortcut = defaultShortcut;
            }
            if (!shortcut || usedCategoryShortcuts.has(shortcut)) {
                shortcut = getNextAvailableShortcut(CATEGORY_KEY_POOL, usedCategoryShortcuts);
            }
            category.shortcut = shortcut;
            if (shortcut) usedCategoryShortcuts.add(shortcut);
        });
    }

    function loadFromStorage() {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s) {
            try {
                const p = JSON.parse(s);
                if (p.players && p.categories && p.periods && p.activePeriod) {
                    data = p;
                    if (!data.colorIndex) data.colorIndex = 0;
                    assignColorsToAllPlayers();
                    ensureShortcuts();
                    return true;
                }
            } catch (e) {}
        }
        return false;
    }

    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            document.getElementById('saveStatus').textContent = 'сохранено';
            document.getElementById('saveStatus').style.color = '#22a65a';
            document.getElementById('lastActionStatus').classList.remove('save-error');
        } catch (e) {
            document.getElementById('saveStatus').textContent = 'ошибка';
            document.getElementById('saveStatus').style.color = '#b33';
            const status = document.getElementById('lastActionStatus');
            status.classList.add('save-error');
            status.textContent = 'ошибка сохранения';
        }
    }

    function autoSave() { saveToStorage(); }

    function addPeriod() {
        const input = document.getElementById('periodNameInput');
        const label = input.value.trim();
        if (!label) return alert('Введите название периода');
        if (data.periods.some(p => p.label === label)) return alert('Уже есть');
        const key = 'p' + Date.now();
        data.periods.push({ key, label });
        for (const id in data.players) {
            data.players[id].stats[key] = {};
            data.categories.forEach(c => { data.players[id].stats[key][c.key] = ''; });
        }
        data.activePeriod = key;
        input.value = '';
        renderAll();
        autoSave();
    }

    function removePeriod(key) {
        if (data.periods.length <= 1) return alert('Нельзя удалить последний период');
        const p = data.periods.find(x => x.key === key);
        if (!p) return;
        openConfirm(
            '⚠️ Удалить период?',
            `Вы действительно хотите удалить период <span class="highlight">${p.label}</span>?<br><br><span style="font-size:13px;color:#888;">Все показатели за этот период будут удалены.</span>`,
            'Удалить',
            { type: 'deletePeriod', key: key }
        );
    }

    function setActivePeriod(key) {
        if (data.periods.some(p => p.key === key)) {
            data.activePeriod = key;
            renderAll();
            autoSave();
        }
    }

    function addPlayer() {
        const name = document.getElementById('playerNameInput').value.trim();
        const team = document.getElementById('teamNameInput').value.trim() || '—';
        const shortcutInput = document.getElementById('playerKeyInput');
        const defaultShortcut = getDefaultShortcutForName(getDefaultPlayerItems(), name);
        const shortcut = normalizeShortcutKey(shortcutInput.value) || defaultShortcut;
        if (!name) return alert('Введите имя');
        for (const id in data.players) {
            if (data.players[id].name === name) return alert('Такой игрок уже есть');
        }
        if (!shortcut) return alert('Укажите клавишу для игрока');
        if (getUsedPlayerShortcuts().has(shortcut)) return alert('Эта клавиша игрока уже используется');
        addPlayerData(name, team, shortcut);
        document.getElementById('playerNameInput').value = '';
        shortcutInput.value = '';
        document.getElementById('teamNameInput').value = '';
        renderAll();
        autoSave();
    }

    function removePlayer(id) {
        const name = data.players[id]?.name || 'неизвестный игрок';
        openConfirm(
            '⚠️ Удалить игрока?',
            `Вы действительно хотите удалить игрока <span class="highlight">${name}</span>?<br><br><span style="font-size:13px;color:#888;">Все его показатели за все периоды будут удалены без возможности восстановления.</span>`,
            'Удалить',
            { type: 'deletePlayer', id: id, name: name }
        );
    }

    function addCategory() {
        const input = document.getElementById('categoryNameInput');
        const shortcutInput = document.getElementById('categoryKeyInput');
        const label = input.value.trim().toUpperCase();
        const defaultShortcut = getDefaultShortcutForName(getDefaultCategoryItems(), label);
        const shortcut = normalizeShortcutKey(shortcutInput.value) || defaultShortcut;
        if (!label) return alert('Введите название');
        if (data.categories.some(c => c.label === label)) return alert('Уже есть');
        if (!shortcut) return alert('Укажите клавишу для показателя');
        if (getUsedCategoryShortcuts().has(shortcut)) return alert('Эта клавиша показателя уже используется');
        const key = 'c' + Date.now();
        data.categories.push({
            key,
            label,
            shortcut
        });
        for (const id in data.players) {
            data.periods.forEach(p => { data.players[id].stats[p.key][key] = ''; });
        }
        input.value = '';
        shortcutInput.value = '';
        renderAll();
        autoSave();
    }

    function removeCategory(key) {
        const c = data.categories.find(x => x.key === key);
        if (!c) return;
        openConfirm(
            '⚠️ Удалить показатель?',
            `Вы действительно хотите удалить показатель <span class="highlight">${c.label}</span>?<br><br><span style="font-size:13px;color:#888;">Все данные по этому показателю у всех игроков будут удалены.</span>`,
            'Удалить',
            { type: 'deleteCategory', key: key, label: c.label }
        );
    }

    function updateStat(playerId, periodKey, categoryKey, action) {
        const current = data.players[playerId].stats[periodKey]?.[categoryKey] || '';
        let val = current;
        if (action === '+') val = current + '+';
        else if (action === '-') val = current + '-';
        data.players[playerId].stats[periodKey][categoryKey] = val;
        setLastActionStatus(playerId, categoryKey, action === '+' ? 'доб +' : 'доб -');
        renderAll();
        autoSave();
    }

    function removeLastActionDirect(playerId, periodKey, categoryKey, action) {
        if (!data.players[playerId] || !data.players[playerId].stats[periodKey]) return false;
        let current = data.players[playerId].stats[periodKey][categoryKey] || '';
        const lastIndex = current.lastIndexOf(action);
        if (lastIndex === -1) return false;

        current = current.slice(0, lastIndex) + current.slice(lastIndex + 1);
        data.players[playerId].stats[periodKey][categoryKey] = current;
        setLastActionStatus(playerId, categoryKey, action === '+' ? 'уд +' : 'уд -');
        renderAll();
        autoSave();
        return true;
    }

    function setLastActionStatus(playerId, categoryKey, actionLabel) {
        const player = data.players[playerId];
        const category = data.categories.find(c => c.key === categoryKey);
        const playerName = player?.name || 'игрок';
        const playerShortcut = normalizeShortcutKey(player?.shortcut);
        const categoryLabel = category?.label || 'показатель';
        const categoryShortcut = normalizeShortcutKey(category?.shortcut);
        const playerPart = playerShortcut ? `${playerName} (${playerShortcut})` : playerName;
        const categoryPart = categoryShortcut ? `${categoryLabel} (${categoryShortcut})` : categoryLabel;
        const status = document.getElementById('lastActionStatus');
        if (status) {
            status.classList.remove('save-error');
            status.innerHTML = `<strong>${playerPart}</strong> | <strong>${categoryPart}</strong> | <strong>${actionLabel}</strong>`;
        }
    }

    function resetShortcutBuffer() {
        shortcutBuffer = '';
        clearTimeout(shortcutTimer);
        shortcutTimer = null;
        const status = document.getElementById('shortcutStatus');
        if (status) status.textContent = '—';
    }

    function setShortcutBuffer(value, context = {}) {
        shortcutBuffer = value;
        clearTimeout(shortcutTimer);
        shortcutTimer = setTimeout(resetShortcutBuffer, 1500);
        const status = document.getElementById('shortcutStatus');
        if (!status) return;
        if (!shortcutBuffer) {
            status.textContent = '—';
            return;
        }

        const playerName = context.player ? context.player.name : null;
        const playerShortcut = context.player ? normalizeShortcutKey(context.player.shortcut) : '';
        const categoryLabel = context.category ? context.category.label : null;
        const categoryShortcut = context.category ? normalizeShortcutKey(context.category.shortcut) : '';

        if (playerName && categoryLabel) {
            status.textContent = `${playerName} (${playerShortcut}) | ${categoryLabel} (${categoryShortcut})`;
        } else if (playerName) {
            status.textContent = `${playerName} (${playerShortcut})`;
        } else {
            status.textContent = shortcutBuffer;
        }
    }

    function isTypingTarget(target) {
        return Boolean(target.closest('input, textarea, select, button'));
    }

    function handleShortcutKey(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTypingTarget(event.target)) return;
        if (document.getElementById('confirmOverlay').classList.contains('active')) return;
        if (document.getElementById('settingsOverlay').classList.contains('active')) return;

        const rawKey = String(event.key || '');
        if (rawKey.length !== 1) return;
        const pressedKey = normalizeShortcutKey(rawKey);
        if (!pressedKey) return;

        ensureShortcuts();

        const playersByKey = {};
        for (const id in data.players) {
            const shortcut = normalizeShortcutKey(data.players[id].shortcut);
            if (shortcut && !playersByKey[shortcut]) playersByKey[shortcut] = id;
        }

        const categoriesByKey = {};
        data.categories.forEach(category => {
            const shortcut = normalizeShortcutKey(category.shortcut);
            if (shortcut && !categoriesByKey[shortcut]) categoriesByKey[shortcut] = category.key;
        });

        const actionKeys = getActionKeys();
        const actionByKey = {};
        actionByKey[actionKeys.plus] = '+';
        actionByKey[actionKeys.minus] = '-';
        actionByKey[actionKeys.removePlus] = 'removePlus';
        actionByKey[actionKeys.removeMinus] = 'removeMinus';

        if (shortcutBuffer.length === 0) {
            if (!playersByKey[pressedKey]) return;
            event.preventDefault();
            setShortcutBuffer(pressedKey, { player: data.players[playersByKey[pressedKey]] });
            return;
        }

        if (shortcutBuffer.length === 1) {
            if (categoriesByKey[pressedKey]) {
                event.preventDefault();
                setShortcutBuffer(shortcutBuffer + pressedKey, {
                    player: data.players[playersByKey[shortcutBuffer[0]]],
                    category: data.categories.find(category => category.key === categoriesByKey[pressedKey])
                });
                return;
            }
            if (playersByKey[pressedKey]) {
                event.preventDefault();
                setShortcutBuffer(pressedKey, { player: data.players[playersByKey[pressedKey]] });
                return;
            }
            resetShortcutBuffer();
            return;
        }

        if (shortcutBuffer.length === 2) {
            const action = actionByKey[pressedKey];
            if (action) {
                const playerId = playersByKey[shortcutBuffer[0]];
                const categoryKey = categoriesByKey[shortcutBuffer[1]];
                if (playerId && categoryKey && data.activePeriod) {
                    event.preventDefault();
                    resetShortcutBuffer();
                    if (action === 'removePlus') {
                        removeLastActionDirect(playerId, data.activePeriod, categoryKey, '+');
                    } else if (action === 'removeMinus') {
                        removeLastActionDirect(playerId, data.activePeriod, categoryKey, '-');
                    } else {
                        updateStat(playerId, data.activePeriod, categoryKey, action);
                    }
                    return;
                }
            }
            if (playersByKey[pressedKey]) {
                event.preventDefault();
                setShortcutBuffer(pressedKey, { player: data.players[playersByKey[pressedKey]] });
                return;
            }
            resetShortcutBuffer();
        }
    }

    // ====== Дополнительные действия через меню ======
    function clearAllActions(playerId, periodKey, categoryKey) {
        const playerName = data.players[playerId]?.name || 'игрок';
        const categoryLabel = data.categories.find(c => c.key === categoryKey)?.label || categoryKey;
        const periodLabel = data.periods.find(p => p.key === periodKey)?.label || periodKey;
        const current = data.players[playerId]?.stats[periodKey]?.[categoryKey] || '';
        if (!current) {
            alert('Нет действий для очистки');
            return;
        }
        openConfirm(
            '🗑️ Очистить все действия?',
            `Вы действительно хотите очистить все действия по показателю <span class="highlight">${categoryLabel}</span> у игрока <span class="highlight">${playerName}</span> за период <span class="highlight">${periodLabel}</span>?<br><br><span style="font-size:13px;color:#888;">Будет удалено ${current.length} записей (+ и −) без возможности восстановления.</span>`,
            'Очистить всё',
            { type: 'clearAllActions', playerId: playerId, periodKey: periodKey, categoryKey: categoryKey }
        );
    }

    function removeLastPlus(playerId, periodKey, categoryKey) {
        const playerName = data.players[playerId]?.name || 'игрок';
        const categoryLabel = data.categories.find(c => c.key === categoryKey)?.label || categoryKey;
        const periodLabel = data.periods.find(p => p.key === periodKey)?.label || periodKey;
        const current = data.players[playerId]?.stats[periodKey]?.[categoryKey] || '';
        const plusCount = (current.match(/\+/g) || []).length;
        if (plusCount === 0) {
            alert('Нет положительных действий (+) для удаления');
            return;
        }
        openConfirm(
            '↩️ Удалить последнее +?',
            `Удалить последнее положительное действие (+) по показателю <span class="highlight">${categoryLabel}</span> у игрока <span class="highlight">${playerName}</span> за период <span class="highlight">${periodLabel}</span>?<br><br><span style="font-size:13px;color:#888;">Осталось ${plusCount - 1} положительных действий.</span>`,
            'Удалить +',
            { type: 'removeLastPlus', playerId: playerId, periodKey: periodKey, categoryKey: categoryKey }
        );
    }

    function removeLastMinus(playerId, periodKey, categoryKey) {
        const playerName = data.players[playerId]?.name || 'игрок';
        const categoryLabel = data.categories.find(c => c.key === categoryKey)?.label || categoryKey;
        const periodLabel = data.periods.find(p => p.key === periodKey)?.label || periodKey;
        const current = data.players[playerId]?.stats[periodKey]?.[categoryKey] || '';
        const minusCount = (current.match(/-/g) || []).length;
        if (minusCount === 0) {
            alert('Нет отрицательных действий (-) для удаления');
            return;
        }
        openConfirm(
            '↩️ Удалить последнее -?',
            `Удалить последнее отрицательное действие (-) по показателю <span class="highlight">${categoryLabel}</span> у игрока <span class="highlight">${playerName}</span> за период <span class="highlight">${periodLabel}</span>?<br><br><span style="font-size:13px;color:#888;">Осталось ${minusCount - 1} отрицательных действий.</span>`,
            'Удалить -',
            { type: 'removeLastMinus', playerId: playerId, periodKey: periodKey, categoryKey: categoryKey }
        );
    }

    // ====== Функции подсветки ======
    function setupHoverEffects() {
        document.removeEventListener('mouseover', handleHover);
        document.removeEventListener('mouseout', handleHoverOut);

        document.addEventListener('mouseover', handleHover);
        document.addEventListener('mouseout', handleHoverOut);
    }

    function renderTeamOptions() {
        const options = new Set(getDefaultTeams());
        for (const id in data.players) {
            const team = String(data.players[id].team || '').trim();
            if (team && team !== '—') options.add(team);
        }

        const datalist = document.getElementById('teamOptions');
        datalist.innerHTML = '';
        options.forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            datalist.appendChild(option);
        });
    }

    function renderPlayerOptions() {
        const options = new Set(getDefaultPlayers());
        for (const id in data.players) {
            const player = String(data.players[id].name || '').trim();
            if (player) options.add(player);
        }

        const datalist = document.getElementById('playerOptions');
        datalist.innerHTML = '';
        options.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            datalist.appendChild(option);
        });
    }

    function renderCategoryOptions() {
        const options = new Set(getDefaultCategories());
        data.categories.forEach(category => {
            const label = String(category.label || '').trim();
            if (label) options.add(label);
        });

        const datalist = document.getElementById('categoryOptions');
        datalist.innerHTML = '';
        options.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            datalist.appendChild(option);
        });
    }

    function updatePlayerShortcutInput() {
        const name = document.getElementById('playerNameInput').value.trim();
        document.getElementById('playerKeyInput').value = getDefaultShortcutForName(getDefaultPlayerItems(), name);
    }

    function updateCategoryShortcutInput() {
        const label = document.getElementById('categoryNameInput').value.trim().toUpperCase();
        document.getElementById('categoryKeyInput').value = getDefaultShortcutForName(getDefaultCategoryItems(), label);
    }

    function handleHover(e) {
        const td = e.target.closest('td');
        if (!td) return;

        const table = td.closest('table');
        if (!table) return;

        clearHighlights(table);

        const rowIndex = td.parentElement.rowIndex;
        const cellIndex = td.cellIndex;

        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.rowIndex === rowIndex) {
                row.classList.add('hover-row');
            }
        });

        rows.forEach(row => {
            const cells = row.querySelectorAll('td, th');
            if (cells[cellIndex]) {
                cells[cellIndex].classList.add('hover-col');
            }
        });

        td.classList.add('hover-cell');
    }

    function handleHoverOut(e) {
        const td = e.target.closest('td');
        if (!td) return;

        const table = td.closest('table');
        if (!table) return;

        clearHighlights(table);
    }

    function clearHighlights(table) {
        table.querySelectorAll('.hover-row, .hover-col, .hover-cell').forEach(el => {
            el.classList.remove('hover-row', 'hover-col', 'hover-cell');
        });
    }

    function formatHotkey(shortcut) {
        const key = normalizeShortcutKey(shortcut);
        return key ? ` <span class="hotkey">(${key})</span>` : '';
    }

    function renderAll() {
        const container = document.getElementById('teamsContainer');
        const cats = data.categories;
        const periods = data.periods;
        const active = data.activePeriod;
        const ids = Object.keys(data.players);
        const actionKeys = getActionKeys();

        ensureShortcuts();

        renderCategoryOptions();
        renderPlayerOptions();
        renderTeamOptions();

        const tabs = document.getElementById('periodTabs');
        tabs.innerHTML = periods.map(p =>
            `<span class="period-tab ${p.key === active ? 'active' : ''}" data-action="set-active-period" data-period-key="${p.key}">
                ${p.label}
                <span class="del" data-action="remove-period" data-period-key="${p.key}">✕</span>
            </span>`
        ).join('');
        const activeObj = periods.find(p => p.key === active);
        document.getElementById('activePeriodName').textContent = activeObj ? activeObj.label : '—';

        if (!active || !periods.some(p => p.key === active) || cats.length === 0) {
            let msg = 'Добавьте ';
            msg += 'показатели';
            container.innerHTML = `<div class="empty">${msg}</div>`;
            document.getElementById('totalActions').textContent = '0';
            return;
        }

        if (ids.length === 0) {
            const colspan = cats.length + 2;
            container.innerHTML = `<div class="team-block">
                <div class="team-title">
                    <span>Команды <span class="sub">0</span></span>
                    <span class="period-badge"><strong>${activeObj ? activeObj.label : '—'}</strong></span>
                </div>
                <table>
                    <thead><tr>
                        <th style="text-align:left;padding-left:4px;">Игрок</th>
                        ${cats.map(c => `<th>${c.label}${formatHotkey(c.shortcut)}
                            <span class="del-cat" data-action="remove-category" data-category-key="${c.key}">✕</span>
                        </th>`).join('')}
                        <th>Всего</th>
                    </tr></thead>
                    <tbody>
                        <tr><td class="empty" colspan="${colspan}">Добавьте игроков</td></tr>
                    </tbody>
                </table>
            </div>`;
            document.getElementById('totalActions').textContent = '0';
            setupHoverEffects();
            return;
        }

        assignColorsToAllPlayers();

        const teams = {};
        ids.forEach(id => {
            const t = data.players[id].team || '—';
            if (!teams[t]) teams[t] = [];
            teams[t].push(id);
        });
        const sortedTeams = Object.keys(teams).sort();

        let html = '';
        let grandTotal = 0;
        let dropdownCounter = 0;

        sortedTeams.forEach(teamName => {
            const playerIds = teams[teamName];
            let teamTotalLen = 0, teamTotalPlus = 0;
            const categoryTotals = {};
            cats.forEach(c => {
                categoryTotals[c.key] = { len: 0, plus: 0 };
            });

            html += `<div class="team-block">
                <div class="team-title">
                    <span>${teamName} <span class="sub">${playerIds.length}</span></span>
                    <span class="period-badge"><strong>${activeObj ? activeObj.label : '—'}</strong></span>
                </div>
                <table>
                    <thead><tr>
                        <th style="text-align:left;padding-left:4px;">Игрок</th>`;

            cats.forEach(c => {
                html += `<th>${c.label}${formatHotkey(c.shortcut)}
                            <span class="del-cat" data-action="remove-category" data-category-key="${c.key}">✕</span>
                        </th>`;
            });
            html += `<th>Всего</th></tr></thead><tbody>`;

            playerIds.forEach(id => {
                const p = data.players[id];
                const stats = p.stats[active] || {};
                const playerColor = p.color || '#333';
                let rowLen = 0, rowPlus = 0;

                html += `<tr><td class="player-cell">
                            <span class="player-name" style="color:${playerColor};">${p.name}</span>${formatHotkey(p.shortcut)}
                            <span class="del-player" data-action="remove-player" data-player-id="${id}">✕</span>
                        </td>`;

                cats.forEach(c => {
                    const str = stats[c.key] || '';
                    const len = str.length;
                    const plus = (str.match(/\+/g) || []).length;
                    const minus = (str.match(/-/g) || []).length;
                    rowLen += len;
                    rowPlus += plus;
                    categoryTotals[c.key].len += len;
                    categoryTotals[c.key].plus += plus;

                    const dropdownId = 'dd_' + dropdownCounter++;
                    const hasActions = len > 0;

                    html += `<td>
                                <div class="btn-group">
                                    <button class="btn-act plus" data-action="update-stat" data-player-id="${id}" data-period-key="${active}" data-category-key="${c.key}" data-symbol="+">+${formatHotkey(actionKeys.plus)}</button>
                                    <button class="btn-act minus" data-action="update-stat" data-player-id="${id}" data-period-key="${active}" data-category-key="${c.key}" data-symbol="-">−${formatHotkey(actionKeys.minus)}</button>
                                    <div class="dropdown">
                                        <button class="btn-more" data-action="toggle-dropdown" data-dropdown-id="${dropdownId}" title="Дополнительные действия">•••</button>
                                        <div class="dropdown-menu" id="${dropdownId}">
                                            <div class="menu-info">${p.name} · ${c.label}</div>
                                            <div class="menu-divider"></div>
                                            ${hasActions ? `
                                                <button class="menu-item" data-action="remove-last-plus" data-player-id="${id}" data-period-key="${active}" data-category-key="${c.key}">
                                                    ➖ Удалить последнее +
                                                </button>
                                                <button class="menu-item" data-action="remove-last-minus" data-player-id="${id}" data-period-key="${active}" data-category-key="${c.key}">
                                                    ➖ Удалить последнее −
                                                </button>
                                                <div class="menu-divider"></div>
                                                <button class="menu-item danger" data-action="clear-all-actions" data-player-id="${id}" data-period-key="${active}" data-category-key="${c.key}">
                                                    🗑️ Очистить всё (${len})
                                                </button>
                                            ` : `
                                                <button class="menu-item" style="color:#999; cursor:default;" disabled>
                                                    Нет действий
                                                </button>
                                            `}
                                        </div>
                                    </div>
                                </div>
                                <div class="stat-badge">
                                    ${len === 0 ? '—' : `<span class="plus-count">+${plus}</span><span class="sep">|</span><span class="minus-count">−${minus}</span>`}
                                </div>
                            </td>`;
                });

                const totalPct = rowLen === 0 ? 0 : Math.round((rowPlus / rowLen) * 100);
                teamTotalLen += rowLen;
                teamTotalPlus += rowPlus;
                grandTotal += rowLen;

                html += `<td class="total-cell">
                            ${rowLen === 0 ? '—' : `${rowLen} <span class="${totalPct >= 50 ? 'good' : 'bad'}">${totalPct}%</span>`}
                        </td></tr>`;
            });

            const teamPct = teamTotalLen === 0 ? 0 : Math.round((teamTotalPlus / teamTotalLen) * 100);
            html += `<tr class="team-total-row">
                        <td class="label">итого</td>`;
            cats.forEach(c => {
                const t = categoryTotals[c.key];
                const pct = t.len === 0 ? 0 : Math.round((t.plus / t.len) * 100);
                html += `<td class="team-total-stat">
                            ${t.len === 0 ? '—' : `${t.len} <span class="${pct >= 50 ? 'good' : 'bad'}">${pct}%</span>`}
                        </td>`;
            });
            html += `<td class="team-total-stat">
                        ${teamTotalLen} <span class="${teamPct >= 50 ? 'good' : 'bad'}">${teamPct}%</span>
                    </td></tr>`;

            html += `</tbody></table></div>`;
        });

        container.innerHTML = html;
        document.getElementById('totalActions').textContent = grandTotal;

        setupHoverEffects();
    }

    function resetAll() {
        if (!confirm('Удалить всё (всех игроков, показатели и статистику)?')) return;
        initData();
        renderAll();
        autoSave();
    }

    function downloadTextFile(filename, text, mimeType) {
        const blob = new Blob([text], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function exportSourceData() {
        const payload = {
            type: 'ttd-source-data',
            version: 1,
            exportedAt: new Date().toISOString(),
            data: JSON.parse(JSON.stringify(data))
        };
        downloadTextFile('source.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    }

    function importSourceData() {
        document.getElementById('sourceImportInput').click();
    }

    function readSourceFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    resolve(getImportedData(JSON.parse(reader.result)));
                } catch (e) {
                    reject(new Error(`${file.name}: ${e.message || 'некорректный файл'}`));
                }
            };
            reader.onerror = () => reject(new Error(`${file.name}: не удалось прочитать файл`));
            reader.readAsText(file);
        });
    }

    function getImportedData(payload) {
        const imported = payload?.type === 'ttd-source-data' ? payload.data : payload;
        if (!imported || typeof imported !== 'object') throw new Error('Некорректный файл исходников');
        if (!imported.players || !Array.isArray(imported.categories) || !Array.isArray(imported.periods)) {
            throw new Error('В файле нет игроков, периодов или показателей');
        }
        return imported;
    }

    function normalizeActions(value) {
        return typeof value === 'string' ? value.replace(/[^+-]/g, '') : '';
    }

    function ensureCategoryByLabel(label) {
        let category = data.categories.find(c => c.label === label);
        if (category) return category.key;

        const key = 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        data.categories.push({ key, label });
        for (const id in data.players) {
            data.periods.forEach(p => {
                if (!data.players[id].stats[p.key]) data.players[id].stats[p.key] = {};
                data.players[id].stats[p.key][key] = '';
            });
        }
        return key;
    }

    function ensurePeriodByLabel(label) {
        let period = data.periods.find(p => p.label === label);
        if (period) return period.key;

        const key = 'p' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        data.periods.push({ key, label });
        for (const id in data.players) {
            data.players[id].stats[key] = {};
            data.categories.forEach(c => { data.players[id].stats[key][c.key] = ''; });
        }
        if (!data.activePeriod) data.activePeriod = key;
        return key;
    }

    function findPlayerByNameAndTeam(name, team) {
        for (const id in data.players) {
            if (data.players[id].name === name && (data.players[id].team || '—') === team) return id;
        }
        return null;
    }

    function mergeSourceData(imported) {
        const categoryMap = {};
        imported.categories.forEach(c => {
            const label = String(c?.label || '').trim().toUpperCase();
            if (label) categoryMap[c.key] = ensureCategoryByLabel(label);
        });

        const periodMap = {};
        imported.periods.forEach(p => {
            const label = String(p?.label || '').trim();
            if (label) periodMap[p.key] = ensurePeriodByLabel(label);
        });

        let addedPlayers = 0;
        let mergedPlayers = 0;
        let importedActions = 0;

        for (const importedId in imported.players) {
            const sourcePlayer = imported.players[importedId];
            const name = String(sourcePlayer?.name || '').trim();
            if (!name) continue;

            const team = String(sourcePlayer?.team || '—').trim() || '—';
            let targetId = findPlayerByNameAndTeam(name, team);
            if (targetId) {
                mergedPlayers++;
            } else {
                targetId = addPlayerData(name, team);
                addedPlayers++;
            }

            for (const sourcePeriodKey in sourcePlayer.stats || {}) {
                const targetPeriodKey = periodMap[sourcePeriodKey];
                if (!targetPeriodKey) continue;

                if (!data.players[targetId].stats[targetPeriodKey]) data.players[targetId].stats[targetPeriodKey] = {};
                const sourceStats = sourcePlayer.stats[sourcePeriodKey] || {};

                for (const sourceCategoryKey in sourceStats) {
                    const targetCategoryKey = categoryMap[sourceCategoryKey];
                    if (!targetCategoryKey) continue;

                    const actions = normalizeActions(sourceStats[sourceCategoryKey]);
                    if (!actions) continue;

                    data.players[targetId].stats[targetPeriodKey][targetCategoryKey] =
                        (data.players[targetId].stats[targetPeriodKey][targetCategoryKey] || '') + actions;
                    importedActions += actions.length;
                }
            }
        }

        assignColorsToAllPlayers();
        return { addedPlayers, mergedPlayers, importedActions };
    }

    document.getElementById('sourceImportInput').addEventListener('change', async (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;

        try {
            const importedItems = await Promise.all(files.map(readSourceFile));
            if (!confirm(`Импортировать исходники из файлов: ${files.length}?\n\nСовпадающие игроки будут объединены, действия будут добавлены к текущим.`)) return;

            const total = { addedPlayers: 0, mergedPlayers: 0, importedActions: 0 };
            importedItems.forEach(imported => {
                const result = mergeSourceData(imported);
                total.addedPlayers += result.addedPlayers;
                total.mergedPlayers += result.mergedPlayers;
                total.importedActions += result.importedActions;
            });

            renderAll();
            autoSave();
            alert(`Импорт завершен.\nФайлов: ${files.length}\nДобавлено игроков: ${total.addedPlayers}\nОбъединено игроков: ${total.mergedPlayers}\nДобавлено действий: ${total.importedActions}`);
        } catch (e) {
            alert(e.message || 'Не удалось импортировать исходники');
        }
    });

function exportData() {
    const cats = data.categories.map(c => c.label);
    const periods = data.periods;
    const players = data.players;

    // Сортируем игроков по командам
    const teams = {};
    for (const id in players) {
        const p = players[id];
        const team = p.team || '—';
        if (!teams[team]) teams[team] = [];
        teams[team].push(id);
    }
    const sortedTeams = Object.keys(teams).sort();

    let csv = '';
    let separator = ';';

    // Функция для вывода данных по периоду
    function exportPeriod(period, periodLabel, isTotal = false) {
        // Заголовки столбцов
        csv += `Период${separator}Команда${separator}Игрок`;
        cats.forEach(c => { csv += `${separator}${c}`; });
        csv += `${separator}Итого\n`;

        sortedTeams.forEach(teamName => {
            const playerIds = teams[teamName];
            const teamTotals = {};
            cats.forEach(c => { teamTotals[c] = { len: 0, plus: 0 }; });
            let teamTotalLen = 0, teamTotalPlus = 0;
            let hasAnyPlayer = false;

            // Выводим игроков
            playerIds.forEach(id => {
                const p = players[id];
                let stats;

                if (isTotal) {
                    // Для итогового периода суммируем все периоды
                    stats = {};
                    cats.forEach(catLabel => {
                        const catKey = data.categories.find(c => c.label === catLabel)?.key;
                        if (!catKey) return;
                        let totalStr = '';
                        periods.forEach(per => {
                            const periodStats = p.stats[per.key] || {};
                            totalStr += periodStats[catKey] || '';
                        });
                        stats[catKey] = totalStr;
                    });
                } else {
                    stats = p.stats[period.key] || {};
                }

                // Проверяем, есть ли у игрока хоть одно действие
                let hasActions = false;
                let row = `${periodLabel}${separator}${teamName}${separator}${p.name}`;
                let rowLen = 0, rowPlus = 0;

                cats.forEach(catLabel => {
                    const catKey = data.categories.find(c => c.label === catLabel)?.key;
                    if (!catKey) {
                        row += `${separator}- (0%)`;
                        return;
                    }
                    const str = stats[catKey] || '';
                    const len = str.length;
                    const plus = (str.match(/\+/g) || []).length;
                    const minus = (str.match(/-/g) || []).length;

                    if (len > 0) hasActions = true;
                    rowLen += len;
                    rowPlus += plus;
                    teamTotals[catLabel].len += len;
                    teamTotals[catLabel].plus += plus;
                    teamTotalLen += len;
                    teamTotalPlus += plus;

                    if (len === 0) {
                        row += `${separator}- (0%)`;
                    } else {
                        const pct = Math.round((plus / len) * 100);
                        row += `${separator}${len} (${pct}%)`;
                    }
                });

                // Пропускаем игрока, если нет действий
                if (!hasActions) return;

                hasAnyPlayer = true;
                const totalPct = rowLen === 0 ? 0 : Math.round((rowPlus / rowLen) * 100);
                row += `${separator}${rowLen} (${totalPct}%)`;
                csv += row + '\n';
            });

            // Итого по команде
            if (hasAnyPlayer) {
                let teamRow = `${periodLabel}${separator}${teamName}${separator}Итого`;
                const teamTotalPct = teamTotalLen === 0 ? 0 : Math.round((teamTotalPlus / teamTotalLen) * 100);
                cats.forEach(catLabel => {
                    const t = teamTotals[catLabel];
                    if (t.len === 0) {
                        teamRow += `${separator}- (0%)`;
                    } else {
                        const pct = Math.round((t.plus / t.len) * 100);
                        teamRow += `${separator}${t.len} (${pct}%)`;
                    }
                });
                teamRow += `${separator}${teamTotalLen} (${teamTotalPct}%)`;
                csv += teamRow + '\n';
            }
        });

        // Пустая строка между периодами
        csv += '\n';
    }

    // Экспортируем все периоды
    periods.forEach(period => {
        exportPeriod(period, period.label, false);
    });

    // Экспортируем итоговый период "ВСЕГО"
    exportPeriod(null, 'ВСЕГО', true);

    downloadTextFile('report.csv', '\uFEFF' + csv, 'text/csv;charset=utf-8');
}


    function setupClickActions() {
        document.addEventListener('click', (event) => {
            const el = event.target.closest('[data-action]');
            if (!el) return;

            const action = el.dataset.action;
            const playerId = el.dataset.playerId ? Number(el.dataset.playerId) : null;
            const periodKey = el.dataset.periodKey;
            const categoryKey = el.dataset.categoryKey;

            switch (action) {
                case 'add-player':
                    addPlayer();
                    break;
                case 'add-category':
                    addCategory();
                    break;
                case 'add-period':
                    addPeriod();
                    break;
                case 'reset-all':
                    resetAll();
                    break;
                case 'import-source-data':
                    importSourceData();
                    break;
                case 'export-source-data':
                    exportSourceData();
                    break;
                case 'export-data':
                    exportData();
                    break;
                case 'open-defaults-settings':
                    openDefaultsSettings();
                    break;
                case 'close-confirm':
                    closeConfirm();
                    break;
                case 'close-defaults-settings':
                    closeDefaultsSettings();
                    break;
                case 'save-defaults-settings':
                    saveDefaultsSettings();
                    break;
                case 'set-active-period':
                    setActivePeriod(periodKey);
                    break;
                case 'remove-period':
                    event.stopPropagation();
                    removePeriod(periodKey);
                    break;
                case 'remove-category':
                    removeCategory(categoryKey);
                    break;
                case 'remove-player':
                    removePlayer(playerId);
                    break;
                case 'update-stat':
                    updateStat(playerId, periodKey, categoryKey, el.dataset.symbol);
                    break;
                case 'toggle-dropdown':
                    toggleDropdown(el.dataset.dropdownId, event);
                    break;
                case 'remove-last-plus':
                    removeLastPlus(playerId, periodKey, categoryKey);
                    closeAllDropdowns();
                    break;
                case 'remove-last-minus':
                    removeLastMinus(playerId, periodKey, categoryKey);
                    closeAllDropdowns();
                    break;
                case 'clear-all-actions':
                    clearAllActions(playerId, periodKey, categoryKey);
                    closeAllDropdowns();
                    break;
            }
        });
    }
    setupClickActions();

    const loaded = loadFromStorage();
    if (!loaded) initData();
    renderAll();
    if (!loaded) saveToStorage();

    window.addEventListener('beforeunload', () => saveToStorage());
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveToStorage(); });

    document.getElementById('playerNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') addPlayer(); });
    document.getElementById('playerNameInput').addEventListener('input', updatePlayerShortcutInput);
    document.getElementById('categoryNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });
    document.getElementById('categoryNameInput').addEventListener('input', updateCategoryShortcutInput);
    document.getElementById('periodNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') addPeriod(); });
