// Monaco kod editörü: C# renklendirme, hata işaretleri, otomatik tamamlama.

let monacoPromise = null;
let activeOwner = null;

export function loadMonaco() {
  if (monacoPromise) return monacoPromise;
  monacoPromise = new Promise((resolve, reject) => {
    const req = window.require;
    if (!req) {
      reject(new Error('Monaco yükleyicisi bulunamadı.'));
      return;
    }
    req.config({ paths: { vs: 'lib/monaco/vs' } });
    req(['vs/editor/editor.main'], () => {
      const monaco = window.monaco;
      registerProviders(monaco);
      resolve(monaco);
    }, reject);
  });
  return monacoPromise;
}

const KIND = {
  Method: 'Method', Property: 'Property', Field: 'Field', Event: 'Event', Variable: 'Variable', Class: 'Class', Struct: 'Struct',
  Interface: 'Interface', Enum: 'Enum', EnumMember: 'EnumMember', Constant: 'Constant', Module: 'Module', Keyword: 'Keyword',
  Function: 'Function', Text: 'Text',
};

const SNIPPETS = [
  ['if', 'if (${1:koşul})\n{\n\t$0\n}', 'if bloğu'],
  ['else', 'else\n{\n\t$0\n}', 'else bloğu'],
  ['for', 'for (int ${1:i} = 0; ${1:i} < ${2:10}; ${1:i}++)\n{\n\t$0\n}', 'for döngüsü'],
  ['foreach', 'foreach (var ${1:item} in ${2:liste})\n{\n\t$0\n}', 'foreach döngüsü'],
  ['while', 'while (${1:koşul})\n{\n\t$0\n}', 'while döngüsü'],
  ['do', 'do\n{\n\t$0\n} while (${1:koşul});', 'do-while döngüsü'],
  ['switch', 'switch (${1:değer})\n{\n\tcase ${2:1}:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}', 'switch bloğu'],
  ['try', 'try\n{\n\t$0\n}\ncatch (Exception ex)\n{\n\tMessageBox.Show(ex.Message);\n}', 'try-catch bloğu'],
  ['mbox', 'MessageBox.Show("$0");', 'MessageBox.Show'],
  ['cw', 'Console.WriteLine($0);', 'Console.WriteLine'],
  ['prop', 'public ${1:int} ${2:Ozellik} { get; set; }', 'Özellik'],
];

function registerProviders(monaco) {
  monaco.languages.registerCompletionItemProvider('csharp', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const owner = activeOwner;
      if (!owner?.complete) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const offset = model.getOffsetAt(position);
      const items = owner.complete(model, offset) || [];
      const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn));
      const afterDot = /\.\s*$/.test(before);
      const suggestions = items.map((i) => ({
        label: i.label,
        kind: monaco.languages.CompletionItemKind[KIND[i.kind] || 'Text'],
        detail: i.detail || '',
        insertText: i.label,
        sortText: i.sort || i.label,
        range,
      }));
      if (!afterDot) {
        for (const [label, body, doc] of SNIPPETS) {
          suggestions.push({
            label, kind: monaco.languages.CompletionItemKind.Snippet, detail: doc, documentation: doc,
            insertText: body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, sortText: '8' + label, range,
          });
        }
      }
      return { suggestions };
    },
  });
}

/** Tek bir Monaco editörü; her dosya için ayrı model tutar. */
export class CodeEditor {
  constructor(container, owner, { readOnly = false } = {}) {
    this.container = container;
    this.owner = owner;
    this.readOnly = readOnly;
    this.models = new Map();
    this.viewStates = new Map();
    this.current = null;
  }

  async init() {
    const monaco = await loadMonaco();
    this.monaco = monaco;
    this.editor = monaco.editor.create(this.container, {
      theme: 'vs',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 4,
      insertSpaces: true,
      renderWhitespace: 'none',
      wordBasedSuggestions: 'off',
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      fixedOverflowWidgets: true,
      readOnly: this.readOnly,
      'semanticHighlighting.enabled': false,
      smoothScrolling: true,
      mouseWheelZoom: true,
      unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
    });
    this.editor.onDidFocusEditorText(() => { activeOwner = this.owner; });
    activeOwner = this.owner;
    this.editor.onDidChangeCursorPosition((e) => this.owner.onCursor?.(e.position.lineNumber, e.position.column));
    return this;
  }

