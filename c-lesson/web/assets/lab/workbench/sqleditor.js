// SQL düzenleyici: Monaco varsa onu, yoksa düz metin kutusunu kullanır.
import { h } from '../../js/ui.js';

let monacoPromise = null;

export function loadMonaco() {
  if (monacoPromise) return monacoPromise;
  monacoPromise = new Promise((resolve) => {
    if (!window.require || !window.require.config) { resolve(null); return; }
    try {
      window.require.config({ paths: { vs: 'lib/monaco/vs' } });
      window.require(['vs/editor/editor.main'], () => resolve(window.monaco), () => resolve(null));
    } catch {
      resolve(null);
    }
  });
  return monacoPromise;
}

/** Düzenleyici oluşturur. Döner: { el, getValue, setValue, getSelectionText, getCursorOffset, focus, layout, dispose, onChange, setMarker } */
export async function createSqlEditor(container, text, { onChange, onRun } = {}) {
  const monaco = await loadMonaco();
  if (monaco) {
    const ed = monaco.editor.create(container, {
      value: text, language: 'mysql', automaticLayout: true, minimap: { enabled: false }, fontSize: 13,
      fontFamily: 'Consolas, "Cascadia Code", "Courier New", monospace', scrollBeyondLastLine: false, renderLineHighlight: 'line',
      lineNumbersMinChars: 3, wordWrap: 'off', tabSize: 4, glyphMargin: true, folding: false,
    });
    ed.onDidChangeModelContent(() => onChange?.(ed.getValue()));
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun?.('current'));
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => onRun?.('all'));
    let deco = [];
    return {
      getValue: () => ed.getValue(),
      setValue: (v) => ed.setValue(v),
      getSelectionText: () => ed.getModel().getValueInRange(ed.getSelection()),
      getCursorOffset: () => ed.getModel().getOffsetAt(ed.getPosition()),
      insert: (t) => { ed.executeEdits('wb', [{ range: ed.getSelection(), text: t, forceMoveMarkers: true }]); ed.focus(); },
      focus: () => ed.focus(),
      layout: () => ed.layout(),
      dispose: () => ed.dispose(),
      /** Hatalı satırı işaretler (offset) */
      mark: (offset, ok) => {
        if (offset == null) { deco = ed.deltaDecorations(deco, []); return; }
        const p = ed.getModel().getPositionAt(offset);
        deco = ed.deltaDecorations(deco, [{ range: new monaco.Range(p.lineNumber, 1, p.lineNumber, 1), options: { isWholeLine: false, glyphMarginClassName: ok ? 'wb-glyph-ok' : 'wb-glyph-err' } }]);
      },
    };
  }
  const ta = h('textarea', { class: 'wb-sql-fallback', spellcheck: 'false', wrap: 'off' });
  ta.value = text;
  container.appendChild(ta);
  ta.addEventListener('input', () => onChange?.(ta.value));
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun?.(e.shiftKey ? 'all' : 'current'); }
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); }
  });
  return {
    getValue: () => ta.value,
    setValue: (v) => { ta.value = v; },
    getSelectionText: () => ta.value.slice(ta.selectionStart, ta.selectionEnd),
    getCursorOffset: () => ta.selectionStart,
    insert: (t) => { ta.focus(); document.execCommand('insertText', false, t); },
    focus: () => ta.focus(),
    layout: () => {},
    dispose: () => ta.remove(),
    mark: () => {},
  };
}
