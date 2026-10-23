/*
 * Share buttons. Any element with data-share="native|copy|x|reddit|linkedin|hn"
 * shares the site (or data-share-url) when clicked.
 */
(function () {
    const SITE = 'https://ybelov27.github.io/FileFusion/';
    const TEXT = 'File Fusion: a free, open-source file converter that runs entirely in your browser. No uploads, no sign-up.';

    const intents = {
        x: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}`,
        reddit: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}`,
        linkedin: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
        hn: (u, t) => `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`,
    };

    async function copy(url, button) {
        try {
            await navigator.clipboard.writeText(url);
            const label = button.querySelector('[data-share-label]') || button;
            const before = label.textContent;
            label.textContent = 'Link copied';
            setTimeout(() => { label.textContent = before; }, 2000);
        } catch {
            window.prompt('Copy this link:', url);
        }
    }

    function wire(root) {
        root.querySelectorAll('[data-share]').forEach((el) => {
            const kind = el.dataset.share;
            const url = el.dataset.shareUrl || SITE;
            const text = el.dataset.shareText || TEXT;
            if (kind === 'native' && !navigator.share) { el.hidden = true; return; }
            if (intents[kind]) {
                el.setAttribute('href', intents[kind](url, text));
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener');
                return;
            }
            el.addEventListener('click', (e) => {
                e.preventDefault();
                if (kind === 'native') navigator.share({ title: 'File Fusion', text, url }).catch(() => {});
                else if (kind === 'copy') copy(url, el);
            });
        });
    }

    window.FFShare = { wire, SITE };
})();
