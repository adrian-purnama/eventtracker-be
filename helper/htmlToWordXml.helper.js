/**
 * Convert Quill-style HTML to Word OOXML fragment (sequence of <w:p> elements)
 * for use with docxtemplater {@rawXml} / {@descriptionFormatted}.
 * Retains: paragraphs, line breaks, bold (<strong>/<b>), ordered lists (1. 2. 3.),
 * unordered lists (bullet •), and mixed content in order.
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const BULLET = '\u2022'; // •

function escapeXmlText(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtmlEntities(html) {
  return String(html)
    .replace(/&nbsp;/gi, '\u00A0')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/**
 * Parse inline content (text + <strong>/<b>) into an array of { bold: boolean, text: string }.
 */
function parseInlines(html) {
  const runs = [];
  if (!html || typeof html !== 'string') return runs;
  const decoded = decodeHtmlEntities(html);
  const parts = decoded.split(/(<strong>|<\/strong>|<b>|<\/b>)/gi);
  let bold = false;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === '<strong>' || lower === '<b>') {
      bold = true;
      continue;
    }
    if (lower === '</strong>' || lower === '</b>') {
      bold = false;
      continue;
    }
    const text = part.replace(/<[^>]*>/g, '');
    if (text.trim()) runs.push({ bold, text });
  }
  if (runs.length === 0 && decoded.trim()) {
    const text = decoded.replace(/<[^>]*>/g, '').trim();
    if (text) runs.push({ bold: false, text });
  }
  return runs;
}

/**
 * Build one Word paragraph from inline runs.
 */
function buildParagraph(runs) {
  if (!runs || runs.length === 0) {
    return '<w:p xmlns:w="' + W_NS + '"><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>';
  }
  const parts = [];
  for (const run of runs) {
    const escaped = escapeXmlText(run.text);
    if (run.bold) {
      parts.push('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + escaped + '</w:t></w:r>');
    } else {
      parts.push('<w:r><w:t xml:space="preserve">' + escaped + '</w:t></w:r>');
    }
  }
  return '<w:p xmlns:w="' + W_NS + '">' + parts.join('') + '</w:p>';
}

/**
 * Treat a line as a section header (bold) if it ends with ":" and is short enough.
 */
function isSectionHeader(line) {
  const t = line.replace(/<[^>]*>/g, '').trim();
  return t.length > 0 && t.length <= 80 && /:\s*$/.test(t);
}

/**
 * Output paragraphs from a content segment (non-list HTML).
 * When there are multiple lines, render as a numbered list (1. 2. 3.) and bold lines that look like headers (end with ":").
 */
function contentToParagraphs(html) {
  const out = [];
  if (!html || !html.trim()) return out;
  const rawSegments = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p && p.replace(/<[^>]*>/g, '').trim());
  const multiLine = rawSegments.length > 1;
  for (let i = 0; i < rawSegments.length; i++) {
    const p = rawSegments[i];
    let runs = parseInlines(p);
    if (runs.length === 0) continue;
    if (multiLine) {
      const prefix = (i + 1) + '. ';
      if (runs[0].text) {
        runs[0].text = prefix + runs[0].text;
      } else {
        runs.unshift({ bold: false, text: prefix });
      }
    }
    if (runs.length > 0 && isSectionHeader(p)) {
      runs = runs.map((r) => ({ ...r, bold: true }));
    }
    out.push(buildParagraph(runs));
  }
  const fallback = html.split(/<\/p>|<p[^>]*>|<div[^>]*>|<\/div>/gi).filter((p) => p && p.replace(/<[^>]*>/g, '').trim());
  if (out.length === 0 && fallback.length > 0) {
    const multi = fallback.length > 1;
    for (let i = 0; i < fallback.length; i++) {
      const p = fallback[i];
      let runs = parseInlines(p);
      if (runs.length === 0) continue;
      if (multi) {
        const prefix = (i + 1) + '. ';
        if (runs[0].text) runs[0].text = prefix + runs[0].text;
        else runs.unshift({ bold: false, text: prefix });
      }
      if (runs.length > 0 && isSectionHeader(p)) {
        runs = runs.map((r) => ({ ...r, bold: true }));
      }
      out.push(buildParagraph(runs));
    }
  }
  if (out.length === 0) {
    let runs = parseInlines(html);
    if (runs.length) out.push(buildParagraph(runs));
  }
  return out;
}

/**
 * Normalize HTML from React Quill (react-quill-new). getSemanticHTML() may wrap
 * content in div.ql-editor; unwrap so we parse the real blocks (<p>, <ol>, <ul>, <li>).
 */
function normalizeQuillHtml(html) {
  if (!html || typeof html !== 'string') return (html || '').trim();
  let s = html.trim();
  const wrap = /^<div[^>]*\bclass="[^"]*ql-editor[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i;
  const m = s.match(wrap);
  if (m) s = m[1].trim();
  return s;
}

/**
 * Convert HTML to a sequence of <w:p>...</w:p> (Word OOXML fragment).
 * Matches React Quill getSemanticHTML(): <p>, <strong>/<b>, <ol>, <ul>, <li> (optional data-list).
 * - Ordered lists: 1. 2. 3.  Unordered: bullet •
 * - Bold preserved.  Order of lists and paragraphs preserved.
 */
