// Workbench: saklı yordam / fonksiyon / tetikleyici düzenleyicisi (Routine / Trigger editor)
import { h } from '../../js/ui.js';
import { ICONS } from '../icons.js';
import { createSqlEditor } from './sqleditor.js';

const bq = (s) => '`' + String(s).replace(/`/g, '``') + '`';

/** kind: 'procedure' | 'function' | 'trigger' ; name: var olan nesne (yoksa yeni) */
export class RoutineEditor {
  constructor(conn, db, kind, name, opts = {}) {
    this.conn = conn;
    this.db = db;
    this.kind = kind;
    this.origName = name || null;
    this.table = opts.table || null;
    this.icon = ICONS.db;
    this.name = name || (kind === 'trigger' ? `${this.table}_${opts.timing || 'BEFORE'}_${opts.event || 'INSERT'}` : `new_${kind}`);
    this.el = h('div', { class: 'wb-tabled wb-routine' });
    this.text = this.initialText(opts);
    this.render();
  }

  get title() { return `${this.name} - ${this.kind === 'trigger' ? 'Trigger' : 'Routine'}`; }
  focus() { this.editor?.focus(); }

  initialText(opts) {
    const s = this.conn.session;
    const ctx = this.conn.lab.server.getDb(this.db);
    if (this.origName && ctx) {
      if (this.kind === 'trigger') {
        const t = ctx.meta.triggers?.[this.origName.toLowerCase()];
        if (t) { this.table = t.table; return s.triggerCreateSql(t); }
      } else {
        const r = (this.kind === 'procedure' ? ctx.meta.procedures : ctx.meta.functions)?.[this.origName.toLowerCase()];
        if (r) return s.routineCreateSql(r);
      }
    }
    if (this.kind === 'procedure') return `CREATE PROCEDURE ${bq(this.name)} ()\nBEGIN\n\nEND`;
    if (this.kind === 'function') return `CREATE FUNCTION ${bq(this.name)} ()\nRETURNS INTEGER\nDETERMINISTIC\nBEGIN\n\nRETURN 1;\nEND`;
    return `CREATE DEFINER = CURRENT_USER TRIGGER ${bq(this.db)}.${bq(this.name)} ${opts.timing || 'BEFORE'} ${opts.event || 'INSERT'} ON ${bq(this.table)} FOR EACH ROW\nBEGIN\n\nEND`;
  }

  /** DDL metnindeki adı izler (Workbench'te ad alanı DDL'den okunur) */
  syncName(text) {
    const m = /\b(?:PROCEDURE|FUNCTION|TRIGGER)\s+(?:`?[\w$]+`?\s*\.\s*)?`?([\p{L}\p{N}_$]+)`?/iu.exec(text);
    if (m && m[1] !== this.name) { this.name = m[1]; this.nameIn.value = m[1]; this.conn.renderTabs(); }
  }

  render() {
    this.el.innerHTML = '';
    this.nameIn = h('input', { class: 'lab-input', value: this.name, disabled: true });
    const label = this.kind === 'trigger' ? 'Trigger' : this.kind === 'function' ? 'Function' : 'Procedure';
    const head = h('div', { class: 'wb-te-head' }, h('div', { class: 'wb-te-ico', html: ICONS.db }),
      h('div', { class: 'wb-te-form' }, h('label', {}, 'Name:'), this.nameIn, h('label', {}, 'Schema:'), h('span', {}, this.db),
        h('div', { class: 'wb-te-note' }, this.kind === 'trigger'
          ? `Tablo: ${this.table}. Gövdede NEW.sütun (INSERT/UPDATE) ve OLD.sütun (UPDATE/DELETE) kullanılabilir. BEFORE tetikleyicisinde SET NEW.sütun = ... ile değer değiştirilebilir.`
          : `${label} DDL. Apply, Workbench gibi DELIMITER $$ kullanan bir betik üretir.`)));
    const host = h('div', { class: 'wb-routine-ed' });
    const foot = h('div', { class: 'wb-te-foot' }, h('div', { class: 'spacer' }),
      h('button', { class: 'lab-btn primary', onclick: () => this.apply() }, 'Apply'),
      h('button', { class: 'lab-btn', onclick: () => { this.editor?.setValue(this.text); } }, 'Revert'));
    this.el.append(head, h('div', { class: 'wb-te-cols-head' }, 'DDL:'), host, foot);
    createSqlEditor(host, this.text, { onChange: (v) => this.syncName(v) }).then((ed) => { this.editor = ed; });
  }

  script() {
    const ddl = (this.editor ? this.editor.getValue() : this.text).trim().replace(/\$\$\s*$/, '').replace(/;\s*$/, '');
    const what = this.kind === 'trigger' ? 'trigger' : this.kind;
    const lines = [`USE ${bq(this.db)};`];
    if (this.origName) lines.push(`DROP ${what} IF EXISTS ${this.kind === 'trigger' ? bq(this.db) + '.' : ''}${bq(this.origName)};`);
    else if (this.kind !== 'trigger') lines.push(`DROP ${what} IF EXISTS ${bq(this.name)};`);
    lines.push('', 'DELIMITER $$', `USE ${bq(this.db)}$$`, ddl + '$$', '', 'DELIMITER ;', '');
    return lines.join('\n');
  }

  async apply() {
    const res = await this.conn.applyScript(this.script(), { description: 'Please review the SQL script to be applied on the database.' });
    if (res?.ok) {
      this.origName = this.name;
      this.text = this.editor ? this.editor.getValue() : this.text;
      this.conn.refreshTree();
    }
  }
}
