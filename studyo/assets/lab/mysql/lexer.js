// MySQL sözdizimi için basit sözcük çözümleyici (tokenizer) ve komut bölücü.
// Belirteç: { t: 'id'|'qid'|'str'|'num'|'op'|'var'|'ws'|'cmt', v: kaynak metin, s, e, u?: büyük harf, val?: değer }

const ID_START = /[\p{L}_$]/u;
const ID_PART = /[\p{L}\p{N}_$]/u;
const OPS = ['<=>', '<<', '>>', '<=', '>=', '<>', '!=', ':=', '||', '&&', '->'];

export function tokenize(src) {
  const out = [];
  let i = 0;
  let versioned = false; // /*!40101 ... */ içi kod olarak okunur
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const s = i;
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(src[i])) i++;
      out.push({ t: 'ws', v: src.slice(s, i), s, e: i });
      continue;
    }
    if (versioned && c === '*' && src[i + 1] === '/') {
      i += 2;
      versioned = false;
      out.push({ t: 'ws', v: '  ', s, e: i });
      continue;
    }
    if (c === '#' || (c === '-' && src[i + 1] === '-' && (i + 2 >= n || /\s/.test(src[i + 2])))) {
      while (i < n && src[i] !== '\n') i++;
      out.push({ t: 'cmt', v: src.slice(s, i), s, e: i });
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      if (src[i + 2] === '!' && !versioned) {
        i += 3;
        while (i < n && /\d/.test(src[i])) i++;
        versioned = true;
        out.push({ t: 'ws', v: ' ', s, e: i });
        continue;
      }
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      out.push({ t: 'cmt', v: src.slice(s, i), s, e: i, open: end < 0 });
      continue;
    }
    if (c === "'" || c === '"') {
      const r = readString(src, i, c);
      out.push({ t: 'str', v: src.slice(s, r.end), s, e: r.end, val: r.value, q: c, open: r.open });
      i = r.end;
      continue;
    }
    if ((c === 'N' || c === 'n') && src[i + 1] === "'") {
      const r = readString(src, i + 1, "'");
      out.push({ t: 'str', v: src.slice(s, r.end), s, e: r.end, val: r.value, q: "'", open: r.open });
      i = r.end;
      continue;
    }
    if (c === '`') {
      let v = '';
      i++;
      let open = true;
      while (i < n) {
        if (src[i] === '`') {
          if (src[i + 1] === '`') { v += '`'; i += 2; continue; }
          i++;
          open = false;
          break;
        }
        v += src[i++];
      }
      out.push({ t: 'qid', v: src.slice(s, i), s, e: i, val: v, open });
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] || ''))) {
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X') && /[0-9a-f]/i.test(src[i + 2] || '')) {
        i += 2;
        while (i < n && /[0-9a-f]/i.test(src[i])) i++;
        out.push({ t: 'num', v: src.slice(s, i), s, e: i, val: parseInt(src.slice(s + 2, i), 16) });
        continue;
      }
      while (i < n && /\d/.test(src[i])) i++;
      if (src[i] === '.') { i++; while (i < n && /\d/.test(src[i])) i++; }
      if ((src[i] === 'e' || src[i] === 'E') && /[\d+-]/.test(src[i + 1] || '')) {
        i += 2;
        while (i < n && /\d/.test(src[i])) i++;
      }
      // 1abc gibi rakamla başlayan tanımlayıcılar
      if (i < n && ID_START.test(src[i]) && !/[eE]/.test(src[i])) {
        while (i < n && ID_PART.test(src[i])) i++;
        const v = src.slice(s, i);
        out.push({ t: 'id', v, s, e: i, u: v.toUpperCase() });
        continue;
      }
      out.push({ t: 'num', v: src.slice(s, i), s, e: i, val: Number(src.slice(s, i)) });
      continue;
    }
    if (c === '@') {
      i++;
      if (src[i] === '@') i++;
      if (src[i] === '`' || src[i] === "'" || src[i] === '"') {
        const q = src[i];
        const end = src.indexOf(q, i + 1);
        i = end < 0 ? n : end + 1;
      } else while (i < n && (ID_PART.test(src[i]) || src[i] === '.')) i++;
      out.push({ t: 'var', v: src.slice(s, i), s, e: i, u: src.slice(s, i).toUpperCase().replace(/[`'"]/g, '') });
      continue;
    }
    if (ID_START.test(c)) {
      while (i < n && ID_PART.test(src[i])) i++;
      const v = src.slice(s, i);
      out.push({ t: 'id', v, s, e: i, u: v.toUpperCase() });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      i += op.length;
      out.push({ t: 'op', v: op, s, e: i });
      continue;
    }
    i++;
    out.push({ t: 'op', v: c, s, e: i });
  }
  return out;
}

function readString(src, i, q) {
  let value = '';
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\' && j + 1 < src.length) {
      const nx = src[j + 1];
      const map = { n: '\n', t: '\t', r: '\r', 0: '\0', b: '\b', Z: '\x1a', "'": "'", '"': '"', '\\': '\\' };
      if (nx === '%' || nx === '_') value += '\\' + nx; // LIKE kaçışları korunur
      else value += map[nx] ?? nx;
      j += 2;
      continue;
    }
    if (ch === q) {
      if (src[j + 1] === q) { value += q; j += 2; continue; }
      return { value, end: j + 1, open: false };
    }
    value += ch;
    j++;
  }
  return { value, end: src.length, open: true };
}

/**
 * Betiği ; ile komutlara böler. DELIMITER komutunu da tanır.
 * Döner: [{ sql, s, e, tokens }] (tokens: komuta ait belirteçler, ; hariç)
 */
export function splitStatements(src) {
  const toks = tokenize(src);
  const out = [];
  let cur = [];
  let delim = ';';
  const state = { depth: 0, caseDepth: 0, routine: false };
  const flush = (end) => {
    const sig = cur.filter((t) => t.t !== 'ws' && t.t !== 'cmt');
    if (sig.length) {
      const s = sig[0].s;
      const e = sig[sig.length - 1].e;
      out.push({ sql: src.slice(s, e), s, e, end, tokens: cur.slice(cur.indexOf(sig[0]), cur.indexOf(sig[sig.length - 1]) + 1) });
    }
    cur = [];
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    // DELIMITER $$ satırı
    if (t.t === 'id' && t.u === 'DELIMITER' && cur.every((x) => x.t === 'ws' || x.t === 'cmt')) {
      const lineEnd = src.indexOf('\n', t.e);
      const d = src.slice(t.e, lineEnd < 0 ? src.length : lineEnd).trim();
      if (d) {
        delim = d;
        const stop = lineEnd < 0 ? src.length : lineEnd;
        while (k + 1 < toks.length && toks[k + 1].s < stop) k++;
        cur = [];
        continue;
      }
    }
    // END$$ gibi sınırlayıcının bir belirtecin sonuna yapıştığı durum
    if (delim !== ';' && (t.t === 'id' || t.t === 'op') && t.v.length > delim.length) {
      const ix = t.v.indexOf(delim);
      if (ix > 0) {
        const head = t.v.slice(0, ix);
        cur.push({ ...t, v: head, e: t.s + ix, u: head.toUpperCase() });
        flush(t.s + ix + delim.length);
        continue;
      }
    }
    // CREATE PROCEDURE/FUNCTION/TRIGGER gövdesindeki BEGIN ... END içindeki ; komutu bitirmez
    if (t.t === 'id' && delim === ';') trackCompound(t, toks, k, cur, state);
    if (delim === ';' ? t.t === 'op' && t.v === ';' && state.depth === 0 : src.startsWith(delim, t.s) && t.t !== 'str' && t.t !== 'qid' && t.t !== 'cmt') {
      if (delim !== ';' && delim.length > t.v.length) {
        // çok karakterli sınırlayıcı ($$): kalan parçaları atla
        let len = t.v.length;
        while (len < delim.length && k + 1 < toks.length) { k++; len += toks[k].v.length; }
      }
      flush(t.e);
      state.depth = 0;
      state.caseDepth = 0;
      state.routine = false;
      continue;
    }
    cur.push(t);
  }
  // betik sonu: bitmemiş komut (ör. BEGIN ... END tamamlanmadı) var mı?
  out.pending = state.depth > 0 || cur.some((x) => x.t !== 'ws' && x.t !== 'cmt');
  flush(src.length);
  return out;
}

const nextSig = (toks, k) => { for (let i = k + 1; i < toks.length; i++) if (toks[i].t !== 'ws' && toks[i].t !== 'cmt') return toks[i]; return null; };

/** Bileşik gövde (BEGIN ... END) derinliğini izler */
function trackCompound(t, toks, k, cur, state) {
  if (!state.routine) {
    // komut başı: CREATE [OR REPLACE] [DEFINER=...] PROCEDURE|FUNCTION|TRIGGER|EVENT
    const sig = cur.filter((x) => x.t !== 'ws' && x.t !== 'cmt');
    if (sig.length && sig[0].t === 'id' && sig[0].u === 'CREATE' && /^(PROCEDURE|FUNCTION|TRIGGER|EVENT)$/.test(t.u)) state.routine = true;
    return;
  }
  const n = nextSig(toks, k);
  if (t.u === 'BEGIN') state.depth++;
  else if (t.u === 'CASE' && state.prevU !== 'END') state.caseDepth++;
  else if (t.u === 'END') {
    const nu = n && n.t === 'id' ? n.u : '';
    if (nu === 'CASE') state.caseDepth = Math.max(0, state.caseDepth - 1);
    else if (/^(IF|WHILE|LOOP|REPEAT)$/.test(nu)) { /* blok sonu */ } else if (state.caseDepth > 0) state.caseDepth--;
    else state.depth = Math.max(0, state.depth - 1);
  }
  state.prevU = t.u;
}

/** Belirtilen konumdaki (imleç) komutu bulur. */
export function statementAt(src, pos) {
  const list = splitStatements(src);
  if (!list.length) return null;
  for (const st of list) if (pos <= st.end) return st;
  return list[list.length - 1];
}