  /** Dosya modeli oluşturur veya içeriğini günceller. */
  setFile(name, content, { readOnly = false } = {}) {
    let model = this.models.get(name);
    if (!model) {
      const uri = this.monaco.Uri.parse('file:///' + encodeURIComponent(name));
      model = this.monaco.editor.getModel(uri);
      if (model) model.dispose();
      model = this.monaco.editor.createModel(content, 'csharp', uri);
      model.updateOptions({ tabSize: 4, insertSpaces: true });
      model._fileName = name;
      model._readOnly = readOnly;
      model.onDidChangeContent(() => {
        if (model._settingValue) return;
        this.owner.onFileEdited?.(name, model.getValue());
      });
      this.models.set(name, model);
    } else if (model.getValue() !== content) {
      model._settingValue = true;
      if (model._readOnly || this.current !== name) {
        model.setValue(content);
      } else {
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null);
      }
      model._settingValue = false;
    }
    model._readOnly = readOnly;
    if (this.current === name) this.editor.updateOptions({ readOnly: this.readOnly || readOnly });
    return model;
  }

  removeFile(name) {
    const m = this.models.get(name);
    if (m) m.dispose();
    this.models.delete(name);
    this.viewStates.delete(name);
    if (this.current === name) this.current = null;
  }

  show(name) {
    const model = this.models.get(name);
    if (!model) return;
    if (this.current && this.current !== name) this.viewStates.set(this.current, this.editor.saveViewState());
    this.current = name;
    this.editor.setModel(model);
    this.editor.updateOptions({ readOnly: this.readOnly || model._readOnly });
    const vs = this.viewStates.get(name);
    if (vs) this.editor.restoreViewState(vs);
    activeOwner = this.owner;
    setTimeout(() => this.editor.layout(), 0);
  }

  focus() {
    this.editor?.focus();
  }

  revealLine(line, column = 1) {
    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column });
    this.editor.focus();
  }

  getValue(name) {
    return this.models.get(name)?.getValue();
  }

  /** Hata listesindeki tanıları kod içinde dalgalı çizgi olarak gösterir. */
  setDiagnostics(diagnostics) {
    const byFile = new Map();
    for (const d of diagnostics) {
      if (!byFile.has(d.file)) byFile.set(d.file, []);
      byFile.get(d.file).push(d);
    }
    for (const [name, model] of this.models) {
      const list = byFile.get(name) || [];
      this.monaco.editor.setModelMarkers(model, 'csharp', list.map((d) => ({
        severity: d.severity === 'error' ? this.monaco.MarkerSeverity.Error : this.monaco.MarkerSeverity.Warning,
        message: d.message,
        code: d.code,
        startLineNumber: d.line,
        startColumn: d.col,
        endLineNumber: d.endLine,
        endColumn: d.endLine === d.line && d.endCol <= d.col ? d.col + 1 : d.endCol,
      })));
    }
  }

  /** Çalışma zamanı hatasının olduğu satırı vurgular. */
  highlightLine(name, line) {
    const model = this.models.get(name);
    if (!model) return;
    this.clearHighlight();
    this.highlight = this.editor.createDecorationsCollection([{
      range: new this.monaco.Range(line, 1, line, 1),
      options: { isWholeLine: true, className: 'runtime-error-line', glyphMarginClassName: 'runtime-error-glyph' },
    }]);
  }

  clearHighlight() {
    this.highlight?.clear();
    this.highlight = null;
  }

  layout() {
    this.editor?.layout();
  }

  dispose() {
    if (activeOwner === this.owner) activeOwner = null;
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    this.editor?.dispose();
  }
}
