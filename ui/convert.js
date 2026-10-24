/*
 * File Fusion in-browser conversion engine.
 * Every conversion runs locally: files never leave the user's device.
 */
(function () {
  const IMAGE_IN = [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "svg",
    "avif",
    "ico",
  ];
  const DATA_IN = ["csv", "tsv", "json", "jsonl", "ndjson", "xml"];
  const AUDIO_IN = ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"];

  const FORMATS = {
    png: { label: "PNG", mime: "image/png" },
    jpg: { label: "JPG", mime: "image/jpeg" },
    webp: { label: "WEBP", mime: "image/webp" },
    bmp: { label: "BMP", mime: "image/bmp" },
    ico: { label: "ICO (favicon)", mime: "image/x-icon" },
    datauri: { label: "Base64 data URI", mime: "text/plain", ext: "txt" },
    pdf: { label: "PDF", mime: "application/pdf" },
    json: { label: "JSON", mime: "application/json" },
    jsonl: { label: "JSON Lines", mime: "application/jsonl" },
    sql: { label: "SQL inserts", mime: "application/sql" },
    csv: { label: "CSV", mime: "text/csv" },
    tsv: { label: "TSV", mime: "text/tab-separated-values" },
    md: { label: "Markdown", mime: "text/markdown" },
    html: { label: "HTML", mime: "text/html" },
    yaml: { label: "YAML", mime: "application/yaml" },
    xml: { label: "XML", mime: "application/xml" },
    txt: { label: "Text", mime: "text/plain" },
    wav: { label: "WAV", mime: "audio/wav" },
  };

  function extOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function kindOf(file) {
    const ext = extOf(file.name);
    if (IMAGE_IN.includes(ext) || (file.type || "").startsWith("image/"))
      return "image";
    if (DATA_IN.includes(ext)) return "data";
    if (AUDIO_IN.includes(ext) || (file.type || "").startsWith("audio/"))
      return "audio";
    if (ext === "md" || ext === "markdown") return "markdown";
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "txt") return "text";
    return null;
  }

  function normalizedExt(file) {
    const ext = extOf(file.name);
    return ext === "jpeg"
      ? "jpg"
      : ext === "markdown"
        ? "md"
        : ext === "htm"
          ? "html"
          : ext === "ndjson"
            ? "jsonl"
            : ext;
  }

  function targetsFor(file) {
    const own = normalizedExt(file);
    const byKind =
      {
        image: ["png", "jpg", "webp", "pdf", "bmp", "ico", "datauri"],
        data: [
          "json",
          "csv",
          "tsv",
          "md",
          "html",
          "yaml",
          "xml",
          "jsonl",
          "sql",
        ],
        markdown: ["html", "txt", "pdf"],
        html: ["txt", "md", "pdf"],
        text: ["html", "md", "pdf"],
        audio: ["wav"],
      }[kindOf(file)] || [];
    return byKind.filter((t) => t !== own);
  }

  /* ---------- Tabular data ---------- */

  function parseDelimited(text, delim) {
    const rows = [];
    let row = [],
      field = "",
      inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === delim) {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    const nonEmpty = rows.filter((r) => r.some((v) => v !== ""));
    if (!nonEmpty.length) return { headers: [], records: [] };
    const headers = nonEmpty[0].map((h, i) => h.trim() || `column_${i + 1}`);
    const records = nonEmpty.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, i) => {
        o[h] = r[i] ?? "";
      });
      return o;
    });
    return { headers, records };
  }

  function parseJsonTable(text) {
    let data = JSON.parse(text);
    if (!Array.isArray(data)) {
      const arrayProp =
        data &&
        typeof data === "object" &&
        Object.values(data).find(Array.isArray);
      data = arrayProp || [data];
    }
    if (data.length && Array.isArray(data[0])) {
      const [head, ...rest] = data;
      const headers = head.map(String);
      return {
        headers,
        records: rest.map((r) =>
          Object.fromEntries(headers.map((h, i) => [h, r[i]])),
        ),
      };
    }
    const records = data.map((r) =>
      r && typeof r === "object" ? r : { value: r },
    );
    const headers = [];
    records.forEach((r) =>
      Object.keys(r).forEach((k) => {
        if (!headers.includes(k)) headers.push(k);
      }),
    );
    return { headers, records };
  }

  function tableFromRecords(records) {
    const headers = [];
    records.forEach((r) =>
      Object.keys(r).forEach((k) => {
        if (!headers.includes(k)) headers.push(k);
      }),
    );
    return { headers, records };
  }

  function parseJsonLines(text) {
    const records = text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l, i) => {
        try {
          return JSON.parse(l);
        } catch (e) {
          throw new Error(`line ${i + 1}: ${e.message}`);
        }
      })
      .map((r) =>
        r && typeof r === "object" && !Array.isArray(r) ? r : { value: r },
      );
    return tableFromRecords(records);
  }

  // Treats the root's child elements as rows and their children (or attributes) as fields.
  function parseXmlTable(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) throw new Error(err.textContent.split("\n")[0] || "invalid XML");
    const records = Array.from(doc.documentElement.children).map((row) => {
      const o = {};
      Array.from(row.attributes).forEach((a) => {
        o[a.name] = a.value;
      });
      const kids = Array.from(row.children);
      if (kids.length)
        kids.forEach((k) => {
          o[k.tagName] = k.children.length ? k.innerHTML.trim() : k.textContent;
        });
      else if (!row.attributes.length) o[row.tagName] = row.textContent;
      return o;
    });
    return tableFromRecords(records);
  }

  const cell = (v) =>
    v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

  function toDelimited({ headers, records }, delim) {
    const esc = (v) => {
      const s = cell(v);
      return /["\n\r]/.test(s) || s.includes(delim)
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    return (
      [
        headers.map(esc).join(delim),
        ...records.map((r) => headers.map((h) => esc(r[h])).join(delim)),
      ].join("\n") + "\n"
    );
  }

  function toMarkdownTable({ headers, records }) {
    const esc = (v) => cell(v).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
    return (
      [
        `| ${headers.map(esc).join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...records.map(
          (r) => `| ${headers.map((h) => esc(r[h])).join(" | ")} |`,
        ),
      ].join("\n") + "\n"
    );
  }

  const escHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function htmlDocument(title, body) {
    return (
      `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${escHtml(title)}</title>\n` +
      "<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 16px;line-height:1.6;color:#1f1f1f}" +
      "table{border-collapse:collapse;width:100%}th,td{border:1px solid #dadce0;padding:6px 10px;text-align:left}th{background:#f1f3f4}" +
      "pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}</style>\n" +
      `</head>\n<body>\n${body}\n</body>\n</html>\n`
    );
  }

  function toHtmlTable({ headers, records }, title) {
    const head = `<tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr>`;
    const rows = records
      .map(
        (r) =>
          `<tr>${headers.map((h) => `<td>${escHtml(cell(r[h]))}</td>`).join("")}</tr>`,
      )
      .join("\n");
    return htmlDocument(
      title,
      `<table>\n<thead>${head}</thead>\n<tbody>\n${rows}\n</tbody>\n</table>`,
    );
  }

  function toYaml({ records }) {
    const scalar = (v) => {
      if (v == null || v === "") return "''";
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      if (typeof v === "object") return JSON.stringify(v);
      const s = String(v);
      return /^[\w.\-/ ]+$/.test(s) &&
        !/^(true|false|null|yes|no|~|-?\d[\d.e+-]*)$/i.test(s) &&
        s.trim() === s
        ? s
        : JSON.stringify(s);
    };
    const key = (k) => (/^[\w.-]+$/.test(k) ? k : JSON.stringify(k));
    if (!records.length) return "[]\n";
    return (
      records
        .map((r) => {
          const entries = Object.entries(r);
          if (!entries.length) return "- {}";
          return entries
            .map(([k, v], i) => `${i ? "  " : "- "}${key(k)}: ${scalar(v)}`)
            .join("\n");
        })
        .join("\n") + "\n"
    );
  }

  function toXml({ headers, records }) {
    const tag = (h) => {
      let t = String(h).replace(/[^\w.-]/g, "_");
      if (!/^[A-Za-z_]/.test(t)) t = `_${t}`;
      return t;
    };
    const escXml = (s) => escHtml(s).replace(/'/g, "&apos;");
    const rows = records.map(
      (r) =>
        `  <row>\n${headers.map((h) => `    <${tag(h)}>${escXml(cell(r[h]))}</${tag(h)}>`).join("\n")}\n  </row>`,
    );
    return `<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${rows.join("\n")}\n</rows>\n`;
  }

  function toJsonLines({ records }) {
    return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  }

  function toSql({ headers, records }, name) {
    const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const table = ident(
      name.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "data",
    );
    const numeric = headers.map(
      (h) =>
        records.length > 0 &&
        records.every(
          (r) =>
            r[h] == null || r[h] === "" || /^-?\d+(\.\d+)?$/.test(String(r[h])),
        ),
    );
    const value = (v, i) => {
      if (v == null || v === "") return "NULL";
      if (numeric[i]) return String(v);
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      return `'${cell(v).replace(/'/g, "''")}'`;
    };
    const cols = headers.map(ident).join(", ");
    const create = `CREATE TABLE ${table} (\n${headers.map((h, i) => `  ${ident(h)} ${numeric[i] ? "NUMERIC" : "TEXT"}`).join(",\n")}\n);\n\n`;
    return (
      create +
      records
        .map(
          (r) =>
            `INSERT INTO ${table} (${cols}) VALUES (${headers.map((h, i) => value(r[h], i)).join(", ")});`,
        )
        .join("\n") +
      "\n"
    );
  }

  /* ---------- Markdown / HTML / text ---------- */

  function inlineMd(s) {
    return escHtml(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  }

  function markdownToHtml(md) {
    const lines = md.replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let para = [],
      list = null,
      inCode = false,
      code = [];
    const flushPara = () => {
      if (para.length) {
        out.push(`<p>${inlineMd(para.join(" "))}</p>`);
        para = [];
      }
    };
    const flushList = () => {
      if (list) {
        out.push(
          `<${list.tag}>${list.items.map((i) => `<li>${inlineMd(i)}</li>`).join("")}</${list.tag}>`,
        );
        list = null;
      }
    };
    for (const line of lines) {
      if (inCode) {
        if (/^```/.test(line)) {
          out.push(`<pre><code>${escHtml(code.join("\n"))}</code></pre>`);
          inCode = false;
          code = [];
        } else code.push(line);
        continue;
      }
      let m;
      if (/^```/.test(line)) {
        flushPara();
        flushList();
        inCode = true;
      } else if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
        flushPara();
        flushList();
        out.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`);
      } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        flushPara();
        flushList();
        out.push("<hr>");
      } else if ((m = /^>\s?(.*)$/.exec(line))) {
        flushPara();
        flushList();
        out.push(`<blockquote>${inlineMd(m[1])}</blockquote>`);
      } else if (
        (m = /^\s*[-*+]\s+(.*)$/.exec(line)) ||
        (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))
      ) {
        flushPara();
        const tag = /^\s*\d/.test(line) ? "ol" : "ul";
        if (!list || list.tag !== tag) {
          flushList();
          list = { tag, items: [] };
        }
        list.items.push(m[1]);
      } else if (!line.trim()) {
        flushPara();
        flushList();
      } else {
        flushList();
        para.push(line.trim());
      }
    }
    if (inCode) out.push(`<pre><code>${escHtml(code.join("\n"))}</code></pre>`);
    flushPara();
    flushList();
    return out.join("\n");
  }

  function htmlToDom(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  function htmlToText(html) {
    const doc = htmlToDom(html);
    doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
    doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
    doc
      .querySelectorAll(
        "p,div,h1,h2,h3,h4,h5,h6,li,tr,pre,blockquote,section,article",
      )
      .forEach((n) => n.append("\n"));
    return (
      (doc.body.textContent || "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim() + "\n"
    );
  }

  function htmlToMarkdown(html) {
    const doc = htmlToDom(html);
    doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
    const walk = (node) => {
      if (node.nodeType === 3) return node.textContent.replace(/\s+/g, " ");
      if (node.nodeType !== 1) return "";
      const inner = () => Array.from(node.childNodes).map(walk).join("");
      const tag = node.tagName.toLowerCase();
      switch (tag) {
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          return `\n\n${"#".repeat(+tag[1])} ${inner().trim()}\n\n`;
        case "p":
        case "div":
        case "section":
        case "article":
          return `\n\n${inner().trim()}\n\n`;
        case "br":
          return "\n";
        case "strong":
        case "b":
          return `**${inner()}**`;
        case "em":
        case "i":
          return `*${inner()}*`;
        case "code":
          return `\`${node.textContent}\``;
        case "pre":
          return `\n\n\`\`\`\n${node.textContent.replace(/\n$/, "")}\n\`\`\`\n\n`;
        case "a":
          return `[${inner()}](${node.getAttribute("href") || ""})`;
        case "img":
          return `![${node.getAttribute("alt") || ""}](${node.getAttribute("src") || ""})`;
        case "hr":
          return "\n\n---\n\n";
        case "blockquote":
          return `\n\n> ${inner().trim()}\n\n`;
        case "ul":
        case "ol":
          return (
            "\n\n" +
            Array.from(node.children)
              .map(
                (li, i) =>
                  `${tag === "ol" ? `${i + 1}.` : "-"} ${walk(li).trim()}`,
              )
              .join("\n") +
            "\n\n"
          );
        case "li":
          return inner();
        default:
          return inner();
      }
    };
    return (
      walk(doc.body)
        .replace(/\n{3,}/g, "\n\n")
        .trim() + "\n"
    );
  }

  /* ---------- Images & PDF ---------- */

  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error("This image could not be read by your browser.");
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error(`Your browser can't export ${mime}.`)),
        mime,
        quality,
      ),
    );
  }

  async function rasterize(file, mime) {
    const img = await loadImage(file);
    const w = img.naturalWidth || 1024,
      h = img.naturalHeight || 1024;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await canvasToBlob(canvas, mime, 0.92);
    if (blob.type !== mime)
      throw new Error(
        `Your browser can't export ${FORMATS[mime.split("/")[1]]?.label || mime}.`,
      );
    return { blob, width: w, height: h };
  }

  async function drawToCanvas(file, maxSize) {
    const img = await loadImage(file);
    let w = img.naturalWidth || 1024,
      h = img.naturalHeight || 1024;
    if (maxSize && Math.max(w, h) > maxSize) {
      const k = maxSize / Math.max(w, h);
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return canvas;
  }

  // 24-bit BMP on a white background (BMP has no reliable alpha support).
  async function imageToBmp(file) {
    const src = await drawToCanvas(file);
    const { width: w, height: h } = src;
    const flat = document.createElement("canvas");
    flat.width = w;
    flat.height = h;
    const ctx = flat.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0);
    const px = ctx.getImageData(0, 0, w, h).data;
    const rowSize = Math.ceil((w * 3) / 4) * 4;
    const buf = new ArrayBuffer(54 + rowSize * h);
    const v = new DataView(buf);
    v.setUint16(0, 0x4d42, true);
    v.setUint32(2, buf.byteLength, true);
    v.setUint32(10, 54, true);
    v.setUint32(14, 40, true);
    v.setInt32(18, w, true);
    v.setInt32(22, h, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, 24, true);
    v.setUint32(34, rowSize * h, true);
    v.setInt32(38, 2835, true);
    v.setInt32(42, 2835, true);
    const out = new Uint8Array(buf);
    for (let y = 0; y < h; y++) {
      let o = 54 + (h - 1 - y) * rowSize;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        out[o++] = px[i + 2];
        out[o++] = px[i + 1];
        out[o++] = px[i];
      }
    }
    return new Blob([buf], { type: "image/bmp" });
  }

  // ICO containing one PNG image, centered in a square of up to 256px.
  async function imageToIco(file) {
    const src = await drawToCanvas(file, 256);
    const size = Math.max(src.width, src.height);
    const sq = document.createElement("canvas");
    sq.width = size;
    sq.height = size;
    sq.getContext("2d").drawImage(
      src,
      (size - src.width) / 2,
      (size - src.height) / 2,
    );
    const png = new Uint8Array(
      await (await canvasToBlob(sq, "image/png")).arrayBuffer(),
    );
    const head = new DataView(new ArrayBuffer(22));
    head.setUint16(2, 1, true);
    head.setUint16(4, 1, true);
    head.setUint8(6, size >= 256 ? 0 : size);
    head.setUint8(7, size >= 256 ? 0 : size);
    head.setUint16(10, 1, true);
    head.setUint16(12, 32, true);
    head.setUint32(14, png.length, true);
    head.setUint32(18, 22, true);
    return new Blob([head.buffer, png], { type: "image/x-icon" });
  }

  function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Could not read the file."));
      r.readAsDataURL(file);
    });
  }

  /* ---------- Audio ---------- */

  async function audioToWav(file) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Your browser cannot decode audio.");
    const ctx = new Ctx();
    let audio;
    try {
      audio = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error(
        "This audio format could not be decoded by your browser.",
      );
    } finally {
      ctx.close();
    }
    const ch = audio.numberOfChannels,
      len = audio.length,
      rate = audio.sampleRate;
    const buf = new ArrayBuffer(44 + len * ch * 2);
    const v = new DataView(buf);
    const str = (o, s) =>
      [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF");
    v.setUint32(4, 36 + len * ch * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, ch, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * ch * 2, true);
    v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true);
    str(36, "data");
    v.setUint32(40, len * ch * 2, true);
    const chans = Array.from({ length: ch }, (_, c) => audio.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        const smp = Math.max(-1, Math.min(1, chans[c][i]));
        v.setInt16(o, smp < 0 ? smp * 0x8000 : smp * 0x7fff, true);
        o += 2;
      }
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  // Assemble a PDF from already-encoded JPEG pages, one image per page.
  function buildPdf(pages) {
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let length = 0;
    const push = (chunk) => {
      const b = typeof chunk === "string" ? enc.encode(chunk) : chunk;
      parts.push(b);
      length += b.length;
    };
    const obj = (n, body) => {
      offsets[n] = length;
      push(`${n} 0 obj\n`);
      body();
      push("\nendobj\n");
    };

    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const pageIds = pages.map((_, i) => 3 + i * 3);
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () =>
      push(
        `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
      ),
    );
    pages.forEach((p, i) => {
      const id = pageIds[i];
      // Page size in points: explicit, or the image at 96 dpi.
      const pw = (p.ptWidth || p.width * 0.75).toFixed(2),
        ph = (p.ptHeight || p.height * 0.75).toFixed(2);
      const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
      obj(id, () =>
        push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
        ),
      );
      obj(id + 1, () => {
        push(
          `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
        );
        push(p.jpeg);
        push("\nendstream");
      });
      obj(id + 2, () =>
        push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
      );
    });
    const count = 3 + pages.length * 3;
    const xref = length;
    push(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let n = 1; n < count; n++)
      push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
    push(
      `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    );
    return new Blob(parts, { type: "application/pdf" });
  }

  async function imageToPdf(file) {
    const { blob, width, height } = await rasterize(file, "image/jpeg");
    return buildPdf([
      { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height },
    ]);
  }

  // Render plain text onto letter-sized canvases and wrap them as PDF pages.
  async function textToPdf(text) {
    const W = 1275,
      H = 1650,
      M = 120,
      LH = 34; // 150 dpi letter page
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const font = "22px ui-monospace, Menlo, Consolas, monospace";
    ctx.font = font;
    const lines = [];
    for (const raw of text
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      .split("\n")) {
      let line = "";
      for (const word of raw.split(/(\s+)/)) {
        if (ctx.measureText(line + word).width > W - 2 * M && line) {
          lines.push(line);
          line = word.trimStart();
        } else line += word;
        while (ctx.measureText(line).width > W - 2 * M) {
          let cut = line.length - 1;
          while (
            cut > 1 &&
            ctx.measureText(line.slice(0, cut)).width > W - 2 * M
          )
            cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    const perPage = Math.floor((H - 2 * M) / LH);
    const pages = [];
    for (let i = 0; i < Math.max(lines.length, 1); i += perPage) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#1f1f1f";
      ctx.font = font;
      ctx.textBaseline = "top";
      lines
        .slice(i, i + perPage)
        .forEach((l, j) => ctx.fillText(l, M, M + j * LH));
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
      pages.push({
        jpeg: new Uint8Array(await blob.arrayBuffer()),
        width: W,
        height: H,
        ptWidth: 612,
        ptHeight: 792,
      });
    }
    return buildPdf(pages);
  }

  /* ---------- Entry point ---------- */

  async function convert(file, target) {
    const kind = kindOf(file);
    const base = file.name.replace(/\.[^.]+$/, "") || "converted";
    const name = `${base}.${FORMATS[target].ext || target}`;
    const type = FORMATS[target].mime;
    const text = (s) => ({
      blob: new Blob([s], { type: `${type};charset=utf-8` }),
      name,
    });

    if (!targetsFor(file).includes(target))
      throw new Error(`Can't convert this file to ${FORMATS[target].label}.`);

    if (kind === "audio") return { blob: await audioToWav(file), name };

    if (kind === "image") {
      if (target === "pdf") return { blob: await imageToPdf(file), name };
      if (target === "bmp") return { blob: await imageToBmp(file), name };
      if (target === "ico") return { blob: await imageToIco(file), name };
      if (target === "datauri") return text((await fileToDataUri(file)) + "\n");
      return { blob: (await rasterize(file, type)).blob, name };
    }

    const src = await file.text();
    if (kind === "data") {
      const ext = normalizedExt(file);
      let table;
      try {
        const clean = src.replace(/^\uFEFF/, "");
        table =
          ext === "json"
            ? parseJsonTable(clean)
            : ext === "jsonl"
              ? parseJsonLines(clean)
              : ext === "xml"
                ? parseXmlTable(clean)
                : parseDelimited(clean, ext === "tsv" ? "\t" : ",");
      } catch (e) {
        throw new Error(`Couldn't read ${ext.toUpperCase()}: ${e.message}`);
      }
      switch (target) {
        case "json":
          return text(JSON.stringify(table.records, null, 2) + "\n");
        case "csv":
          return text(toDelimited(table, ","));
        case "tsv":
          return text(toDelimited(table, "\t"));
        case "md":
          return text(toMarkdownTable(table));
        case "html":
          return text(toHtmlTable(table, base));
        case "yaml":
          return text(toYaml(table));
        case "xml":
          return text(toXml(table));
        case "jsonl":
          return text(toJsonLines(table));
        case "sql":
          return text(toSql(table, base));
      }
    }
    if (kind === "markdown") {
      if (target === "html")
        return text(htmlDocument(base, markdownToHtml(src)));
      if (target === "txt") return text(htmlToText(markdownToHtml(src)));
      if (target === "pdf")
        return { blob: await textToPdf(htmlToText(markdownToHtml(src))), name };
    }
    if (kind === "html") {
      if (target === "txt") return text(htmlToText(src));
      if (target === "md") return text(htmlToMarkdown(src));
      if (target === "pdf")
        return { blob: await textToPdf(htmlToText(src)), name };
    }
    if (kind === "text") {
      if (target === "html")
        return text(htmlDocument(base, `<pre>${escHtml(src)}</pre>`));
      if (target === "md") return text(src);
      if (target === "pdf") return { blob: await textToPdf(src), name };
    }
    throw new Error("Unsupported conversion.");
  }

  window.FFConvert = { FORMATS, convert, targetsFor, kindOf, extOf };
})();
