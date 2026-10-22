/*
 * File Fusion in-browser conversion engine.
 * Every conversion runs locally: files never leave the user's device.
 */
(function () {
    const IMAGE_IN = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'ico'];
    const DATA_IN = ['csv', 'tsv', 'json'];

    const FORMATS = {
        png:  { label: 'PNG',  mime: 'image/png' },
        jpg:  { label: 'JPG',  mime: 'image/jpeg' },
        webp: { label: 'WEBP', mime: 'image/webp' },
        pdf:  { label: 'PDF',  mime: 'application/pdf' },
        json: { label: 'JSON', mime: 'application/json' },
        csv:  { label: 'CSV',  mime: 'text/csv' },
        tsv:  { label: 'TSV',  mime: 'text/tab-separated-values' },
        md:   { label: 'Markdown', mime: 'text/markdown' },
        html: { label: 'HTML', mime: 'text/html' },
        yaml: { label: 'YAML', mime: 'application/yaml' },
        xml:  { label: 'XML',  mime: 'application/xml' },
        txt:  { label: 'Text', mime: 'text/plain' },
    };

    function extOf(name) {
        const m = /\.([a-z0-9]+)$/i.exec(name || '');
        return m ? m[1].toLowerCase() : '';
    }

    function kindOf(file) {
        const ext = extOf(file.name);
        if (IMAGE_IN.includes(ext) || (file.type || '').startsWith('image/')) return 'image';
        if (DATA_IN.includes(ext)) return 'data';
        if (ext === 'md' || ext === 'markdown') return 'markdown';
        if (ext === 'html' || ext === 'htm') return 'html';
        if (ext === 'txt') return 'text';
        return null;
    }

    function normalizedExt(file) {
        const ext = extOf(file.name);
        return ext === 'jpeg' ? 'jpg' : ext === 'markdown' ? 'md' : ext === 'htm' ? 'html' : ext;
    }

    function targetsFor(file) {
        const own = normalizedExt(file);
        const byKind = {
            image: ['png', 'jpg', 'webp', 'pdf'],
            data: ['json', 'csv', 'tsv', 'md', 'html', 'yaml', 'xml'],
            markdown: ['html', 'txt'],
            html: ['txt', 'md'],
            text: ['html', 'md', 'pdf'],
        }[kindOf(file)] || [];
        return byKind.filter((t) => t !== own);
    }

    /* ---------- Tabular data ---------- */

    function parseDelimited(text, delim) {
        const rows = [];
        let row = [], field = '', inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inQuotes) {
                if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
                else if (c === '"') inQuotes = false;
                else field += c;
            } else if (c === '"') inQuotes = true;
            else if (c === delim) { row.push(field); field = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(field); rows.push(row); row = []; field = '';
            } else field += c;
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        const nonEmpty = rows.filter((r) => r.some((v) => v !== ''));
        if (!nonEmpty.length) return { headers: [], records: [] };
        const headers = nonEmpty[0].map((h, i) => h.trim() || `column_${i + 1}`);
        const records = nonEmpty.slice(1).map((r) => {
            const o = {};
            headers.forEach((h, i) => { o[h] = r[i] ?? ''; });
            return o;
        });
        return { headers, records };
    }

    function parseJsonTable(text) {
        let data = JSON.parse(text);
        if (!Array.isArray(data)) {
            const arrayProp = data && typeof data === 'object' && Object.values(data).find(Array.isArray);
            data = arrayProp || [data];
        }
        if (data.length && Array.isArray(data[0])) {
            const [head, ...rest] = data;
            const headers = head.map(String);
            return { headers, records: rest.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))) };
        }
        const records = data.map((r) => (r && typeof r === 'object' ? r : { value: r }));
        const headers = [];
        records.forEach((r) => Object.keys(r).forEach((k) => { if (!headers.includes(k)) headers.push(k); }));
        return { headers, records };
    }

    const cell = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

    function toDelimited({ headers, records }, delim) {
        const esc = (v) => {
            const s = cell(v);
            return /["\n\r]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [headers.map(esc).join(delim), ...records.map((r) => headers.map((h) => esc(r[h])).join(delim))].join('\n') + '\n';
    }

    function toMarkdownTable({ headers, records }) {
        const esc = (v) => cell(v).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
        return [
            `| ${headers.map(esc).join(' | ')} |`,
            `| ${headers.map(() => '---').join(' | ')} |`,
            ...records.map((r) => `| ${headers.map((h) => esc(r[h])).join(' | ')} |`),
        ].join('\n') + '\n';
    }

    const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function htmlDocument(title, body) {
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${escHtml(title)}</title>\n` +
            '<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 16px;line-height:1.6;color:#1f1f1f}' +
            'table{border-collapse:collapse;width:100%}th,td{border:1px solid #dadce0;padding:6px 10px;text-align:left}th{background:#f1f3f4}' +
            'pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}</style>\n' +
            `</head>\n<body>\n${body}\n</body>\n</html>\n`;
    }

    function toHtmlTable({ headers, records }, title) {
        const head = `<tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join('')}</tr>`;
        const rows = records.map((r) => `<tr>${headers.map((h) => `<td>${escHtml(cell(r[h]))}</td>`).join('')}</tr>`).join('\n');
        return htmlDocument(title, `<table>\n<thead>${head}</thead>\n<tbody>\n${rows}\n</tbody>\n</table>`);
    }

    function toYaml({ records }) {
        const scalar = (v) => {
            if (v == null || v === '') return "''";
            if (typeof v === 'number' || typeof v === 'boolean') return String(v);
            if (typeof v === 'object') return JSON.stringify(v);
            const s = String(v);
            return /^[\w.\-/ ]+$/.test(s) && !/^(true|false|null|yes|no|~|-?\d[\d.e+-]*)$/i.test(s) && s.trim() === s ? s : JSON.stringify(s);
        };
        const key = (k) => (/^[\w.-]+$/.test(k) ? k : JSON.stringify(k));
        if (!records.length) return '[]\n';
        return records.map((r) => {
            const entries = Object.entries(r);
            if (!entries.length) return '- {}';
            return entries.map(([k, v], i) => `${i ? '  ' : '- '}${key(k)}: ${scalar(v)}`).join('\n');
        }).join('\n') + '\n';
    }

    function toXml({ headers, records }) {
        const tag = (h) => {
            let t = String(h).replace(/[^\w.-]/g, '_');
            if (!/^[A-Za-z_]/.test(t)) t = `_${t}`;
            return t;
        };
        const escXml = (s) => escHtml(s).replace(/'/g, '&apos;');
        const rows = records.map((r) => `  <row>\n${headers.map((h) => `    <${tag(h)}>${escXml(cell(r[h]))}</${tag(h)}>`).join('\n')}\n  </row>`);
        return `<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${rows.join('\n')}\n</rows>\n`;
    }

    /* ---------- Markdown / HTML / text ---------- */

    function inlineMd(s) {
        return escHtml(s)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
            .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
            .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    }

    function markdownToHtml(md) {
        const lines = md.replace(/\r\n?/g, '\n').split('\n');
        const out = [];
        let para = [], list = null, inCode = false, code = [];
        const flushPara = () => { if (para.length) { out.push(`<p>${inlineMd(para.join(' '))}</p>`); para = []; } };
        const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineMd(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
        for (const line of lines) {
            if (inCode) {
                if (/^```/.test(line)) { out.push(`<pre><code>${escHtml(code.join('\n'))}</code></pre>`); inCode = false; code = []; }
                else code.push(line);
                continue;
            }
            let m;
            if (/^```/.test(line)) { flushPara(); flushList(); inCode = true; }
            else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`); }
            else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); }
            else if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<blockquote>${inlineMd(m[1])}</blockquote>`); }
            else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
                flushPara();
                const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
                if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
                list.items.push(m[1]);
            } else if (!line.trim()) { flushPara(); flushList(); }
            else { flushList(); para.push(line.trim()); }
        }
        if (inCode) out.push(`<pre><code>${escHtml(code.join('\n'))}</code></pre>`);
        flushPara(); flushList();
        return out.join('\n');
    }

    function htmlToDom(html) {
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function htmlToText(html) {
        const doc = htmlToDom(html);
        doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
        doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
        doc.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,tr,pre,blockquote,section,article').forEach((n) => n.append('\n'));
        return (doc.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    function htmlToMarkdown(html) {
        const doc = htmlToDom(html);
        doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
        const walk = (node) => {
            if (node.nodeType === 3) return node.textContent.replace(/\s+/g, ' ');
            if (node.nodeType !== 1) return '';
            const inner = () => Array.from(node.childNodes).map(walk).join('');
            const tag = node.tagName.toLowerCase();
            switch (tag) {
                case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
                    return `\n\n${'#'.repeat(+tag[1])} ${inner().trim()}\n\n`;
                case 'p': case 'div': case 'section': case 'article': return `\n\n${inner().trim()}\n\n`;
                case 'br': return '\n';
                case 'strong': case 'b': return `**${inner()}**`;
                case 'em': case 'i': return `*${inner()}*`;
                case 'code': return `\`${node.textContent}\``;
                case 'pre': return `\n\n\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
                case 'a': return `[${inner()}](${node.getAttribute('href') || ''})`;
                case 'img': return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
                case 'hr': return '\n\n---\n\n';
                case 'blockquote': return `\n\n> ${inner().trim()}\n\n`;
                case 'ul': case 'ol':
                    return '\n\n' + Array.from(node.children).map((li, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${walk(li).trim()}`).join('\n') + '\n\n';
                case 'li': return inner();
                default: return inner();
            }
        };
        return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    /* ---------- Images & PDF ---------- */

    async function loadImage(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.decoding = 'async';
            img.src = url;
            await img.decode();
            return img;
        } catch {
            throw new Error('This image could not be read by your browser.');
        } finally {
            setTimeout(() => URL.revokeObjectURL(url), 0);
        }
    }

    function canvasToBlob(canvas, mime, quality) {
        return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Your browser can't export ${mime}.`))), mime, quality));
    }

    async function rasterize(file, mime) {
        const img = await loadImage(file);
        const w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await canvasToBlob(canvas, mime, 0.92);
        if (blob.type !== mime) throw new Error(`Your browser can't export ${FORMATS[mime.split('/')[1]]?.label || mime}.`);
        return { blob, width: w, height: h };
    }

    // Assemble a PDF from already-encoded JPEG pages, one image per page.
    function buildPdf(pages) {
        const enc = new TextEncoder();
        const parts = [];
        const offsets = [];
        let length = 0;
        const push = (chunk) => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); length += b.length; };
        const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };

        push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
        const pageIds = pages.map((_, i) => 3 + i * 3);
        obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
        obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
        pages.forEach((p, i) => {
            const id = pageIds[i];
            // Page size in points: explicit, or the image at 96 dpi.
            const pw = (p.ptWidth || p.width * 0.75).toFixed(2), ph = (p.ptHeight || p.height * 0.75).toFixed(2);
            const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
            obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`));
            obj(id + 1, () => {
                push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
                push(p.jpeg);
                push('\nendstream');
            });
            obj(id + 2, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
        });
        const count = 3 + pages.length * 3;
        const xref = length;
        push(`xref\n0 ${count}\n0000000000 65535 f \n`);
        for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
        push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
        return new Blob(parts, { type: 'application/pdf' });
    }

    async function imageToPdf(file) {
        const { blob, width, height } = await rasterize(file, 'image/jpeg');
        return buildPdf([{ jpeg: new Uint8Array(await blob.arrayBuffer()), width, height }]);
    }

    // Render plain text onto letter-sized canvases and wrap them as PDF pages.
    async function textToPdf(text) {
        const W = 1275, H = 1650, M = 120, LH = 34; // 150 dpi letter page
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const font = '22px ui-monospace, Menlo, Consolas, monospace';
        ctx.font = font;
        const lines = [];
        for (const raw of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
            let line = '';
            for (const word of raw.split(/(\s+)/)) {
                if (ctx.measureText(line + word).width > W - 2 * M && line) { lines.push(line); line = word.trimStart(); }
                else line += word;
                while (ctx.measureText(line).width > W - 2 * M) {
                    let cut = line.length - 1;
                    while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > W - 2 * M) cut--;
                    lines.push(line.slice(0, cut)); line = line.slice(cut);
                }
            }
            lines.push(line);
        }
        const perPage = Math.floor((H - 2 * M) / LH);
        const pages = [];
        for (let i = 0; i < Math.max(lines.length, 1); i += perPage) {
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#1f1f1f'; ctx.font = font; ctx.textBaseline = 'top';
            lines.slice(i, i + perPage).forEach((l, j) => ctx.fillText(l, M, M + j * LH));
            const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
            pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: W, height: H, ptWidth: 612, ptHeight: 792 });
        }
        return buildPdf(pages);
    }

    /* ---------- Entry point ---------- */

    async function convert(file, target) {
        const kind = kindOf(file);
        const base = file.name.replace(/\.[^.]+$/, '') || 'converted';
        const name = `${base}.${target}`;
        const type = FORMATS[target].mime;
        const text = (s) => ({ blob: new Blob([s], { type: `${type};charset=utf-8` }), name });

        if (!targetsFor(file).includes(target)) throw new Error(`Can't convert this file to ${FORMATS[target].label}.`);

        if (kind === 'image') {
            if (target === 'pdf') return { blob: await imageToPdf(file), name };
            return { blob: (await rasterize(file, type)).blob, name };
        }

        const src = await file.text();
        if (kind === 'data') {
            const ext = normalizedExt(file);
            let table;
            try {
                table = ext === 'json' ? parseJsonTable(src) : parseDelimited(src.replace(/^﻿/, ''), ext === 'tsv' ? '\t' : ',');
            } catch (e) {
                throw new Error(`Couldn't read ${ext.toUpperCase()}: ${e.message}`);
            }
            switch (target) {
                case 'json': return text(JSON.stringify(table.records, null, 2) + '\n');
                case 'csv': return text(toDelimited(table, ','));
                case 'tsv': return text(toDelimited(table, '\t'));
                case 'md': return text(toMarkdownTable(table));
                case 'html': return text(toHtmlTable(table, base));
                case 'yaml': return text(toYaml(table));
                case 'xml': return text(toXml(table));
            }
        }
        if (kind === 'markdown') {
            if (target === 'html') return text(htmlDocument(base, markdownToHtml(src)));
            if (target === 'txt') return text(htmlToText(markdownToHtml(src)));
        }
        if (kind === 'html') {
            if (target === 'txt') return text(htmlToText(src));
            if (target === 'md') return text(htmlToMarkdown(src));
        }
        if (kind === 'text') {
            if (target === 'html') return text(htmlDocument(base, `<pre>${escHtml(src)}</pre>`));
            if (target === 'md') return text(src);
            if (target === 'pdf') return { blob: await textToPdf(src), name };
        }
        throw new Error('Unsupported conversion.');
    }

    window.FFConvert = { FORMATS, convert, targetsFor, kindOf, extOf };
})();
