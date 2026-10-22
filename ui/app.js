(function () {
    const { FORMATS, convert, targetsFor, kindOf, extOf } = window.FFConvert;
    const $ = (id) => document.getElementById(id);

    const queue = [];
    let nextId = 1;
    let searchTerm = '';
    const preferredTarget = new URLSearchParams(location.search).get('to');

    /* ---------- Helpers ---------- */

    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function iconFor(file) {
        return { image: 'image', data: 'table_chart', markdown: 'article', html: 'code', text: 'description' }[kindOf(file)] || 'insert_drive_file';
    }

    let toastTimer;
    function toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
    }

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'class') node.className = v;
            else if (k === 'text') node.textContent = v;
            else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v);
        });
        children.forEach((c) => c && node.append(c));
        return node;
    }

    function download(item) {
        const a = el('a', { href: item.result.url, download: item.result.name });
        document.body.append(a);
        a.click();
        a.remove();
    }

    /* ---------- History (per signed-in account, stored on this device) ---------- */

    const historyKey = () => `ff_history_${(window.FFAuth.user && window.FFAuth.user.id) || 'guest'}`;

    function readHistory() {
        try { return JSON.parse(localStorage.getItem(historyKey())) || []; } catch { return []; }
    }

    function addHistory(entry) {
        const list = [entry, ...readHistory()].slice(0, 100);
        try { localStorage.setItem(historyKey(), JSON.stringify(list)); } catch { /* storage unavailable */ }
        renderHistory();
    }

    function renderHistory() {
        const list = readHistory().filter((h) => h.name.toLowerCase().includes(searchTerm));
        const ul = $('history');
        ul.replaceChildren(...list.map((h) => el('li', { class: 'queue-item' }, [
            el('span', { class: 'material-icons file-icon', text: 'task_alt' }),
            el('div', { class: 'file-meta' }, [
                el('div', { class: 'file-name', text: h.name }),
                el('div', { class: 'file-sub', text: `${h.from.toUpperCase()} → ${FORMATS[h.to] ? FORMATS[h.to].label : h.to} · ${formatSize(h.size)} · ${new Date(h.at).toLocaleString()}` }),
            ]),
        ])));
        $('history-empty').hidden = list.length > 0;
        const total = readHistory().length;
        $('history-count').textContent = total || '';
    }

    /* ---------- Queue ---------- */

    function addFiles(files) {
        let rejected = 0;
        Array.from(files).forEach((file) => {
            const targets = targetsFor(file);
            if (!targets.length) { rejected++; return; }
            const target = targets.includes(preferredTarget) ? preferredTarget : targets.includes($('bulk-target').value) ? $('bulk-target').value : targets[0];
            queue.push({ id: nextId++, file, target, status: 'ready' });
        });
        if (rejected) toast(`${rejected} file${rejected > 1 ? 's' : ''} skipped: format not supported yet.`);
        renderQueue();
        showView('convert');
    }

    function renderBulkOptions() {
        const select = $('bulk-target');
        const current = select.value;
        const union = [];
        queue.forEach((q) => targetsFor(q.file).forEach((t) => { if (!union.includes(t)) union.push(t); }));
        select.replaceChildren(...union.map((t) => el('option', { value: t, text: FORMATS[t].label })));
        if (union.includes(current)) select.value = current;
        else if (union.includes(preferredTarget)) select.value = preferredTarget;
    }

    function renderQueue() {
        const ul = $('queue');
        const visible = queue.filter((q) => q.file.name.toLowerCase().includes(searchTerm));
        ul.replaceChildren(...visible.map(renderItem));
        $('queue-toolbar').hidden = queue.length === 0;
        $('queue-count').textContent = queue.length || '';
        renderBulkOptions();
        $('drop-zone').classList.toggle('compact', queue.length > 0);
        $('signin-nudge').hidden = !(window.FFAuth.enabled && !window.FFAuth.user && queue.some((q) => q.status === 'done'));
    }

    function renderItem(item) {
        const select = el('select', { 'aria-label': `Convert ${item.file.name} to`, onchange: (e) => { item.target = e.target.value; resetItem(item); renderQueue(); } },
            targetsFor(item.file).map((t) => el('option', { value: t, text: FORMATS[t].label })));
        select.value = item.target;
        select.disabled = item.status === 'working';

        let action;
        if (item.status === 'done') {
            action = el('button', { class: 'convert-btn small', onclick: () => download(item) }, [el('span', { class: 'material-icons', text: 'download' }), ' Download']);
        } else if (item.status === 'working') {
            action = el('span', { class: 'spinner', 'aria-label': 'Converting' });
        } else {
            action = el('button', { class: 'convert-btn small outline', onclick: () => run(item) }, [item.status === 'error' ? 'Retry' : 'Convert']);
        }

        const sub = item.status === 'error'
            ? el('div', { class: 'file-sub error', text: item.error })
            : el('div', { class: 'file-sub', text: item.status === 'done' ? `${formatSize(item.file.size)} → ${formatSize(item.result.blob.size)} · ready` : `${extOf(item.file.name).toUpperCase() || 'FILE'} · ${formatSize(item.file.size)}` });

        return el('li', { class: `queue-item ${item.status}` }, [
            el('span', { class: 'material-icons file-icon', text: item.status === 'done' ? 'check_circle' : iconFor(item.file) }),
            el('div', { class: 'file-meta' }, [el('div', { class: 'file-name', text: item.file.name, title: item.file.name }), sub]),
            el('div', { class: 'file-target' }, [el('span', { class: 'material-icons arrow', text: 'arrow_forward' }), select]),
            action,
            el('button', { class: 'icon-btn remove', 'aria-label': `Remove ${item.file.name}`, onclick: () => remove(item) }, [el('span', { class: 'material-icons', text: 'close' })]),
        ]);
    }

    function resetItem(item) {
        if (item.result) URL.revokeObjectURL(item.result.url);
        item.result = null;
        item.error = null;
        item.status = 'ready';
    }

    function remove(item) {
        resetItem(item);
        queue.splice(queue.indexOf(item), 1);
        renderQueue();
    }

    async function run(item) {
        if (item.status === 'working') return;
        resetItem(item);
        item.status = 'working';
        renderQueue();
        try {
            const { blob, name } = await convert(item.file, item.target);
            item.result = { blob, name, url: URL.createObjectURL(blob) };
            item.status = 'done';
            addHistory({ name, from: extOf(item.file.name), to: item.target, size: blob.size, at: Date.now() });
        } catch (e) {
            item.status = 'error';
            item.error = e.message || 'Conversion failed.';
        }
        renderQueue();
        return item;
    }

    async function convertAll() {
        const bulk = $('bulk-target').value;
        queue.forEach((q) => {
            if (q.status !== 'done' && targetsFor(q.file).includes(bulk)) q.target = bulk;
        });
        const pending = queue.filter((q) => q.status !== 'done');
        for (const item of pending) await run(item);
        const done = pending.filter((q) => q.status === 'done');
        if (done.length === 1) download(done[0]);
        if (done.length) toast(`Converted ${done.length} file${done.length > 1 ? 's' : ''}.`);
    }

    /* ---------- Views & input ---------- */

    function showView(name) {
        $('view-convert').hidden = name !== 'convert';
        $('view-history').hidden = name !== 'history';
        document.querySelectorAll('.nav-links li').forEach((li) => li.classList.toggle('active', li.dataset.view === name));
        document.body.classList.remove('sidebar-open');
        if (name === 'history') renderHistory();
    }

    const input = $('file-input');
    const drop = $('drop-zone');
    const pick = () => input.click();

    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
    drop.addEventListener('click', pick);
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    $('new-btn').addEventListener('click', () => { showView('convert'); pick(); });

    ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => {
        e.preventDefault();
        if (t === 'drop' || !e.relatedTarget) drop.classList.remove('dragging');
    }));
    document.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

    document.addEventListener('paste', (e) => {
        const files = Array.from(e.clipboardData ? e.clipboardData.files : []);
        if (files.length) {
            addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}-${i}.${(f.type.split('/')[1] || 'png')}`, { type: f.type }))));
        }
    });

    $('convert-all').addEventListener('click', convertAll);
    $('clear-queue').addEventListener('click', () => { queue.slice().forEach(resetItem); queue.length = 0; renderQueue(); });
    $('clear-history').addEventListener('click', () => { try { localStorage.removeItem(historyKey()); } catch { /* ignore */ } renderHistory(); });
    $('search').addEventListener('input', (e) => { searchTerm = e.target.value.trim().toLowerCase(); renderQueue(); renderHistory(); });
    $('menu-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    document.querySelectorAll('.nav-links li').forEach((li) => li.addEventListener('click', () => showView(li.dataset.view)));

    /* ---------- Account ---------- */

    const menu = $('account-menu');
    const profileBtn = $('profile-btn');
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
        profileBtn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
    $('sign-out').addEventListener('click', () => { menu.hidden = true; window.FFAuth.signOut(); toast('Signed out.'); });

    function renderAccount(user) {
        const signedIn = Boolean(user);
        profileBtn.hidden = !signedIn;
        $('gsi-header').hidden = signedIn || !window.FFAuth.enabled;
        if (signedIn) {
            profileBtn.replaceChildren(user.picture
                ? el('img', { src: user.picture, alt: user.name, referrerpolicy: 'no-referrer' })
                : document.createTextNode((user.name || '?')[0].toUpperCase()));
            profileBtn.title = `${user.name}\n${user.email}`;
            $('account-avatar').src = user.picture || '';
            $('account-avatar').hidden = !user.picture;
            $('account-name').textContent = user.name;
            $('account-email').textContent = user.email;
        }
        renderQueue();
        renderHistory();
    }

    let wasSignedIn = Boolean(window.FFAuth.user);
    window.FFAuth.onChange((user) => {
        renderAccount(user);
        if (user && !wasSignedIn) toast(`Signed in as ${user.givenName || user.name}.`);
        wasSignedIn = Boolean(user);
    });
    window.FFAuth.renderButton($('gsi-header'), { size: 'medium', text: 'signin' });
    window.FFAuth.renderButton($('gsi-nudge'), { text: 'continue_with' });

    /* ---------- Files handed over from the landing page ---------- */

    window.FFHandoff.take().then((files) => { if (files.length) addFiles(files); });
    renderQueue();
    renderHistory();
})();
