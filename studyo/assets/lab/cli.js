// "MySQL Command Line Client" konsol penceresi.
import { h } from '../js/ui.js';
import { ICONS } from './icons.js';
import { displayValue } from './mysql/engine.js';
import { splitStatements } from './mysql/lexer.js';

function width(s) { return [...String(s)].length; }

/** Sonuç kümesini mysql istemcisi gibi çerçeveli tablo olarak yazar */
export function asciiTable(columns, rows) {
  const vals = rows.map((r) => r.map((v, i) => (v == null ? 'NULL' : displayValue(v, columns[i]))));
  const w = columns.map((c, i) => Math.max(width(c.name), ...vals.map((r) => width(r[i]))));
  const line = '+' + w.map((n) => '-'.repeat(n + 2)).join('+') + '+';
  const num = columns.map((c, i) => rows.length && rows.every((r) => r[i] == null || typeof r[i] === 'number'));
  const cell = (s, i) => (num[i] ? ' ' + ' '.repeat(w[i] - width(s)) + s + ' ' : ' ' + s + ' '.repeat(w[i] - width(s)) + ' ');
  const out = [line, '|' + columns.map((c, i) => ' ' + c.name + ' '.repeat(w[i] - width(c.name)) + ' ').join('|') + '|', line];
  for (const r of vals) out.push('|' + r.map(cell).join('|') + '|');
  out.push(line);
  return out.join('\n');
}

export function openMysqlCli(lab) {
  const { desk, server, store } = lab;
  const ver = server.version.slice(0, 3);
  const out = h('pre', { class: 'cli-out' });
  const prompt = h('span', { class: 'cli-prompt' }, 'Enter password: ');
  const input = h('input', { class: 'cli-in', type: 'password', spellcheck: 'false', autocomplete: 'off' });
  const line = h('div', { class: 'cli-line' }, prompt, input);
  const box = h('div', { class: 'cli' }, out, line);
  const w = desk.open({ title: `MySQL ${ver} Command Line Client`, icon: ICONS.mysql, width: 760, height: 460, className: 'cli-win' });
  w.body.appendChild(box);
  box.addEventListener('mousedown', (e) => { if (e.target !== input) setTimeout(() => input.focus(), 0); });
  setTimeout(() => input.focus(), 0);
  let session = null;
  let buffer = '';
  let delim = ';';
  const history = [];
  let hi = 0;
  const print = (t) => { out.textContent += t + '\n'; box.scrollTop = box.scrollHeight; };
  const secs = (ms) => `(${(ms / 1000).toFixed(2)} sec)`;
  const finish = (closing) => {
    if (closing) { line.remove(); setTimeout(() => w.close(), 1200); }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && session) { e.preventDefault(); if (hi > 0) input.value = history[--hi] || ''; return; }
    if (e.key === 'ArrowDown' && session) { e.preventDefault(); if (hi < history.length) input.value = history[++hi] || ''; return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = input.value;
    input.value = '';
    if (!session) {
      print('Enter password: ' + '*'.repeat(v.length));
      try {
        if (!server.running) throw Object.assign(new Error("Can't connect to MySQL server on 'localhost:3306' (10061)"), { code: 2003, state: 'HY000' });
        session = server.connect('root', v, 'localhost');
      } catch (err) {
        print(`ERROR ${err.code} (${err.state || 'HY000'}): ${err.message}`);
        lab.events.emit('cli-login', { ok: false });
        finish(true);
        return;
      }
      input.type = 'text';
      prompt.textContent = 'mysql> ';
      print(`Welcome to the MySQL monitor.  Commands end with ; or \\g.\nYour MySQL connection id is ${session.id}\nServer version: ${server.version} MySQL Community Server - GPL\n\nType 'help;' or '\\h' for help. Type '\\c' to clear the current input statement.\n`);
      lab.events.emit('cli-login', { ok: true });
      return;
    }
    print((buffer ? '    -> ' : 'mysql> ') + v);
    if (v.trim()) { history.push(v); hi = history.length; }
    const t = v.trim();
    if (!buffer && /^(exit|quit|\\q)\s*;?$/i.test(t)) { print('Bye'); session.close(); finish(true); return; }
    if (/\\c\s*$/.test(t)) { buffer = ''; prompt.textContent = 'mysql> '; return; }
    if (!buffer && /^(help|\\h|\?)\s*;?$/i.test(t)) { print("\nList of all MySQL commands:\nexit      (\\q) Exit mysql. Same as quit.\nuse       (\\u) Use another database. Takes database name as argument.\nclear     (\\c) Clear the current input statement.\n"); return; }
    if (!buffer && /^use\s+\S+\s*;?$/i.test(t)) {
      const r = session.execute(t.replace(/;?$/, ''))[0];
      print(r.ok ? 'Database changed' : `ERROR ${r.error.code} (${r.error.state}): ${r.error.message}`);
      return;
    }
    const dm = !buffer && /^delimiter\s+(\S+)\s*$/i.exec(t);
    if (dm) { delim = dm[1]; return; }
    buffer += (buffer ? '\n' : '') + v;
    const head = delim === ';' ? '' : `DELIMITER ${delim}\n`;
    const gEnd = /\\[gG]\s*$/.test(buffer);
    const ends = gEnd || (delim === ';' ? /;\s*$/.test(buffer) && !splitStatements(buffer).pending : buffer.trimEnd().endsWith(delim));
    if (!ends) { prompt.textContent = '    -> '; return; }
    const vertical = /\\G\s*$/.test(buffer);
    const text = head + buffer.replace(/\\[gG]\s*$/, delim);
    buffer = '';
    prompt.textContent = 'mysql> ';
    for (const st of splitStatements(text)) {
     for (const r of session.execute(st.sql)) {
      lab.events.emit('query', { sql: r.sql, result: r, session, cli: true });
      if (!r.ok) { print(`ERROR ${r.error.code} (${r.error.state}): ${r.error.message}`); continue; }
      if (r.rows) {
        if (!r.rows.length) print(`Empty set ${secs(r.ms)}\n`);
        else if (vertical) {
          const w = Math.max(...r.columns.map((c) => c.name.length));
          print(r.rows.map((row, i) => `${'*'.repeat(27)} ${i + 1}. row ${'*'.repeat(27)}\n` + r.columns.map((c, k) => `${c.name.padStart(w)}: ${row[k] == null ? 'NULL' : displayValue(row[k], c)}`).join('\n')).join('\n') + `\n${r.rows.length} row${r.rows.length > 1 ? 's' : ''} in set ${secs(r.ms)}\n`);
        } else print(asciiTable(r.columns, r.rows) + `\n${r.rows.length} row${r.rows.length > 1 ? 's' : ''} in set ${secs(r.ms)}\n`);
      } else if (r.useDb) print('Database changed');
      else print(`Query OK, ${r.affected} row${r.affected === 1 ? '' : 's'} affected ${secs(r.ms)}` + (r.info ? '\n' + r.info.replace('Rows matched', 'Rows matched') : '') + '\n');
     }
    }
  });
  void store;
  return w;
}
