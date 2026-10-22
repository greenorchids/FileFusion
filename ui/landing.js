(function () {
    const drop = document.getElementById('hero-drop');
    const input = document.getElementById('hero-input');

    async function start(files) {
        if (!files || !files.length) return;
        try {
            await window.FFHandoff.put(files);
        } catch { /* fall through: the converter opens empty */ }
        location.href = 'app.html';
    }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => start(input.files));

    ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
    document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('dragging'); });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('dragging');
        if (e.dataTransfer) start(e.dataTransfer.files);
    });
    document.addEventListener('paste', (e) => {
        if (e.clipboardData && e.clipboardData.files.length) start(e.clipboardData.files);
    });

    const navUser = document.getElementById('nav-user');
    window.FFAuth.onChange((user) => {
        document.getElementById('gsi-nav').hidden = Boolean(user) || !window.FFAuth.enabled;
        document.getElementById('gsi-hero').hidden = Boolean(user) || !window.FFAuth.enabled;
        navUser.hidden = !user;
        if (user) {
            navUser.replaceChildren();
            if (user.picture) {
                const img = document.createElement('img');
                img.src = user.picture;
                img.alt = '';
                img.referrerPolicy = 'no-referrer';
                navUser.append(img);
            }
            navUser.append(`Hi, ${user.givenName || user.name}`);
        }
    });
    fetch('https://api.github.com/repos/ybelov27/FileFusion')
        .then((r) => (r.ok ? r.json() : null))
        .then((repo) => {
            if (!repo || !repo.stargazers_count) return;
            document.querySelectorAll('[data-gh-stars]').forEach((el) => {
                el.textContent = repo.stargazers_count.toLocaleString();
                el.hidden = false;
            });
        })
        .catch(() => { /* count is optional */ });

    window.FFAuth.renderButton(document.getElementById('gsi-nav'), { size: 'medium', text: 'signin' });
    window.FFAuth.renderButton(document.getElementById('gsi-hero'), { size: 'large', text: 'continue_with' });
    window.FFAuth.promptOneTap();
})();
