// "Apply SQL Script to Database" sihirbazı (Workbench'in değişiklikleri uygulamadan önce gösterdiği pencere).
import { h } from '../../js/ui.js';
import { ICONS } from '../icons.js';

/**
 * sql: uygulanacak betik. run(sql) → sonuç dizisi (Session.execute).
 * Döner: Promise<{ ok, results } | null (iptal)>
 */
export function applyScriptWizard(desk, owner, { title = 'Apply SQL Script to Database', sql, run, description }) {
  return new Promise((resolve) => {
    let finished = null;
    const w = desk.open({ title, width: 720, height: 500, modal: true, owner, minimizable: false, onClose: () => { resolve(finished); return true; } });
    const steps = h('div', { class: 'wb-wiz-steps' });
    const page = h('div', { class: 'wb-wiz-page' });
    const back = h('button', { class: 'lab-btn' }, 'Back');
    const next = h('button', { class: 'lab-btn primary' }, 'Apply');
    const cancel = h('button', { class: 'lab-btn' }, 'Cancel');
    w.body.appendChild(h('div', { class: 'wb-wiz' }, h('div', { class: 'wb-wiz-main' }, steps, page), h('div', { class: 'wb-wiz-foot' }, h('div', { class: 'spacer' }), back, next, cancel)));
    const setSteps = (i) => {
      steps.innerHTML = '';
      ['Review SQL Script', 'Apply SQL Script'].forEach((s, k) => steps.appendChild(h('div', { class: 'wb-wiz-step' + (k === i ? ' cur' : k < i ? ' done' : '') }, (k < i ? '✔ ' : '') + s)));
    };
    const ta = h('textarea', { class: 'wb-wiz-sql', spellcheck: 'false' });
    ta.value = sql;
    const reviewPage = () => {
      setSteps(0);
      page.innerHTML = '';
      page.append(h('div', { class: 'wb-wiz-title' }, 'Review the SQL Script to be Applied on the Database'),
        h('div', { class: 'wb-wiz-desc' }, description || 'Please review the following SQL script that will be applied to the database. Note that once applied, these statements may not be revertible without losing some of the data.'),
        h('div', { class: 'wb-wiz-label' }, 'Online DDL'), ta);
      back.disabled = true;
      next.disabled = false;
      next.textContent = 'Apply';
      cancel.disabled = false;
      next.onclick = applyPage;
      setTimeout(() => ta.focus(), 0);
    };
    const applyPage = () => {
      setSteps(1);
      page.innerHTML = '';
      const results = run(ta.value);
      const failed = results.find((r) => !r.ok);
      const task = (ok, text) => h('div', { class: 'wb-wiz-task' }, h('span', { class: 'wb-wiz-ico', html: ok ? ICONS.ok : ICONS.fail }), text);
      const log = h('pre', { class: 'wb-wiz-log' });
      if (failed) {
        log.textContent = `ERROR ${failed.error.code}: ${failed.error.message}\nSQL Statement:\n${failed.sql}\n`;
        page.append(h('div', { class: 'wb-wiz-title' }, 'Applying SQL script to the database'), h('div', { class: 'wb-wiz-desc' }, 'The following tasks will now be executed. Please monitor the execution.\nPress Show Logs to see the execution logs.'),
          task(false, 'Execute SQL Statements'), h('div', { class: 'wb-wiz-err' }, 'There was an error while applying the SQL script to the database.'), log);
        finished = { ok: false, results };
      } else {
        log.textContent = results.map((r) => r.sql + ';').join('\n') + '\n\nSQL script was successfully applied to the database.';
        page.append(h('div', { class: 'wb-wiz-title' }, 'Applying SQL script to the database'), h('div', { class: 'wb-wiz-desc' }, 'The following tasks will now be executed. Please monitor the execution.\nPress Show Logs to see the execution logs.'),
          task(true, 'Execute SQL Statements'), h('div', { class: 'wb-wiz-ok' }, 'SQL script was successfully applied to the database.'), log);
        finished = { ok: true, results };
      }
      back.disabled = false;
      back.onclick = () => { finished = null; reviewPage(); };
      next.textContent = 'Finish';
      cancel.disabled = true;
      next.onclick = () => w.close();
    };
    cancel.onclick = () => { finished = null; w.close(); };
    reviewPage();
    w.center();
  });
}
