/* Gifted Brainz | Safe, structured AI explanation formatter.
 * No raw HTML from the model is trusted. Mathematics is typeset with the
 * site's existing KaTeX renderer, with a readable non-LaTeX fallback.
 */
(function (root) {
  'use strict';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function formatStudyAiExplanation(value, options = {}) {
    const renderText = typeof options.mathHtml === 'function' ? options.mathHtml : escapeHtml;
    const katex = options.katex === undefined ? root.katex : options.katex;
    const fragments = [];
    const save = html => {
      const key = `\uE100GB${fragments.length}\uE101`;
      fragments.push(html);
      return key;
    };
    const restore = html => String(html).replace(/\uE100GB(\d+)\uE101/g, (_, index) => fragments[Number(index)] ?? '');
    const readableMath = tex => {
      let value = String(tex || '').trim()
        .replace(/\\(?:d?frac|tfrac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1) / ($2)')
        .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
        .replace(/\\times\b/g, '×').replace(/\\cdot\b/g, '·').replace(/\\div\b/g, '÷')
        .replace(/\\(?:leq|le)\b/g, '≤').replace(/\\(?:geq|ge)\b/g, '≥')
        .replace(/\\neq\b/g, '≠').replace(/\\approx\b/g, '≈')
        .replace(/\\pi\b/g, 'π').replace(/\\theta\b/g, 'θ')
        .replace(/\\alpha\b/g, 'α').replace(/\\beta\b/g, 'β')
        .replace(/\\gamma\b/g, 'γ').replace(/\\Delta\b/g, 'Δ')
        .replace(/\\(?:displaystyle|textstyle|left|right|limits|nolimits)\b/g, '')
        .replace(/\\(?:boxed|text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]+)\}/g, '$1')
        .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, '')
        .replace(/\\\\/g, ' ; ')
        .replace(/\\(?:quad|qquad)\b/g, '  ')
        .replace(/\\(?:,|;|!|:)/g, ' ')
        .replace(/\\([A-Za-z]+)\b/g, '$1')
        .replace(/&/g, ' & ');
      return value;
    };
    const renderEquation = (formula, display) => {
      const tex = String(formula || '').trim();
      if (!tex) return '';
      try {
        if (typeof katex?.renderToString === 'function') {
          const html = katex.renderToString(tex, {throwOnError: true, trust: false, strict: false, displayMode: Boolean(display), output: 'html'});
          return display ? `<div class="gb-ai-math-block">${html}</div>` : `<span class="gb-ai-math-inline">${html}</span>`;
        }
      } catch (_error) { /* Keep working if a model returns imperfect TeX. */ }
      const fallback = renderText(readableMath(tex));
      return display ? `<div class="gb-ai-math-block gb-ai-math-fallback">${fallback}</div>` : `<span class="gb-ai-math-inline gb-ai-math-fallback">${fallback}</span>`;
    };

    let source = String(value ?? '').replace(/\r\n?/g, '\n')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2028\u2029]/g, '\n')
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/<\|(?:im_start|im_end|eot_id|endoftext|assistant|final)\|>/gi, '')
      .replace(/&nbsp;/gi, ' ').replace(/&times;/gi, '×')
      .replace(/&divide;/gi, '÷').replace(/&le;/gi, '≤').replace(/&ge;/gi, '≥')
      .trim();
    if (!source) return '<p class="gb-ai-empty">No explanation was returned.</p>';

    // Protect TeX and fenced code before any Markdown formatting. A display
    // equation may span multiple lines; splitting lines first broke it before.
    source = source.replace(/```\s*(?:math|latex|tex)\s*\n([\s\S]*?)\n?```/gi, (_, expr) => save(renderEquation(expr, true)));
    source = source.replace(/```(?:[^\n`]*)\n([\s\S]*?)\n?```/g, (_, code) => save(`<pre class="gb-ai-code-block"><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`));
    source = source.replace(/\\\[([\s\S]*?)\\\]/g, (_, expr) => save(renderEquation(expr, true)));
    source = source.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => save(renderEquation(expr, true)));
    source = source.replace(/\\begin\{(align\*?|aligned|equation\*?|gather\*?|gathered|matrix|pmatrix|bmatrix|cases)\}([\s\S]*?)\\end\{\1\}/g,
      (full) => save(renderEquation(full, true)));
    source = source.replace(/\\\(([\s\S]*?)\\\)/g, (_, expr) => save(renderEquation(expr, false)));
    source = source.replace(/(?<!\\)\$([^$\n]+?)\$/g, (whole, expr) => /[A-Za-z0-9\\=+^_{}]/.test(expr) && !/^\s*\d+(?:\.\d+)?\s*$/.test(expr) ? save(renderEquation(expr, false)) : whole);
    source = source.replace(/`([^`\n]+)`/g, (_, code) => save(`<code class="gb-ai-inline-code">${escapeHtml(code)}</code>`));

    function inline(text) {
      let s = String(text || '')
        .replace(/\\([*_`])/g, '$1')
        // A source link may be informative; render its label, never an
        // unchecked model-provided URL, scheme or HTML attribute.
        .replace(/\[([^\]]+)]\((?:https?:\/\/|mailto:)[^\s)]*\)/gi, '$1');
      s = renderText(s);
      s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
        .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<em>$1</em>')
        .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
        .replace(/(^|[\s>])((?:Step\s+\d+|Correct\s+answer|Final\s+answer|Key\s+(?:idea|point|formula)|Formula|Working|Explanation|Solution|Therefore|Conclusion|Why\s+the\s+others\s+are\s+wrong)\s*:)/gi,
          '$1<strong>$2</strong>');
      return restore(s);
    }

    const lines = source.split('\n');
    const output = [];
    let paragraph = [], list = [], listType = null;
    const flushParagraph = () => {
      if (paragraph.length) { output.push(`<p>${inline(paragraph.join(' ').trim())}</p>`); paragraph = []; }
    };
    const flushList = () => {
      if (list.length) { output.push(`<${listType} class="gb-ai-list">${list.map(item => `<li>${inline(item)}</li>`).join('')}</${listType}>`); list = []; listType = null; }
    };
    const flushAll = () => { flushParagraph(); flushList(); };
    const headingLike = /^(?:Step\s+\d+(?:\s*[:—-].*)?|Understanding\s+(?:the\s+)?question|What\s+(?:we|you)\s+(?:know|need)|Given|Key\s+(?:idea|points?|concept|formula)|Method|Formula|Working|Solution|Explanation|Correct\s+answer|Final\s+answer|Why\s+the\s+others\s+are\s+wrong|Conclusion|Quick\s+recap|Take\s+note|Practice|Summary)\s*:?$/i;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { flushAll(); continue; }
      if (/^\uE100GB\d+\uE101$/.test(line)) { flushAll(); output.push(restore(line)); continue; }
      if (/^(?:---+|___+|\*\*\*+)\s*$/.test(line)) { flushAll(); continue; }
      const title = line.match(/^#{1,4}\s+(.+?)\s*#*$/);
      if (title) { flushAll(); output.push(`<h3 class="gb-ai-section-heading">${inline(title[1])}</h3>`); continue; }
      const boldTitle = line.match(/^\*\*(.{2,95}?)\*\*\s*:?(?:\s*)$/);
      if (boldTitle || (line.length < 65 && headingLike.test(line))) {
        flushAll(); output.push(`<h3 class="gb-ai-section-heading">${inline(boldTitle ? boldTitle[1] : line)}</h3>`); continue;
      }
      const bullet = line.match(/^(?:[-*•])\s+(.+)$/);
      const numbered = line.match(/^\d{1,3}[.)]\s+(.+)$/);
      if (bullet || numbered) {
        flushParagraph();
        const type = numbered ? 'ol' : 'ul';
        if (listType && listType !== type) flushList();
        listType = type;
        list.push((bullet || numbered)[1]);
        continue;
      }
      const quote = line.match(/^>\s*(.+)$/);
      if (quote) { flushAll(); output.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }
      // If a line begins with a distinct labelled step after a paragraph,
      // start a separate paragraph rather than running all steps together.
      if (/^(?:Step\s+\d+|Final\s+answer|Correct\s+answer|Formula|Working|Therefore)\s*[:.—-]/i.test(line)) flushAll();
      if (list.length) flushList();
      paragraph.push(line);
    }
    flushAll();
    return `<div class="gb-ai-richtext">${output.join('')}</div>`;
  }
  root.GiftedStudyAiFormat = formatStudyAiExplanation;
})(typeof globalThis !== 'undefined' ? globalThis : window);