function htmlToWordXml(html) {
  if (!html || typeof html !== 'string') {
    return buildParagraph([{ bold: false, text: '—' }]);
  }
  const out = [];
  const s = normalizeQuillHtml(html);
  if (!s) return buildParagraph([{ bold: false, text: '—' }]);

  const listRegex = /<(ol|ul)[^>]*>([\s\S]*?)<\/\1>/gi;
  const fragments = [];
  let lastIndex = 0;
  let m;
  while ((m = listRegex.exec(s)) !== null) {
    if (m.index > lastIndex) {
      fragments.push({ type: 'content', html: s.slice(lastIndex, m.index) });
    }
    const listType = m[1].toLowerCase();
    const inner = m[2];
    const liMatches = inner.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    const items = liMatches.map((li) => li.replace(/<li[^>]*>|<\/li>/gi, '').trim());
    fragments.push({ type: 'list', listType, items });
    lastIndex = listRegex.lastIndex;
  }
  if (lastIndex < s.length) {
    fragments.push({ type: 'content', html: s.slice(lastIndex) });
  }

  if (fragments.length === 0) {
    return contentToParagraphs(s).length ? contentToParagraphs(s).join('') : buildParagraph([{ bold: false, text: '—' }]);
  }

  for (const frag of fragments) {
    if (frag.type === 'content') {
      for (const p of contentToParagraphs(frag.html)) out.push(p);
    } else {
      for (let i = 0; i < frag.items.length; i++) {
        const liContent = frag.items[i];
        const runs = parseInlines(liContent);
        const pre = frag.listType === 'ol' ? `${i + 1}. ` : BULLET + ' ';
        if (runs.length > 0 && runs[0].text) {
          runs[0].text = pre + runs[0].text;
        } else {
          runs.unshift({ bold: false, text: pre });
        }
        out.push(buildParagraph(runs));
      }
    }
  }

  if (out.length === 0) {
    const runs = parseInlines(s);
    if (runs.length) out.push(buildParagraph(runs));
    else out.push(buildParagraph([{ bold: false, text: '—' }]));
  }

  return out.join('');
}

/**
 * Escape text for use in an XML attribute value.
 */
function escapeXmlAttr(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const HYPERLINK_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
const W_NS_SHORT = 'w';

/**
 * Format budget item description for Word: if it starts with http:// or https://,
 * return OOXML for a clickable link with short display text "Link" and the relationship
 * to add to the docx. Otherwise return plain text run OOXML. Safe: never throws.
 *
 * @param {string} description - Raw description (may be URL or plain text)
 * @param {string} rId - Relationship id for the hyperlink (e.g. 'rId100'), used only when description is a URL
 * @returns {{ xml: string, relationship?: { id: string, target: string } }}
 */
function formatDescriptionForWord(description, rId) {
  function wrapInParagraph(inner) {
    return '<w:p xmlns:w="' + W_NS + '">' + inner + '</w:p>';
  }
  try {
    if (description == null) description = '';
    const s = String(description).trim();
    if (!s) return { xml: wrapInParagraph('<w:r><w:t xml:space="preserve">—</w:t></w:r>') };
    const lower = s.toLowerCase();
    if (lower.startsWith('https://') || lower.startsWith('http://')) {
      const target = escapeXmlAttr(s);
      const displayText = 'Link';
      const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const runXml = '<w:r xmlns:w="' + W_NS + '"><w:rPr><w:color w:val="0000FF"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">' + escapeXmlText(displayText) + '</w:t></w:r>';
      const hyperlinkXml = '<w:hyperlink xmlns:w="' + W_NS + '" xmlns:r="' + R_NS + '" r:id="' + escapeXmlAttr(rId) + '" w:tooltip="' + target + '">' + runXml + '</w:hyperlink>';
      return { xml: wrapInParagraph(hyperlinkXml), relationship: { id: rId, target: s } };
    }
    return { xml: wrapInParagraph('<w:r xmlns:w="' + W_NS + '"><w:t xml:space="preserve">' + escapeXmlText(s) + '</w:t></w:r>') };
  } catch (_) {
    return { xml: wrapInParagraph('<w:r><w:t xml:space="preserve">—</w:t></w:r>') };
  }
}

/**
 * Inject hyperlink relationships into word/_rels/document.xml.rels XML.
 * Appends a <Relationship> for each { id, target } in hyperlinkRels so that
 * hyperlinks in the document resolve correctly. Safe: never throws.
 *
 * @param {string} relsXml - Full content of document.xml.rels
 * @param {{ id: string, target: string }[]} hyperlinkRels - Relationships to add
 * @returns {string} Updated rels XML, or original if nothing to add / on error
 */
function injectHyperlinkRels(relsXml, hyperlinkRels) {
  try {
    if (!relsXml || typeof relsXml !== 'string') return relsXml || '';
    if (!Array.isArray(hyperlinkRels) || hyperlinkRels.length === 0) return relsXml;
    const closing = '</Relationships>';
    const idx = relsXml.indexOf(closing);
    if (idx === -1) return relsXml;
    const fragments = [];
    for (const rel of hyperlinkRels) {
      if (!rel || !rel.id || rel.target == null) continue;
      const targetEscaped = escapeXmlAttr(String(rel.target));
      fragments.push(
        '<Relationship Id="' + escapeXmlAttr(String(rel.id)) + '" Type="' + HYPERLINK_TYPE + '" Target="' + targetEscaped + '" TargetMode="External"/>'
      );
    }
    if (fragments.length === 0) return relsXml;
    return relsXml.slice(0, idx) + fragments.join('') + relsXml.slice(idx);
  } catch (_) {
    return relsXml || '';
  }
}

module.exports = { htmlToWordXml, escapeXmlText, decodeHtmlEntities, formatDescriptionForWord, injectHyperlinkRels };
