// Saklı yordamlar (PROCEDURE), saklı fonksiyonlar (FUNCTION) ve tetikleyiciler (TRIGGER).
//
// Yordam / fonksiyon gövdeleri burada yorumlanır: bileşik ifadeler (BEGIN...END, IF, CASE, WHILE,
// REPEAT, LOOP, LEAVE, ITERATE, DECLARE, imleçler, hata yakalayıcılar, SIGNAL) JavaScript'te,
// basit SQL komutları ise oturumun olağan yoluyla (dispatch) yerel değişkenler yerine
// değerleri konarak çalıştırılır. Fonksiyonlar SQLite'a kullanıcı işlevi olarak kaydedilir.
//
// Tetikleyiciler SQLite tetikleyicilerine çevrilir: IF dalları koşul değişkenlerine,
// SET NEW.x = ... ise satırı güncelleyen bir AFTER tetikleyicisine dönüştürülür.

import { tokenize } from './lexer.js';

const LOOP_LIMIT = 200000;

/** Denetim akışı sinyalleri (hata değil) */
class Ctl {
  constructor(kind, label, value) { this.kind = kind; this.label = label; this.value = value; }
}

export function installRoutines(Session, MySqlServer, H) {
  const { err, MySqlError, dq, sq, lc, sig, Parser, syntaxError, isIntType, isTextType } = H;

  const litSql = (v) => {
    if (v == null) return 'NULL';
    if (typeof v === 'number') return v < 0 ? `(${v})` : String(v);
    if (typeof v === 'bigint') return String(v);
    if (v instanceof Uint8Array) return `X'${[...v].map((b) => b.toString(16).padStart(2, '0')).join('')}'`;
    return sq(String(v));
  };
  const isOp = (t, v) => t && t.t === 'op' && t.v === v;
  const isW = (t, w) => t && t.t === 'id' && t.u === w;
  const truthy = (v) => {
    if (v == null) return false;
    if (typeof v === 'number') return v !== 0;
    const n = parseFloat(String(v));
    return Number.isFinite(n) && n !== 0;
  };
  const sqliteVal = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v);
  const fmtNow = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  // ------------------------------------------------------------ gövde çözümleyici

  class BodyParser {
    /** src: tüm kaynak; [from, to): gövde aralığı */
    constructor(src, from = 0, to = src.length) {
      this.src = src;
      this.toks = tokenize(src.slice(0, to)).filter((t) => t.s >= from);
      this.S = [];
      this.toks.forEach((t, i) => { if (sig(t)) this.S.push(i); });
      this.j = 0;
      this.stmt = { s: from, e: to };
      this.labels = [];
    }
    tok(j) { return j >= 0 && j < this.S.length ? this.toks[this.S[j]] : null; }
    get cur() { return this.tok(this.j); }
    peek(n = 0) { return this.tok(this.j + n); }
    done() { return this.j >= this.S.length; }
    match(t, w) { return t && (t.t === 'id' ? t.u === w : t.t === 'op' && t.v === w); }
    is(...w) { return w.every((x, k) => this.match(this.peek(k), x)); }
    eat(...w) { if (!this.is(...w)) return false; this.j += w.length; return true; }
    expect(...w) { if (!this.eat(...w)) throw this.syntax(); }
    syntax(t = this.cur) { return syntaxError(this.src, this.stmt, t); }
    name() {
      const t = this.cur;
      if (!t || !(t.t === 'id' || t.t === 'qid')) throw this.syntax();
      this.j++;
      return t.t === 'id' ? t.v : t.val;
    }
    /** sig aralığı [a, b) → tam belirteç dizisi (boşluklar dahil) */
    slice(a, b) { return b > a ? this.toks.slice(this.S[a], this.S[b - 1] + 1) : []; }
    /** Üst düzeyde stop(t) doğru olana dek ilerler; [a, b) döndürür */
    scan(stop) {
      const a = this.j;
      let depth = 0;
      let cases = 0;
      for (; this.j < this.S.length; this.j++) {
        const t = this.cur;
        if (isOp(t, '(')) depth++;
        else if (isOp(t, ')')) { if (depth === 0) break; depth--; } else if (depth === 0) {
          if (isW(t, 'CASE')) cases++;
          else if (isW(t, 'END') && cases > 0) cases--;
          else if (cases === 0 && stop(t)) break;
        }
      }
      return { a, b: this.j };
    }
    expr(...words) {
      const r = this.scan((t) => isOp(t, ';') || (t.t === 'id' && words.includes(t.u)));
      if (r.b === r.a) throw this.syntax();
      return this.slice(r.a, r.b);
    }

    parseRoutineBody() {
      const st = this.statement();
      this.eat(';');
      if (!this.done()) throw this.syntax();
      return st;
    }

    list(stops) {
      const out = [];
      let declPhase = 0; // 0: değişken/koşul, 1: imleç, 2: yakalayıcı, 3: komut
      while (!this.done() && !(this.cur.t === 'id' && stops.includes(this.cur.u))) {
        const t0 = this.cur;
        const st = this.statement();
        if (st.k === 'var' || st.k === 'cond') {
          if (declPhase === 3) throw this.syntax(t0);
          if (declPhase > 0) throw err(1337, 'Variable or condition declaration after cursor or handler declaration');
        } else if (st.k === 'cursor') {
          if (declPhase === 3) throw this.syntax(t0);
          if (declPhase > 1) throw err(1338, 'Cursor declaration after handler declaration');
          declPhase = 1;
        } else if (st.k === 'handler') {
          if (declPhase === 3) throw this.syntax(t0);
          declPhase = 2;
        } else declPhase = 3;
        out.push(st);
        if (!this.eat(';')) throw this.syntax();
      }
      return out;
    }

    statement() {
      const t = this.cur;
      if (!t) throw this.syntax();
      let label = null;
      if ((t.t === 'id' || t.t === 'qid') && isOp(this.peek(1), ':') && ['BEGIN', 'LOOP', 'WHILE', 'REPEAT'].some((w) => this.match(this.peek(2), w))) {
        label = lc(this.name());
        this.j++;
      }
      const w = this.cur.t === 'id' ? this.cur.u : '';
      const at = this.cur;
      switch (w) {
        case 'BEGIN': {
          this.j++;
          this.eat('NOT', 'ATOMIC');
          this.labels.push({ label, loop: false });
          const body = this.list(['END']);
          this.labels.pop();
          this.expect('END');
          this.endLabel(label);
          return { k: 'block', label, body, at };
        }
        case 'DECLARE': return this.declare();
        case 'SET': {
          if (this.is('SET', 'NAMES') || this.is('SET', 'CHARACTER') || this.is('SET', 'PASSWORD') || this.is('SET', 'TRANSACTION') || this.is('SET', 'GLOBAL', 'TRANSACTION') || this.is('SET', 'SESSION', 'TRANSACTION')) return this.simple();
          this.j++;
          const items = [];
          for (;;) {
            const tt = this.cur;
            if (!tt) throw this.syntax();
            let target;
            if (tt.t === 'var' && !tt.v.startsWith('@@')) { target = { kind: 'user', name: lc(tt.v.slice(1).replace(/[`'"]/g, '')) }; this.j++; } else if (tt.t === 'var') { target = { kind: 'sys', name: tt.v.slice(2).replace(/^(session|global|local)\./i, '') }; this.j++; } else {
              if (this.eat('SESSION') || this.eat('GLOBAL') || this.eat('LOCAL') || this.eat('PERSIST')) { target = { kind: 'sys', name: this.name() }; } else {
                const n = this.name();
                if (this.eat('.')) target = { kind: lc(n) === 'new' ? 'new' : lc(n) === 'old' ? 'old' : 'sys', name: this.name() };
                else target = { kind: 'name', name: n };
              }
            }
            if (!this.eat('=') && !this.eat(':=')) throw this.syntax();
            const value = this.expr();
            items.push({ target, value });
            if (!this.eat(',')) break;
          }
          return { k: 'set', items, at };
        }
        case 'IF': {
          this.j++;
          const branches = [];
          let cond = this.expr('THEN');
          this.expect('THEN');
          let body = this.list(['ELSEIF', 'ELSE', 'END']);
          branches.push({ cond, body });
          let other = null;
          for (;;) {
            if (this.eat('ELSEIF')) {
              cond = this.expr('THEN');
              this.expect('THEN');
              body = this.list(['ELSEIF', 'ELSE', 'END']);
              branches.push({ cond, body });
              continue;
            }
            if (this.eat('ELSE')) other = this.list(['END']);
            break;
          }
          this.expect('END', 'IF');
          return { k: 'if', branches, other, at };
        }
        case 'CASE': {
          this.j++;
          const value = this.is('WHEN') ? null : this.expr('WHEN');
          const whens = [];
          while (this.eat('WHEN')) {
            const cond = this.expr('THEN');
            this.expect('THEN');
            whens.push({ cond, body: this.list(['WHEN', 'ELSE', 'END']) });
          }
          if (!whens.length) throw this.syntax();
          const other = this.eat('ELSE') ? this.list(['END']) : null;
          this.expect('END', 'CASE');
          return { k: 'case', value, whens, other, at };
        }
        case 'WHILE': {
          this.j++;
          const cond = this.expr('DO');
          this.expect('DO');
          this.labels.push({ label, loop: true });
          const body = this.list(['END']);
          this.labels.pop();
          this.expect('END', 'WHILE');
          this.endLabel(label);
          return { k: 'while', label, cond, body, at };
        }
        case 'REPEAT': {
          this.j++;
          this.labels.push({ label, loop: true });
          const body = this.list(['UNTIL']);
          this.labels.pop();
          this.expect('UNTIL');
          const cond = this.expr('END');
          this.expect('END', 'REPEAT');
          this.endLabel(label);
          return { k: 'repeat', label, cond, body, at };
        }
        case 'LOOP': {
          this.j++;
          this.labels.push({ label, loop: true });
          const body = this.list(['END']);
          this.labels.pop();
          this.expect('END', 'LOOP');
          this.endLabel(label);
          return { k: 'loop', label, body, at };
        }
        case 'LEAVE':
        case 'ITERATE': {
          this.j++;
          const name = lc(this.name());
          const l = this.labels.find((x) => x.label === name);
          if (!l || (w === 'ITERATE' && !l.loop)) throw err(1308, `${w} with no matching label: ${name}`);
          return { k: w.toLowerCase(), label: name, at };
        }
        case 'RETURN': {
          this.j++;
          return { k: 'return', value: this.expr(), at };
        }
        case 'OPEN':
        case 'CLOSE': {
          this.j++;
          return { k: w.toLowerCase(), name: lc(this.name()), at };
        }
        case 'FETCH': {
          this.j++;
          if (this.eat('NEXT')) this.expect('FROM'); else this.eat('FROM');
          const name = lc(this.name());
          this.expect('INTO');
          const into = [];
          do into.push(this.target()); while (this.eat(','));
          return { k: 'fetch', name, into, at };
        }
        case 'SIGNAL':
        case 'RESIGNAL': {
          this.j++;
          let state = null;
          let cond = null;
          if (this.eat('SQLSTATE')) {
            this.eat('VALUE');
            const s = this.cur;
            if (!s || s.t !== 'str') throw this.syntax();
            state = s.val;
            this.j++;
          } else if (this.cur && (this.cur.t === 'id' || this.cur.t === 'qid') && !this.is('SET')) cond = lc(this.name());
          else if (w === 'SIGNAL') throw this.syntax();
          const sets = {};
          if (this.eat('SET')) {
            do {
              const n = this.name().toUpperCase();
              this.expect('=');
              sets[n] = this.expr();
            } while (this.eat(','));
          }
          return { k: w.toLowerCase(), state, cond, sets, at };
        }
        case 'GET': {
          this.j++;
          this.eat('CURRENT') || this.eat('STACKED');
          this.expect('DIAGNOSTICS');
          const items = [];
          let cond = null;
          if (this.eat('CONDITION')) { cond = this.slice(this.j, this.j + 1); this.j++; }
          do {
            const target = this.target();
            this.expect('=');
            items.push({ target, what: this.name().toUpperCase() });
          } while (this.eat(','));
          return { k: 'diag', cond, items, at };
        }
        default:
          if (label) throw this.syntax();
          return this.simple();
      }
    }

    endLabel(label) {
      const t = this.cur;
      if (t && (t.t === 'id' || t.t === 'qid') && !isOp(t, ';')) {
        const n = lc(t.t === 'id' ? t.v : t.val);
        if (!['IF', 'WHILE', 'LOOP', 'REPEAT', 'CASE', 'END', 'ELSE', 'ELSEIF', 'WHEN', 'UNTIL'].includes(t.u)) {
          if (n !== label) throw err(1310, `End-label ${n} without match`);
          this.j++;
        }
      }
    }

    target() {
      const t = this.cur;
      if (t && t.t === 'var' && !t.v.startsWith('@@')) { this.j++; return { kind: 'user', name: lc(t.v.slice(1).replace(/[`'"]/g, '')) }; }
      return { kind: 'name', name: this.name() };
    }

    simple() {
      const a = this.j;
      const r = this.scan((t) => isOp(t, ';'));
      const toks = this.slice(r.a, r.b);
      if (!toks.length) throw this.syntax();
      const first = this.tok(a);
      return { k: 'simple', word: first.t === 'id' ? first.u : first.v, toks, at: first };
    }

    declare() {
      const at = this.cur;
      this.expect('DECLARE');
      if (this.is('CONTINUE') || this.is('EXIT') || this.is('UNDO')) {
        const action = this.cur.u;
        this.j++;
        this.expect('HANDLER');
        this.expect('FOR');
        const conds = [];
        do {
          if (this.eat('SQLEXCEPTION')) conds.push({ type: 'exception' });
          else if (this.eat('SQLWARNING')) conds.push({ type: 'warning' });
          else if (this.eat('NOT', 'FOUND')) conds.push({ type: 'notfound' });
          else if (this.eat('SQLSTATE')) {
            this.eat('VALUE');
            const s = this.cur;
            if (!s || s.t !== 'str') throw this.syntax();
            this.j++;
            conds.push({ type: 'state', v: s.val });
          } else if (this.cur && this.cur.t === 'num') { conds.push({ type: 'code', v: this.cur.val }); this.j++; } else conds.push({ type: 'named', v: lc(this.name()) });
        } while (this.eat(','));
        const body = this.statement();
        return { k: 'handler', action, conds, body, at };
      }
      const names = [];
      do names.push(this.name()); while (this.eat(','));
      if (names.length === 1 && this.eat('CONDITION')) {
        this.expect('FOR');
        if (this.eat('SQLSTATE')) {
          this.eat('VALUE');
          const s = this.cur;
          if (!s || s.t !== 'str') throw this.syntax();
          this.j++;
          return { k: 'cond', name: lc(names[0]), state: s.val, at };
        }
        const c = this.cur;
        if (!c || c.t !== 'num') throw this.syntax();
        this.j++;
        return { k: 'cond', name: lc(names[0]), code: c.val, at };
      }
      if (names.length === 1 && this.eat('CURSOR')) {
        this.expect('FOR');
        const sel = this.simple();
        return { k: 'cursor', name: lc(names[0]), sel, at };
      }
      // tür: oturumun tür çözümleyicisiyle
      const p = new Parser(this.slice(this.j, this.S.length), this.src, this.stmt);
      const type = this.session.parseType(p);
      const typeText = p.textOf(p.toks.slice(0, p.i));
      this.j += p.i;
      let def = null;
      if (this.eat('DEFAULT')) def = this.expr();
      return { k: 'var', names, type, typeText, def, at };
    }
  }

  // ------------------------------------------------------------ Session yöntemleri

  Object.assign(Session.prototype, {
    // --- yardımcılar

    parseBody(src, from, to) {
      const bp = new BodyParser(src, from, to);
      bp.session = this;
      return bp;
    },

    routineAst(ctx, r) {
      const cache = (this.server.routineCache ??= new Map());
      const key = `${ctx.name}\u0000${r.type}\u0000${lc(r.name)}`;
      const hit = cache.get(key);
      if (hit && hit.body === r.body) return hit.ast;
      const bp = this.parseBody(r.body);
      const ast = bp.parseRoutineBody();
      cache.set(key, { body: r.body, ast });
      return ast;
    },

    lookupLocal(name) {
      const f = this.frame;
      if (!f) return null;
      const n = lc(name);
      for (let i = f.scopes.length - 1; i >= 0; i--) {
        const v = f.scopes[i].vars.get(n);
        if (v) return v;
      }
      return null;
    },

    /** translate() için: yerel değişkenin SQL karşılığı (yoksa undefined) */
    localRef(name, opts) {
      if (opts.trigger) return opts.trigger.locals.has(lc(name)) ? `m_getvar(${sq('#' + lc(name))})` : undefined;
      const v = this.lookupLocal(name);
      return v ? litSql(v.value) : undefined;
    },

    /** INSERT sütun listesi, UPDATE SET sol tarafı, tablo adları gibi yerel değişken olamayacak adları işaretler */
    markNoLocal(toks) {
      const S = toks.filter(sig);
      const T = (j) => S[j];
      let mode = null;
      let depth = 0;
      for (let j = 0; j < S.length; j++) {
        const t = T(j);
        if (isOp(t, '(')) depth++;
        else if (isOp(t, ')')) depth--;
        if (t.t !== 'id' && t.t !== 'qid' && !isOp(t, '(')) continue;
        const prev = T(j - 1);
        if (prev && prev.t === 'id' && ['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'AS'].includes(prev.u) && (t.t === 'id' || t.t === 'qid')) t.__noLocal = true;
        // INSERT INTO t (a, b)
        if (isOp(t, '(') && prev && (prev.t === 'id' || prev.t === 'qid') && T(j - 2) && isW(T(j - 2), 'INTO')) {
          for (let m = j + 1; m < S.length && !isOp(T(m), ')'); m++) T(m).__noLocal = true;
        }
        if (t.t === 'id' && (t.u === 'SET' || (t.u === 'UPDATE' && prev && isW(prev, 'KEY')))) { mode = depth; continue; }
        if (mode != null && depth === mode && (t.t === 'id' || t.t === 'qid')) {
          // atama sol tarafı: ad [. ad] =
          const n1 = T(j + 1);
          if (isOp(n1, '=') && !(prev && isOp(prev, '.'))) t.__noLocal = true;
          else if (isOp(n1, '.') && isOp(T(j + 3), '=')) T(j + 2).__noLocal = true;
          if (t.t === 'id' && ['WHERE', 'ORDER', 'LIMIT'].includes(t.u)) mode = null;
        }
      }
    },

    coerceLocal(v, type, name) {
      if (v == null || !type) return v ?? null;
      const t = type.type;
      const num = (kind) => {
        if (typeof v === 'number') return v;
        if (typeof v === 'bigint') return Number(v);
        const s = String(v).trim();
        if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
        throw err(1366, `Incorrect ${kind} value: '${v}' for column '${name}' at row 1`);
      };
      if (isIntType(t)) {
        let n = num('integer');
        n = Math.sign(n) * Math.round(Math.abs(n));
        return n;
      }
      if (t === 'decimal') {
        const n = num('decimal');
        const sc = type.scale ?? 0;
        return Math.round(n * 10 ** sc) / 10 ** sc;
      }
      if (t === 'float' || t === 'double') return num('double');
      if (isTextType(t) && t !== 'json') {
        const s = String(v);
        if (type.len && [...s].length > type.len) throw err(1406, `Data too long for column '${name}' at row 1`);
        return s;
      }
      return v;
    },

    /** İfade belirteçlerini (yerel değişkenlerle) değerlendirir */
    evalTokens(toks, src) {
      let ctx = this.db ? this.server.getDb(this.db) : null;
      let tr = this.translate(toks, src, ctx, { noOrderWrap: true });
      if (tr.qualifiers.size === 1) {
        const q = [...tr.qualifiers][0];
        if (!ctx || ctx.name !== q) { ctx = this.server.getDb(q); tr = this.translate(toks, src, ctx, { noOrderWrap: true }); }
      }
      const db = ctx ? ctx.sql : this.server.scratch;
      try {
        const r = db.exec('SELECT ' + tr.text);
        return r[0]?.values[0][0] ?? null;
      } catch (e) {
        throw this.mapError(e, { kind: 'SELECT', ctx, toks: toks.filter(sig), src });
      }
    },

    evalExpr(toks) { return this.evalTokens(toks, this.frame.src); },

    assignTarget(target, value) {
      if (target.kind === 'user') { this.vars.set(target.name, value ?? null); return; }
      const v = this.lookupLocal(target.name);
      if (!v) throw err(1327, `Undeclared variable: ${target.name}`);
      v.value = this.coerceLocal(value, v.type, v.name);
    },

    // --- SELECT ... INTO

    /** Üst düzey INTO konumunu bulur (sig belirteçler üzerinde) */
    findInto(S) {
      let depth = 0;
      for (let j = 0; j < S.length; j++) {
        const t = S[j];
        if (isOp(t, '(')) depth++;
        else if (isOp(t, ')')) depth--;
        else if (depth === 0 && isW(t, 'INTO') && !(j > 0 && isW(S[j - 1], 'INSERT')) && !(j > 0 && isW(S[j - 1], 'REPLACE'))) return j;
      }
      return -1;
    },

    selectInto(src, st) {
      const S = st.tokens.filter(sig);
      const ix = this.findInto(S);
      let m = ix + 1;
      const targets = [];
      if (isW(S[m], 'OUTFILE') || isW(S[m], 'DUMPFILE')) throw err(1290, 'The MySQL server is running with the --secure-file-priv option so it cannot execute this statement');
      for (;;) {
        const t = S[m];
        if (!t) throw syntaxError(src, st, null);
        if (t.t === 'var' && !t.v.startsWith('@@')) targets.push({ kind: 'user', name: lc(t.v.slice(1).replace(/[`'"]/g, '')) });
        else if (t.t === 'id' || t.t === 'qid') {
          const n = t.t === 'id' ? t.v : t.val;
          if (!this.lookupLocal(n)) throw err(1327, `Undeclared variable: ${n}`);
          targets.push({ kind: 'name', name: n });
        } else throw syntaxError(src, st, t);
        m++;
        if (isOp(S[m], ',')) { m++; continue; }
        break;
      }
      const drop = new Set(S.slice(ix, m));
      const tokens = st.tokens.filter((t) => !drop.has(t));
      const saveLimit = this.limitRows;
      this.limitRows = 0;
      let r;
      try { r = this.dml(src, { ...st, tokens }, 'SELECT'); } finally { this.limitRows = saveLimit; }
      if (r.columns.length !== targets.length) throw err(1222, 'The used SELECT statements have a different number of columns');
      if (r.rows.length > 1) throw err(1172, 'Result consisted of more than one row');
      if (!r.rows.length) {
        const w = new MySqlError(1329, 'No data - zero rows fetched, selected, or processed', '02000');
        w.warning = true;
        throw w;
      }
      targets.forEach((tg, i) => this.assignTarget(tg, r.rows[0][i]));
      return { affected: 1 };
    },

    // --- yürütme

    execList(list) {
      for (let i = 0; i < list.length; i++) {
        try {
          this.execStmt(list[i]);
        } catch (e) {
          if (!(e instanceof MySqlError) || e.noHandler) throw e;
          const h = this.findHandler(e);
          if (!h) {
            if (e.warning) { this.frame.warnings++; continue; }
            e.noHandler = true;
            throw e;
          }
          this.runHandler(h, e);
        }
      }
    },

    findHandler(e) {
      const f = this.frame;
      const cls = String(e.state || '').slice(0, 2);
      for (let i = f.scopes.length - 1; i >= 0; i--) {
        const sc = f.scopes[i];
        if (sc.busy) continue;
        let best = null;
        let rank = 0;
        for (const h of sc.handlers) {
          for (const c of h.conds) {
            let r = 0;
            let cc = c;
            if (c.type === 'named') {
              const def = this.findCond(c.v);
              if (!def) continue;
              cc = def.code != null ? { type: 'code', v: def.code } : { type: 'state', v: def.state };
            }
            if (cc.type === 'code' && cc.v === e.code) r = 4;
            else if (cc.type === 'state' && cc.v === e.state) r = 3;
            else if (cc.type === 'notfound' && cls === '02') r = 2;
            else if (cc.type === 'warning' && cls === '01') r = 2;
            else if (cc.type === 'exception' && !['00', '01', '02'].includes(cls)) r = 1;
            if (r > rank) { rank = r; best = h; }
          }
        }
        if (best) return { h: best, scope: sc };
      }
      return null;
    },

    findCond(name) {
      const f = this.frame;
      for (let i = f.scopes.length - 1; i >= 0; i--) { const c = f.scopes[i].conds.get(name); if (c) return c; }
      return null;
    },

    runHandler({ h, scope }, e) {
      const f = this.frame;
      const prevDiag = f.diag;
      const prevActive = f.activeError;
      f.diag = e;
      f.activeError = e;
      scope.busy = true;
      try {
        this.execStmt(h.body);
      } finally {
        scope.busy = false;
        f.activeError = prevActive;
        void prevDiag;
      }
      if (h.action === 'EXIT' || h.action === 'UNDO') throw new Ctl('exit', null, scope);
    },

    execStmt(st) {
      const f = this.frame;
      if (++f.steps > LOOP_LIMIT * 5) throw err(1105, 'Simülatör: saklı program çok fazla adım çalıştırdı (sonsuz döngü olabilir).');
      switch (st.k) {
        case 'block': {
          const scope = { vars: new Map(), cursors: new Map(), handlers: [], conds: new Map() };
          f.scopes.push(scope);
          try {
            this.execList(st.body);
          } catch (c) {
            if (c instanceof Ctl && ((c.kind === 'leave' && c.label === st.label && st.label) || (c.kind === 'exit' && c.value === scope))) return;
            throw c;
          } finally {
            f.scopes.pop();
          }
          return;
        }
        case 'var': {
          const scope = f.scopes[f.scopes.length - 1];
          const v = st.def ? this.evalExpr(st.def) : null;
          for (const n of st.names) {
            if (scope.vars.has(lc(n))) throw err(1331, `Duplicate variable: ${n}`);
            scope.vars.set(lc(n), { name: n, type: st.type, value: this.coerceLocal(v, st.type, n) });
          }
          return;
        }
        case 'cond': f.scopes[f.scopes.length - 1].conds.set(st.name, st); return;
        case 'cursor': f.scopes[f.scopes.length - 1].cursors.set(st.name, { sel: st.sel, open: false, rows: [], pos: 0 }); return;
        case 'handler': f.scopes[f.scopes.length - 1].handlers.push(st); return;
        case 'set': {
          for (const it of st.items) {
            const tg = it.target;
            if (tg.kind === 'new' || tg.kind === 'old') throw err(1235, 'NEW/OLD yalnızca tetikleyicilerde kullanılabilir.');
            const value = this.evalExpr(it.value);
            if (tg.kind === 'user') this.vars.set(tg.name, value);
            else if (tg.kind === 'name' && this.lookupLocal(tg.name)) this.assignTarget(tg, value);
            else this.setSysVar(tg.name, value, { syntax: () => err(1064, 'syntax') });
          }
          return;
        }
        case 'if': {
          for (const b of st.branches) {
            if (truthy(this.evalExpr(b.cond))) { this.execList(b.body); return; }
          }
          if (st.other) this.execList(st.other);
          return;
        }
        case 'case': {
          const v = st.value ? this.evalExpr(st.value) : null;
          for (const w of st.whens) {
            const x = this.evalExpr(w.cond);
            const hit = st.value ? (v != null && x != null && (typeof v === 'number' || typeof x === 'number' ? Number(v) === Number(x) : lc(v) === lc(x))) : truthy(x);
            if (hit) { this.execList(w.body); return; }
          }
          if (!st.other) throw err(1339, 'Case not found for CASE statement');
          this.execList(st.other);
          return;
        }
        case 'while':
        case 'repeat':
        case 'loop': {
          let n = 0;
          for (;;) {
            if (st.k === 'while' && !truthy(this.evalExpr(st.cond))) return;
            if (++n > LOOP_LIMIT) throw err(1105, `Simülatör: döngü ${LOOP_LIMIT} turu aştı (sonsuz döngü olabilir).`);
            try {
              this.execList(st.body);
            } catch (c) {
              if (c instanceof Ctl && c.label === st.label && st.label) {
                if (c.kind === 'leave') return;
                if (c.kind === 'iterate') continue;
              }
              throw c;
            }
            if (st.k === 'repeat' && truthy(this.evalExpr(st.cond))) return;
          }
        }
        case 'leave': throw new Ctl('leave', st.label);
        case 'iterate': throw new Ctl('iterate', st.label);
        case 'return': throw new Ctl('return', null, this.evalExpr(st.value));
        case 'open': {
          const c = this.cursor(st.name);
          if (c.open) throw err(1325, 'Cursor is already open');
          const sel = st.sel || c.sel;
          const saveLimit = this.limitRows;
          this.limitRows = 0;
          try {
            const r = this.dml(f.src, this.stmtOf(sel.toks), 'SELECT');
            c.rows = r.rows;
          } finally { this.limitRows = saveLimit; }
          c.pos = 0;
          c.open = true;
          return;
        }
        case 'close': {
          const c = this.cursor(st.name);
          if (!c.open) throw err(1326, 'Cursor is not open');
          c.open = false;
          return;
        }
        case 'fetch': {
          const c = this.cursor(st.name);
          if (!c.open) throw err(1326, 'Cursor is not open');
          if (c.pos >= c.rows.length) throw new MySqlError(1329, 'No data - zero rows fetched, selected, or processed', '02000');
          const row = c.rows[c.pos++];
          if (row.length !== st.into.length) throw err(1328, 'Incorrect number of FETCH variables');
          st.into.forEach((tg, i) => this.assignTarget(tg, row[i]));
          return;
        }
        case 'signal':
        case 'resignal': {
          let state = st.state;
          let code = null;
          let msg = null;
          if (st.k === 'resignal') {
            if (!f.activeError) throw err(1645, 'RESIGNAL when handler not active');
            if (!state && !st.cond) { state = f.activeError.state; code = f.activeError.code; msg = f.activeError.message; }
          }
          if (st.cond) {
            const c = this.findCond(st.cond);
            if (!c) throw err(1319, `Undefined CONDITION: ${st.cond}`);
            if (c.state == null) throw err(1645, 'SIGNAL/RESIGNAL can only use a CONDITION defined with SQLSTATE');
            state = c.state;
          }
          if (!/^[0-9A-Z]{5}$/.test(state || '') || state.startsWith('00')) throw err(1407, `Bad SQLSTATE: '${state}'`);
          const cls = state.slice(0, 2);
          if (st.sets.MYSQL_ERRNO) code = Number(this.evalExpr(st.sets.MYSQL_ERRNO));
          if (st.sets.MESSAGE_TEXT) msg = String(this.evalExpr(st.sets.MESSAGE_TEXT) ?? '');
          code ??= cls === '01' ? 1642 : cls === '02' ? 1643 : 1644;
          msg ??= cls === '01' ? 'Unhandled user-defined warning condition' : cls === '02' ? 'Unhandled user-defined not found condition' : 'Unhandled user-defined exception condition';
          const e = new MySqlError(code, msg, state);
          if (cls === '01') e.warning = true;
          throw e;
        }
        case 'diag': {
          const e = f.diag;
          for (const it of st.items) {
            let v = null;
            if (it.what === 'NUMBER') v = e ? 1 : 0;
            else if (it.what === 'ROW_COUNT') v = f.affected;
            else if (e && it.what === 'MESSAGE_TEXT') v = e.message;
            else if (e && it.what === 'MYSQL_ERRNO') v = e.code;
            else if (e && it.what === 'RETURNED_SQLSTATE') v = e.state;
            this.assignTarget(it.target, v);
          }
          return;
        }
        case 'simple': return this.execSimple(st);
        default: throw err(1105, 'Bilinmeyen ifade: ' + st.k);
      }
    },

    cursor(name) {
      const f = this.frame;
      for (let i = f.scopes.length - 1; i >= 0; i--) { const c = f.scopes[i].cursors.get(name); if (c) return c; }
      throw err(1324, `Undefined CURSOR: ${name}`);
    },

    stmtOf(toks) {
      const S = toks.filter(sig);
      const s = S[0].s;
      const e = S[S.length - 1].e;
      return { sql: this.frame.src.slice(s, e), s, e, tokens: toks };
    },

    execSimple(st) {
      const f = this.frame;
      if (!st.marked) { this.markNoLocal(st.toks); st.marked = true; }
      const S = st.toks.filter(sig);
      if ((st.word === 'SELECT' || st.word === '(' || st.word === 'WITH') && this.findInto(S) >= 0) {
        this.selectInto(f.src, this.stmtOf(st.toks));
        f.affected = 1;
        return;
      }
      const r = this.dispatch(f.src, this.stmtOf(st.toks));
      if (r.rows) {
        if (f.isFunction) throw err(1415, 'Not allowed to return a result set from a function');
        f.results.push({ ...r, sql: this.stmtOf(st.toks).sql });
        f.affected = -1;
      } else if (r.multi) {
        f.results.push(...r.multi);
        f.affected = r.affected;
      } else f.affected = r.affected ?? 0;
    },

    /** Yordamı / fonksiyonu çalıştırır. Döner: { results, affected, out, ret } */
    runRoutine(ctx, r, values, isFunction) {
      for (let p = this.frame; p; p = p.parent) {
        if (p.ctx === ctx && p.r.name === r.name && p.r.type === r.type) {
          if (isFunction) throw err(1424, 'Recursive stored functions and triggers are not allowed.');
          throw err(1456, `Recursive limit 0 (as set by the max_sp_recursion_depth variable) was exceeded for routine ${r.name}`);
        }
      }
      const ast = this.routineAst(ctx, r);
      const saved = { frame: this.frame, db: this.db };
      const scope = { vars: new Map(), cursors: new Map(), handlers: [], conds: new Map() };
      r.params.forEach((p, i) => scope.vars.set(lc(p.name), { name: p.name, type: p.type, value: this.coerceLocal(values[i], p.type, p.name) }));
      const frame = { r, ctx, src: r.body, parent: saved.frame, scopes: [scope], results: [], affected: 0, steps: 0, warnings: 0, isFunction };
      this.frame = frame;
      this.db = ctx.name;
      let ret;
      let returned = false;
      try {
        this.execStmt(ast);
      } catch (c) {
        if (c instanceof Ctl && c.kind === 'return') { ret = c.value; returned = true; } else if (c instanceof Ctl) { /* üst blok çıkışı */ } else {
          if (c instanceof MySqlError) delete c.noHandler;
          throw c;
        }
      } finally {
        this.frame = saved.frame;
        this.db = saved.db;
      }
      if (isFunction && !returned) throw err(1321, `FUNCTION ${r.name} ended without RETURN`);
      return { results: frame.results, affected: frame.affected, out: r.params.map((p) => scope.vars.get(lc(p.name)).value), ret };
    },

    /** SQLite kullanıcı işlevinden çağrılır */
    callFunction(ctx, name, args) {
      const r = ctx.meta.functions?.[lc(name)];
      if (!r) throw err(1305, `FUNCTION ${ctx.name}.${lc(name)} does not exist`);
      if (args.length !== r.params.length) throw err(1318, `Incorrect number of arguments for FUNCTION ${ctx.name}.${r.name}; expected ${r.params.length}, got ${args.length}`);
      if (!this.server.can(this.account, ctx.name, 'EXECUTE')) throw err(1370, `execute command denied to user '${this.user}'@'${this.host}' for routine '${ctx.name}.${r.name}'`);
      const res = this.runRoutine(ctx, r, args, true);
      return this.coerceLocal(res.ret, r.returnType, r.name);
    },

    // --- CALL

    call(p, src, st) {
      p.expect('CALL');
      const q = p.qname();
      const ctx = this.ctx(q.db || this.db);
      const r = ctx.meta.procedures?.[lc(q.name)];
      if (!r) throw err(1305, `PROCEDURE ${ctx.name}.${lc(q.name)} does not exist`);
      if (!this.server.can(this.account, ctx.name, 'EXECUTE')) throw err(1370, `execute command denied to user '${this.user}'@'${this.host}' for routine '${ctx.name}.${r.name}'`);
      // argümanlar: tam belirteçler üzerinden
      const full = st.tokens;
      const open = full.findIndex((t) => isOp(t, '('));
      const args = [];
      if (open >= 0) {
        let depth = 0;
        let cur = [];
        for (let i = open + 1; i < full.length; i++) {
          const t = full[i];
          if (isOp(t, '(')) depth++;
          else if (isOp(t, ')')) { if (depth === 0) break; depth--; } else if (isOp(t, ',') && depth === 0) { args.push(cur); cur = []; continue; }
          cur.push(t);
        }
        if (cur.some(sig) || args.length) args.push(cur);
      }
      if (args.length !== r.params.length) throw err(1318, `Incorrect number of arguments for PROCEDURE ${ctx.name}.${r.name}; expected ${r.params.length}, got ${args.length}`);
      const values = [];
      const outs = [];
      r.params.forEach((pm, i) => {
        const a = args[i].filter(sig);
        if (pm.mode !== 'IN') {
          const t = a[0];
          let target = null;
          if (a.length === 1 && t.t === 'var' && !t.v.startsWith('@@')) target = { kind: 'user', name: lc(t.v.slice(1).replace(/[`'"]/g, '')) };
          else if (a.length === 1 && (t.t === 'id' || t.t === 'qid') && this.lookupLocal(t.t === 'id' ? t.v : t.val)) target = { kind: 'name', name: t.t === 'id' ? t.v : t.val };
          if (!target) throw err(1414, `OUT or INOUT argument ${i + 1} for routine ${ctx.name}.${r.name} is not a variable or NEW pseudo-variable in BEFORE trigger`);
          outs.push([i, target]);
        }
        values.push(pm.mode === 'OUT' ? null : this.evalTokens(args[i], src));
      });
      const res = this.runRoutine(ctx, r, values, false);
      for (const [i, target] of outs) this.assignTarget(target, res.out[i]);
      const affected = res.affected < 0 ? 0 : res.affected;
      if (!res.results.length) return { affected };
      return { multi: res.results, affected };
    },

    // --- CREATE PROCEDURE / FUNCTION / TRIGGER

    createRoutine(p, src, st) {
      const kind = p.cur.u;
      p.i++;
      if (this.frame) throw err(1303, `Can't create a ${kind} from within another stored routine`);
      if (kind === 'EVENT') throw err(1235, 'EVENT (zamanlanmış olay) bu simülatörde desteklenmiyor.');
      const ifNot = p.eat('IF', 'NOT', 'EXISTS');
      if (kind === 'TRIGGER') return this.createTrigger(p, src, st, ifNot);
      const q = p.qname();
      const ctx = this.ctx(q.db || this.db);
      const name = q.name;
      if (!/^[\p{L}\p{N}_$]{1,64}$/u.test(name)) throw err(1458, `Incorrect routine name '${name}'`);
      this.requirePriv(ctx.name, 'CREATE ROUTINE');
      p.expect('(');
      const params = [];
      if (!p.eat(')')) {
        for (;;) {
          let mode = 'IN';
          if (p.is('IN') || p.is('OUT') || p.is('INOUT')) {
            if (kind === 'FUNCTION') throw p.syntax();
            mode = p.cur.u;
            p.i++;
          }
          const pn = p.name();
          if (params.some((x) => lc(x.name) === lc(pn))) throw err(1330, `Duplicate parameter: ${pn}`);
          const a = p.i;
          const type = this.parseType(p);
          params.push({ mode, name: pn, type, typeText: p.textOf(p.toks.slice(a, p.i)) });
          if (p.eat(',')) continue;
          p.expect(')');
          break;
        }
      }
      let returnType = null;
      let returnsText = null;
      if (kind === 'FUNCTION') {
        p.expect('RETURNS');
        const a = p.i;
        returnType = this.parseType(p);
        returnsText = p.textOf(p.toks.slice(a, p.i));
      }
      const ch = { comment: '', deterministic: false, dataAccess: 'CONTAINS SQL', security: 'DEFINER' };
      for (;;) {
        if (p.eat('COMMENT')) { const t = p.cur; if (!t || t.t !== 'str') throw p.syntax(); ch.comment = t.val; p.i++; continue; }
        if (p.eat('LANGUAGE', 'SQL')) continue;
        if (p.eat('NOT', 'DETERMINISTIC')) { ch.deterministic = false; continue; }
        if (p.eat('DETERMINISTIC')) { ch.deterministic = true; continue; }
        if (p.eat('CONTAINS', 'SQL')) { ch.dataAccess = 'CONTAINS SQL'; continue; }
        if (p.eat('NO', 'SQL')) { ch.dataAccess = 'NO SQL'; continue; }
        if (p.eat('READS', 'SQL', 'DATA')) { ch.dataAccess = 'READS SQL DATA'; continue; }
        if (p.eat('MODIFIES', 'SQL', 'DATA')) { ch.dataAccess = 'MODIFIES SQL DATA'; continue; }
        if (p.eat('SQL', 'SECURITY')) { ch.security = p.cur?.u === 'INVOKER' ? 'INVOKER' : 'DEFINER'; p.i++; continue; }
        break;
      }
      const bodyTok = p.cur;
      if (!bodyTok) throw p.syntax();
      // gövdeyi şimdi çözümle (sözdizimi hataları oluşturma anında)
      const bp = this.parseBody(src, bodyTok.s, st.e);
      const ast = bp.parseRoutineBody();
      this.validateRoutine(ast, kind);
      const key = lc(name);
      const store = kind === 'PROCEDURE' ? (ctx.meta.procedures ??= {}) : (ctx.meta.functions ??= {});
      if (store[key]) {
        if (ifNot) return { affected: 0, warnings: 1 };
        throw err(1304, `${kind} ${name} already exists`);
      }
      if (kind === 'FUNCTION' && !ch.deterministic && ch.dataAccess !== 'NO SQL' && ch.dataAccess !== 'READS SQL DATA' && !this.server.logBinTrust) {
        throw err(1418, 'This function has none of DETERMINISTIC, NO SQL, or READS SQL DATA in its declaration and binary logging is enabled (you *might* want to use the less safe log_bin_trust_function_creators variable)');
      }
      const now = fmtNow(this.server.clock());
      store[key] = {
        type: kind, name, params, returnType, returnsText, body: src.slice(bodyTok.s, st.e),
        definer: `${this.user}@${this.host === '127.0.0.1' || this.host === '::1' ? 'localhost' : this.host}`, created: now, modified: now, ...ch,
      };
      if (kind === 'FUNCTION') this.server.registerUserFunction(ctx, store[key]);
      this.saveMetaAndNotify(ctx);
      return { affected: 0, schema: true, db: ctx.name };
    },

    validateRoutine(ast, kind) {
      const walk = (st) => {
        if (!st) return;
        if (st.k === 'return' && kind !== 'FUNCTION') throw err(1313, 'RETURN is only allowed in a FUNCTION');
        if (st.k === 'simple') {
          if (st.word === 'USE') throw err(1314, 'USE is not allowed in stored procedures');
          if (st.word === 'CREATE' && st.toks.filter(sig).some((t) => isW(t, 'PROCEDURE') || isW(t, 'FUNCTION') || isW(t, 'TRIGGER'))) throw err(1303, `Can't create a ${kind} from within another stored routine`);
          if (kind !== 'PROCEDURE' && (st.word === 'SELECT' || st.word === 'SHOW' || st.word === 'DESCRIBE' || st.word === 'DESC') && this.findInto(st.toks.filter(sig)) < 0) {
            throw err(1415, `Not allowed to return a result set from a ${kind === 'FUNCTION' ? 'function' : 'trigger'}`);
          }
          if (kind !== 'PROCEDURE' && /^(COMMIT|ROLLBACK|START|BEGIN)$/.test(st.word)) throw err(1422, 'Explicit or implicit commit is not allowed in stored function or trigger.');
        }
        if (st.k === 'handler') walk(st.body);
        else for (const x of st.body || []) walk(x);
        for (const b of st.branches || []) for (const x of b.body) walk(x);
        for (const b of st.whens || []) for (const x of b.body) walk(x);
        for (const x of st.other || []) walk(x);
      };
      walk(ast);
    },

    createTrigger(p, src, st, ifNot) {
      const q = p.qname();
      let timing;
      if (p.eat('BEFORE')) timing = 'BEFORE'; else { p.expect('AFTER'); timing = 'AFTER'; }
      const event = p.cur?.u;
      if (!['INSERT', 'UPDATE', 'DELETE'].includes(event)) throw p.syntax();
      p.i++;
      p.expect('ON');
      const tq = p.qname();
      p.expect('FOR', 'EACH', 'ROW');
      if (p.eat('FOLLOWS') || p.eat('PRECEDES')) p.name();
      const bodyTok = p.cur;
      if (!bodyTok) throw p.syntax();
      const ctx = this.ctx(tq.db || q.db || this.db);
      if (q.db && tq.db && lc(q.db) !== lc(tq.db)) throw err(1435, 'Trigger in wrong schema');
      const table = lc(tq.name);
      if (!ctx.meta.tables[table]) {
        if (ctx.meta.views[table]) throw err(1347, `'${ctx.name}.${table}' is not BASE TABLE`);
        throw err(1146, `Table '${ctx.name}.${table}' doesn't exist`);
      }
      this.requirePriv(ctx.name, 'TRIGGER', table);
      const triggers = (ctx.meta.triggers ??= {});
      const key = lc(q.name);
      if (triggers[key]) {
        if (ifNot) return { affected: 0, warnings: 1 };
        throw err(1359, 'Trigger already exists');
      }
      const d = this.server.clock();
      const rec = {
        name: q.name, table, timing, event, body: src.slice(bodyTok.s, st.e),
        definer: `${this.user}@${this.host === '127.0.0.1' || this.host === '::1' ? 'localhost' : this.host}`,
        created: fmtNow(d) + '.' + String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0'),
      };
      // derleme hataları oluşturma anında bildirilir
      const ast = this.parseBody(src, bodyTok.s, st.e).parseRoutineBody();
      this.validateRoutine(ast, 'TRIGGER');
      this.compileTrigger(ctx, rec, ast);
      triggers[key] = rec;
      // sıralama için tablonun tüm tetikleyicileri yeniden kurulur
      this.createUserTriggers(ctx, table);
      this.saveMetaAndNotify(ctx);
      return { affected: 0, schema: true, db: ctx.name };
    },

    /** Tablonun kullanıcı tetikleyicilerini SQLite'ta (yeniden) kurar */
    createUserTriggers(ctx, table) {
      const list = [];
      for (const [key, rec] of Object.entries(ctx.meta.triggers || {})) {
        if (rec.table !== table) continue;
        ctx.sql.run(`DROP TRIGGER IF EXISTS ${dq('m_trg!' + key)}`);
        let sql;
        try {
          sql = this.compileTrigger(ctx, rec);
        } catch (e) {
          // geçersizleşen tetikleyici (silinen sütun vb.): MySQL gibi çalışma anında hata verir
          const m = e instanceof MySqlError ? e : err(1105, String(e.message || e));
          sql = `CREATE TRIGGER ${dq('m_trg!' + key)} ${rec.timing} ${rec.event} ON ${dq(table)} FOR EACH ROW WHEN m_trgflag(0) = 0 BEGIN SELECT m_signal(${sq(m.state)}, ${m.code}, ${sq(m.message)}); END`;
        }
        // SET NEW içeren BEFORE tetikleyicileri AFTER'a dönüşür; diğer AFTER tetikleyicilerinden önce çalışmalı
        list.push({ sql, rank: rec.timing === 'BEFORE' && / AFTER /.test(sql.slice(0, sql.indexOf(' ON '))) ? 1 : 0 });
      }
      // SQLite aynı olaydaki tetikleyicileri en son oluşturulandan başlayarak çalıştırır
      list.reverse().sort((a, b) => a.rank - b.rank);
      for (const x of list) ctx.sql.run(x.sql);
    },

    /** MySQL tetikleyicisini SQLite tetikleyicisine çevirir */
    compileTrigger(ctx, rec, ast) {
      ast ??= this.parseBody(rec.body).parseRoutineBody();
      const meta = ctx.meta.tables[rec.table];
      if (!meta) throw err(1146, `Table '${ctx.name}.${rec.table}' doesn't exist`);
      const colNames = new Set(meta.columns.map((c) => lc(c.name)));
      const savedFrame = this.frame;
      this.frame = null;
      const T = { locals: new Set(), setNew: new Set(), table: rec.table, event: rec.event, ifN: 0 };
      const out = [];
      let hasSetNew = false;
      const scanSet = (st) => {
        if (!st) return;
        if (st.k === 'set' && st.items.some((i) => i.target.kind === 'new')) hasSetNew = true;
        if (Array.isArray(st.body)) for (const x of st.body) scanSet(x);
        for (const b of st.branches || []) b.body.forEach(scanSet);
        for (const b of st.whens || []) b.body.forEach(scanSet);
        (st.other || []).forEach(scanSet);
      };
      scanSet(ast);
      if (hasSetNew && rec.timing === 'AFTER') throw err(1362, 'Updating of NEW row is not allowed in after trigger');
      if (hasSetNew && rec.event === 'DELETE') throw err(1363, 'There is no NEW row in on DELETE trigger');
      const and = (...g) => g.filter(Boolean).map((x) => `(${x})`).join(' AND ');
      const where = (g) => (g ? ` WHERE ${g}` : '');
      // NEW/OLD başvurularını denetler ve SET NEW ile değişmiş sütunları satırdan okutur
      const prep = (toks) => {
        const S = toks.filter(sig);
        for (let j = 0; j < S.length; j++) {
          const t = S[j];
          if (!(t.t === 'id' && (t.u === 'NEW' || t.u === 'OLD') && isOp(S[j + 1], '.'))) continue;
          if (t.u === 'NEW' && rec.event === 'DELETE') throw err(1363, 'There is no NEW row in on DELETE trigger');
          if (t.u === 'OLD' && rec.event === 'INSERT') throw err(1363, 'There is no OLD row in on INSERT trigger');
          const c = S[j + 2];
          const cn = c ? lc(c.t === 'qid' ? c.val : c.v) : '';
          if (!colNames.has(cn)) throw err(1054, `Unknown column '${cn}' in '${t.u}'`);
          // AFTER tetikleyicilerinde NEW, BEFORE tetikleyicilerinin (SET NEW) değiştirdiği satırı görmeli
          if (t.u === 'NEW' && (T.setNew.has(cn) || rec.timing === 'AFTER')) {
            t.__out = `(SELECT ${dq(cn)} FROM ${dq(rec.table)} WHERE rowid = NEW.rowid)`;
            S[j + 1].__out = '';
            c.__out = '';
          } else if (c.t === 'qid') c.__out = dq(cn);
          c.__noLocal = true;
        }
        return toks;
      };
      const tr = (toks) => this.translate(prep(toks), rec.body, ctx, { noOrderWrap: true, trigger: T }).text;
      const unsupported = (what) => err(1235, `Simülatör: tetikleyici içinde ${what} desteklenmiyor.`);
      // WHERE koşuluna bekçi (guard) ekler
      const guardWhere = (S, g, startJ = 0) => {
        if (!g) return;
        let depth = 0;
        let wj = -1;
        let endJ = S.length - 1;
        for (let j = startJ; j < S.length; j++) {
          const t = S[j];
          if (isOp(t, '(')) depth++;
          else if (isOp(t, ')')) depth--;
          else if (depth === 0 && isW(t, 'WHERE') && wj < 0) wj = j;
          else if (depth === 0 && (isW(t, 'ORDER') || isW(t, 'LIMIT') || isW(t, 'GROUP'))) { endJ = j - 1; break; }
        }
        if (wj >= 0) {
          S[wj].__out = `WHERE (${g}) AND (`;
          S[endJ].__post = (S[endJ].__post || '') + ')';
        } else S[endJ].__post = (S[endJ].__post || '') + ` WHERE ${g}`;
      };
      const emitList = (list, g) => list.forEach((s) => emit(s, g));
      const emit = (st, g) => {
        switch (st.k) {
          case 'block': emitList(st.body, g); return;
          case 'var': {
            const v = st.def ? tr(st.def) : 'NULL';
            for (const n of st.names) { T.locals.add(lc(n)); out.push(`SELECT m_setvar(${sq('#' + lc(n))}, ${v})`); }
            return;
          }
          case 'if':
          case 'case': {
            const v = `#if${++T.ifN}`;
            const arms = st.k === 'if' ? st.branches : st.whens;
            const head = st.k === 'case' && st.value ? `CASE ${tr(st.value)} ` : 'CASE ';
            const sel = head + arms.map((b, i) => `WHEN ${tr(b.cond)} THEN ${i + 1}`).join(' ') + ' ELSE 0 END';
            out.push(`SELECT m_setvar(${sq(v)}, ${sel})` + where(g));
            arms.forEach((b, i) => emitList(b.body, and(g, `m_getvar(${sq(v)}) = ${i + 1}`)));
            if (st.other) emitList(st.other, and(g, `m_getvar(${sq(v)}) = 0`));
            else if (st.k === 'case') out.push(`SELECT m_signal('20000', 1339, 'Case not found for CASE statement')` + where(and(g, `m_getvar(${sq(v)}) = 0`)));
            return;
          }
          case 'set': {
            for (const it of st.items) {
              const tg = it.target;
              const expr = tr(it.value);
              if (tg.kind === 'new') {
                const cn = lc(tg.name);
                if (!colNames.has(cn)) throw err(1054, `Unknown column '${tg.name}' in 'NEW'`);
                if (rec.timing === 'AFTER') throw err(1362, 'Updating of NEW row is not allowed in after trigger');
                out.push('SELECT m_trgflag(1)');
                out.push(`UPDATE ${dq(rec.table)} SET ${dq(cn)} = (${expr}) WHERE rowid = NEW.rowid` + (g ? ` AND ${g}` : ''));
                out.push('SELECT m_trgflag(-1)');
                T.setNew.add(cn);
              } else if (tg.kind === 'old') throw err(1362, 'Updating of OLD row is not allowed in trigger');
              else if (tg.kind === 'user') out.push(`SELECT m_setvar(${sq(tg.name)}, ${expr})` + where(g));
              else if (tg.kind === 'name' && T.locals.has(lc(tg.name))) out.push(`SELECT m_setvar(${sq('#' + lc(tg.name))}, ${expr})` + where(g));
              else if (tg.kind === 'name') throw err(1193, `Unknown system variable '${tg.name}'`);
              else throw unsupported('sistem değişkeni atama');
            }
            return;
          }
          case 'signal': {
            if (st.cond) throw unsupported('adlandırılmış koşul');
            const state = st.state;
            if (!/^[0-9A-Z]{5}$/.test(state || '') || state.startsWith('00')) throw err(1407, `Bad SQLSTATE: '${state}'`);
            const cls = state.slice(0, 2);
            const code = st.sets.MYSQL_ERRNO ? tr(st.sets.MYSQL_ERRNO) : String(cls === '01' ? 1642 : cls === '02' ? 1643 : 1644);
            const msg = st.sets.MESSAGE_TEXT ? tr(st.sets.MESSAGE_TEXT) : sq(cls === '01' ? 'Unhandled user-defined warning condition' : cls === '02' ? 'Unhandled user-defined not found condition' : 'Unhandled user-defined exception condition');
            if (cls === '01') return; // uyarı: işlem sürer
            out.push(`SELECT m_signal(${sq(state)}, ${code}, ${msg})` + where(g));
            return;
          }
          case 'simple': {
            this.markNoLocal(st.toks);
            const S = st.toks.filter(sig);
            const w = st.word;
            if (w === 'INSERT' || w === 'REPLACE' || w === 'UPDATE' || w === 'DELETE') {
              // hedef tablo
              let j = 1;
              while (S[j] && S[j].t === 'id' && /^(LOW_PRIORITY|DELAYED|HIGH_PRIORITY|IGNORE|QUICK|INTO|FROM)$/.test(S[j].u)) j++;
              const tt = S[j];
              const tname = tt ? lc(tt.t === 'qid' ? tt.val : tt.v) : '';
              if (tname === rec.table) {
                out.push(`SELECT m_signal('HY000', 1442, ${sq(`Can't update table '${rec.table}' in stored function/trigger because it is already used by statement which invoked this stored function/trigger.`)})` + where(g));
                return;
              }
              if (w === 'INSERT' || w === 'REPLACE') {
                const vj = S.findIndex((t, k) => k > j && (isW(t, 'VALUES') || isW(t, 'VALUE')));
                const setj = S.findIndex((t, k) => k > j && isW(t, 'SET'));
                if (setj >= 0 && (vj < 0 || setj < vj) && !S.slice(j + 1, setj).some((t) => isOp(t, '('))) {
                  // INSERT INTO t SET a = 1, b = 2 → INSERT INTO t (a, b) SELECT 1, 2
                  const cols = [];
                  const vals = [];
                  let k = setj + 1;
                  while (k < S.length) {
                    const cn = S[k];
                    cols.push(dq(cn.t === 'qid' ? cn.val : cn.v));
                    k += 2;
                    const a = k;
                    let depth = 0;
                    while (k < S.length && !(isOp(S[k], ',') && depth === 0)) { if (isOp(S[k], '(')) depth++; else if (isOp(S[k], ')')) depth--; k++; }
                    vals.push(tr(st.toks.slice(st.toks.indexOf(S[a]), st.toks.indexOf(S[k - 1]) + 1)));
                    k++;
                  }
                  const head = tr(st.toks.slice(0, st.toks.indexOf(S[setj])));
                  out.push(`${head} (${cols.join(', ')}) SELECT ${vals.join(', ')}` + where(g));
                  return;
                }
                if (vj >= 0 && g) {
                  S[vj].__out = 'SELECT';
                  let depth = 0;
                  for (let k = vj + 1; k < S.length; k++) {
                    const t = S[k];
                    if (isOp(t, '(')) { if (depth === 0) t.__out = ''; depth++; } else if (isOp(t, ')')) { depth--; if (depth === 0) t.__out = ` WHERE ${g}`; } else if (depth === 0 && isOp(t, ',')) t.__out = ' UNION ALL SELECT';
                    else if (depth === 0) break;
                  }
                } else if (vj < 0) guardWhere(S, g, j + 1);
              } else guardWhere(S, g);
              out.push(tr(st.toks));
              return;
            }
            if (w === 'SELECT') {
              const ix = this.findInto(S);
              if (ix < 0) throw err(1415, 'Not allowed to return a result set from a trigger');
              // hedefler
              let m = ix + 1;
              const keys = [];
              for (;;) {
                const t = S[m];
                if (!t) throw this.parseBody(rec.body).syntax(null);
                if (t.t === 'var' && !t.v.startsWith('@@')) keys.push(lc(t.v.slice(1).replace(/[`'"]/g, '')));
                else {
                  const n = lc(t.t === 'qid' ? t.val : t.v);
                  if (!T.locals.has(n)) throw err(1327, `Undeclared variable: ${n}`);
                  keys.push('#' + n);
                }
                t.__out = '';
                m++;
                if (isOp(S[m], ',')) { S[m].__out = ''; m++; continue; }
                break;
              }
              S[ix].__out = '';
              // seçim listesi öğeleri
              const items = [];
              let a = 1;
              let depth = 0;
              for (let k = 1; k <= ix; k++) {
                const t = S[k];
                if (k === ix || (isOp(t, ',') && depth === 0)) { items.push([a, k - 1]); a = k + 1; continue; }
                if (isOp(t, '(')) depth++;
                else if (isOp(t, ')')) depth--;
              }
              if (items.length !== keys.length) throw err(1222, 'The used SELECT statements have a different number of columns');
              items.forEach(([x, y], i) => {
                if (y - 1 > x && isW(S[y - 1], 'AS')) { S[y - 1].__out = ''; S[y].__out = ''; y -= 2; } else if (y > x && (S[y].t === 'id' || S[y].t === 'qid') && !isOp(S[y - 1], '.') && (S[y - 1].t === 'id' || S[y - 1].t === 'qid' || isOp(S[y - 1], ')'))) { S[y].__out = ''; y -= 1; }
                S[x].__pre = `m_setvar(${sq(keys[i])}, `;
                S[y].__post = (S[y].__post || '') + ')';
              });
              guardWhere(S, g, ix);
              const last = S[S.length - 1];
              if (!S.some((t) => isW(t, 'LIMIT'))) last.__post = (last.__post || '') + ' LIMIT 1';
              out.push(tr(st.toks));
              return;
            }
            if (w === 'CALL') throw unsupported('CALL');
            throw unsupported(w);
          }
          default: throw unsupported(st.k.toUpperCase());
        }
      };
      try {
        emit(ast, '');
      } finally {
        this.frame = savedFrame;
      }
      if (!out.length) out.push('SELECT 1');
      const timing = hasSetNew ? 'AFTER' : rec.timing;
      return `CREATE TRIGGER ${dq('m_trg!' + lc(rec.name))} ${timing} ${rec.event} ON ${dq(rec.table)} FOR EACH ROW WHEN m_trgflag(0) = 0 BEGIN\n  ${out.join(';\n  ')};\nEND`;
    },

    // --- DROP / SHOW

    dropRoutine(p) {
      const kind = p.cur.u;
      p.i++;
      const ifEx = p.eat('IF', 'EXISTS');
      const q = p.qname();
      p.end();
      const ctx = this.ctx(q.db || this.db);
      const key = lc(q.name);
      if (kind === 'TRIGGER') {
        // TRIGGER: veritabanı belirtilmezse geçerli veritabanı
        const tg = ctx.meta.triggers?.[key];
        if (!tg) { if (ifEx) return { affected: 0, warnings: 1 }; throw err(1360, 'Trigger does not exist'); }
        this.requirePriv(ctx.name, 'TRIGGER', tg.table);
        ctx.sql.run(`DROP TRIGGER IF EXISTS ${dq('m_trg!' + key)}`);
        delete ctx.meta.triggers[key];
        this.saveMetaAndNotify(ctx);
        return { affected: 0, schema: true, db: ctx.name };
      }
      const store = kind === 'PROCEDURE' ? ctx.meta.procedures : ctx.meta.functions;
      if (!store?.[key]) { if (ifEx) return { affected: 0, warnings: 1 }; throw err(1305, `${kind} ${ctx.name}.${key} does not exist`); }
      this.requirePriv(ctx.name, 'ALTER ROUTINE');
      delete store[key];
      this.saveMetaAndNotify(ctx);
      return { affected: 0, schema: true, db: ctx.name };
    },

    routineCreateSql(r) {
      const [u, h] = r.definer.split('@');
      const params = r.params.map((p) => (r.type === 'PROCEDURE' ? `${p.mode} ` : '') + `${p.name} ${p.typeText}`).join(', ');
      let s = `CREATE DEFINER=\`${u}\`@\`${h}\` ${r.type} \`${r.name}\`(${params})`;
      if (r.type === 'FUNCTION') s += ` RETURNS ${r.returnsText}`;
      const ch = [];
      if (r.deterministic) ch.push('DETERMINISTIC');
      if (r.dataAccess !== 'CONTAINS SQL') ch.push(r.dataAccess);
      if (r.security === 'INVOKER') ch.push('SQL SECURITY INVOKER');
      if (r.comment) ch.push(`COMMENT ${sq(r.comment)}`);
      return s + '\n' + ch.map((x) => '    ' + x + '\n').join('') + r.body;
    },

    triggerCreateSql(t) {
      const [u, h] = t.definer.split('@');
      return `CREATE DEFINER=\`${u}\`@\`${h}\` TRIGGER \`${t.name}\` ${t.timing} ${t.event} ON \`${t.table}\` FOR EACH ROW ${t.body}`;
    },

    showRoutines(p, like) {
      // SHOW PROCEDURE STATUS / SHOW FUNCTION STATUS / SHOW CREATE ... / SHOW TRIGGERS
      if (p.is('PROCEDURE', 'STATUS') || p.is('FUNCTION', 'STATUS')) {
        const kind = p.cur.u;
        p.i += 2;
        let f = () => true;
        if (p.eat('WHERE')) {
          const col = lc(p.name(true));
          p.expect('=');
          const v = p.cur?.val;
          p.i++;
          f = (row) => (col === 'db' ? lc(row[0]) === lc(v) : col === 'name' ? lc(row[1]) === lc(v) : true);
        } else {
          const lk = like();
          f = (row) => lk(row[1]);
        }
        const rows = [];
        for (const name of this.server.databaseNames()) {
          if (!this.server.canSeeDb(this.account, name)) continue;
          const ctx = this.server.getDb(name);
          const store = kind === 'PROCEDURE' ? ctx.meta.procedures : ctx.meta.functions;
          for (const r of Object.values(store || {})) rows.push([ctx.name, r.name, kind, r.definer, r.modified, r.created, r.security, r.comment, 'utf8mb4', 'utf8mb4_0900_ai_ci', ctx.meta.collation]);
        }
        return this.rowsResult(['Db', 'Name', 'Type', 'Definer', 'Modified', 'Created', 'Security_type', 'Comment', 'character_set_client', 'collation_connection', 'Database Collation'], rows.filter(f));
      }
      if (p.is('CREATE', 'PROCEDURE') || p.is('CREATE', 'FUNCTION')) {
        const kind = p.peek(1).u;
        p.i += 2;
        const q = p.qname();
        p.end();
        const ctx = this.ctx(q.db || this.db);
        const r = (kind === 'PROCEDURE' ? ctx.meta.procedures : ctx.meta.functions)?.[lc(q.name)];
        if (!r) throw err(1305, `${kind} ${lc(q.name)} does not exist`);
        const cap = kind === 'PROCEDURE' ? 'Procedure' : 'Function';
        return this.rowsResult([cap, 'sql_mode', `Create ${cap}`, 'character_set_client', 'collation_connection', 'Database Collation'], [[r.name, 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', this.routineCreateSql(r), 'utf8mb4', 'utf8mb4_0900_ai_ci', ctx.meta.collation]]);
      }
      if (p.is('CREATE', 'TRIGGER')) {
        p.i += 2;
        const q = p.qname();
        p.end();
        const ctx = this.ctx(q.db || this.db);
        const t = ctx.meta.triggers?.[lc(q.name)];
        if (!t) throw err(1360, 'Trigger does not exist');
        return this.rowsResult(['Trigger', 'sql_mode', 'SQL Original Statement', 'character_set_client', 'collation_connection', 'Database Collation', 'Created'], [[t.name, 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', this.triggerCreateSql(t), 'utf8mb4', 'utf8mb4_0900_ai_ci', ctx.meta.collation, t.created]]);
      }
      if (p.eat('TRIGGERS')) {
        let dbName = this.db;
        if (p.eat('FROM') || p.eat('IN')) dbName = p.name(true);
        const lk = like();
        const ctx = this.ctx(dbName);
        const rows = Object.values(ctx.meta.triggers || {}).filter((t) => lk(t.table)).map((t) => [t.name, t.event, t.table, t.body, t.timing, t.created, 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', t.definer, 'utf8mb4', 'utf8mb4_0900_ai_ci', ctx.meta.collation]);
        return this.rowsResult(['Trigger', 'Event', 'Table', 'Statement', 'Timing', 'Created', 'sql_mode', 'Definer', 'character_set_client', 'collation_connection', 'Database Collation'], rows);
      }
      return null;
    },
  });

  // ------------------------------------------------------------ sunucu tarafı

  Object.assign(MySqlServer.prototype, {
    /** Tetikleyici çevirisinin kullandığı yardımcı işlevler */
    registerRoutineHelpers(db) {
      const reg = (name, n, fn) => { const w = (...a) => fn(...a); Object.defineProperty(w, 'length', { value: n }); db.create_function(name, w); };
      reg('m_getvar', 1, (k) => this.active?.vars.get(String(k)) ?? null);
      reg('m_setvar', 2, (k, v) => { this.active?.vars.set(String(k), v ?? null); return v ?? null; });
      reg('m_signal', 3, (state, code, msg) => { throw new Error(`m!err!${code}!${state}!${msg ?? ''}`); });
      reg('m_trgflag', 1, (d) => { this.trgFlag = (this.trgFlag || 0) + Number(d || 0); return this.trgFlag; });
    },

    registerUserFunction(ctx, r) {
      const n = r.params.length;
      const name = r.name;
      const w = (...a) => {
        const s = this.active;
        if (!s) throw new Error('m!err!1105!HY000!Oturum yok');
        try {
          return sqliteVal(s.callFunction(ctx, name, a));
        } catch (e) {
          if (e instanceof MySqlError) throw new Error(`m!err!${e.code}!${e.state}!${e.message}`);
          throw e;
        }
      };
      Object.defineProperty(w, 'length', { value: n });
      ctx.sql.create_function(lc(name), w);
    },

    registerUserFunctions(ctx) {
      for (const r of Object.values(ctx.meta.functions || {})) this.registerUserFunction(ctx, r);
    },
  });
}

