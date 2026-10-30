using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using System.Text;
using MiniWinForms;

namespace System.Windows.Forms
{
    // ======================= Düğmeler =======================

    public abstract class ButtonBase : Control
    {
        ContentAlignment textAlign = ContentAlignment.MiddleCenter;
        FlatStyle flatStyle = FlatStyle.Standard;
        Image image;

        public virtual ContentAlignment TextAlign { get => textAlign; set { textAlign = value; Ui.Set(Id, "align", value.ToString()); } }
        public FlatStyle FlatStyle { get => flatStyle; set { flatStyle = value; Ui.Set(Id, "flat", value.ToString()); } }
        public FlatButtonAppearance FlatAppearance { get; } = new FlatButtonAppearance();
        public bool UseVisualStyleBackColor { get; set; } = true;
        public bool UseMnemonic { get; set; } = true;
        public bool UseCompatibleTextRendering { get; set; }
        public bool AutoEllipsis { get; set; }
        public ContentAlignment ImageAlign { get; set; } = ContentAlignment.MiddleCenter;
        public TextImageRelation TextImageRelation { get; set; }
        public Image Image { get => image; set { image = value; Ui.Set(Id, "image", value?.Url ?? ""); } }

        internal override void AdjustAutoSize()
        {
            var s = MeasureText(Text);
            SetBoundsCore(Left, Top, Math.Max(Width, s.Width + 16), Math.Max(Height, s.Height + 8));
        }
    }

    public class FlatButtonAppearance
    {
        public Color BorderColor { get; set; }
        public int BorderSize { get; set; } = 1;
        public Color MouseOverBackColor { get; set; }
        public Color MouseDownBackColor { get; set; }
        public Color CheckedBackColor { get; set; }
    }

    public enum TextImageRelation { Overlay = 0, ImageAboveText = 1, TextAboveImage = 2, ImageBeforeText = 4, TextBeforeImage = 8 }

    public class Button : ButtonBase, IButtonControl
    {
        public Button() { Listen("click"); }
        internal override string UiType => "Button";
        protected override Size DefaultSize => new Size(75, 23);

        public DialogResult DialogResult { get; set; }
        public void NotifyDefault(bool value) { }

        public void PerformClick()
        {
            if (!CanFocus) return;
            OnClick(EventArgs.Empty);
        }

        protected override void OnClick(EventArgs e)
        {
            var form = FindForm();
            if (DialogResult != DialogResult.None && form != null) form.DialogResult = DialogResult;
            base.OnClick(e);
        }
    }

    public class CheckBox : ButtonBase
    {
        static readonly object EvCheckedChanged = new object(), EvCheckStateChanged = new object();
        CheckState state;

        public CheckBox() { TextAlign = ContentAlignment.MiddleLeft; }
        internal override string UiType => "CheckBox";
        protected override Size DefaultSize => new Size(104, 24);

        public bool Checked
        {
            get => state != CheckState.Unchecked;
            set => CheckState = value ? CheckState.Checked : CheckState.Unchecked;
        }

        public CheckState CheckState
        {
            get => state;
            set
            {
                if (state == value) return;
                bool oldChecked = Checked;
                state = value;
                Ui.Set(Id, "checked", value == CheckState.Checked ? "1" : value == CheckState.Indeterminate ? "2" : "0");
                if (oldChecked != Checked) OnCheckedChanged(EventArgs.Empty);
                Ev.Fire(Events[EvCheckStateChanged], this, EventArgs.Empty);
            }
        }

        public bool ThreeState { get; set; }
        public bool AutoCheck { get; set; } = true;
        public ContentAlignment CheckAlign { get; set; } = ContentAlignment.MiddleLeft;
        public Appearance Appearance { get; set; }

        public event EventHandler CheckedChanged { add => Events.AddHandler(EvCheckedChanged, value); remove => Events.RemoveHandler(EvCheckedChanged, value); }
        public event EventHandler CheckStateChanged { add => Events.AddHandler(EvCheckStateChanged, value); remove => Events.RemoveHandler(EvCheckStateChanged, value); }
        protected virtual void OnCheckedChanged(EventArgs e) => Ev.Fire(Events[EvCheckedChanged], this, e);

        internal override void AdjustAutoSize()
        {
            var s = MeasureText(Text);
            SetBoundsCore(Left, Top, s.Width + 20, Math.Max(s.Height + 4, 19));
        }

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "change")
            {
                if (AutoCheck)
                {
                    if (ThreeState)
                        CheckState = state == CheckState.Unchecked ? CheckState.Checked : state == CheckState.Checked ? CheckState.Indeterminate : CheckState.Unchecked;
                    else
                        Checked = data == "1";
                }
                else Ui.Set(Id, "checked", Checked);
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class RadioButton : ButtonBase
    {
        static readonly object EvCheckedChanged = new object();
        bool isChecked;

        public RadioButton() { TextAlign = ContentAlignment.MiddleLeft; }
        internal override string UiType => "RadioButton";
        protected override Size DefaultSize => new Size(104, 24);

        public bool AutoCheck { get; set; } = true;
        public ContentAlignment CheckAlign { get; set; } = ContentAlignment.MiddleLeft;
        public Appearance Appearance { get; set; }

        public bool Checked
        {
            get => isChecked;
            set
            {
                if (isChecked == value) return;
                isChecked = value;
                Ui.Set(Id, "checked", value);
                if (value && AutoCheck && Parent != null)
                {
                    foreach (Control c in Parent.Controls)
                        if (c is RadioButton r && r != this && r.AutoCheck) r.Checked = false;
                }
                OnCheckedChanged(EventArgs.Empty);
            }
        }

        public void PerformClick() { Checked = true; OnClick(EventArgs.Empty); }

        public event EventHandler CheckedChanged { add => Events.AddHandler(EvCheckedChanged, value); remove => Events.RemoveHandler(EvCheckedChanged, value); }
        protected virtual void OnCheckedChanged(EventArgs e) => Ev.Fire(Events[EvCheckedChanged], this, e);

        internal override void AdjustAutoSize()
        {
            var s = MeasureText(Text);
            SetBoundsCore(Left, Top, s.Width + 20, Math.Max(s.Height + 4, 19));
        }

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "change")
            {
                if (AutoCheck) Checked = true;
                else Ui.Set(Id, "checked", Checked);
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    // ======================= Etiketler =======================

    public class Label : Control
    {
        ContentAlignment textAlign = ContentAlignment.TopLeft;
        BorderStyle borderStyle;
        Image image;

        internal override string UiType => "Label";
        protected override Size DefaultSize => new Size(100, 23);

        public virtual ContentAlignment TextAlign { get => textAlign; set { textAlign = value; Ui.Set(Id, "align", value.ToString()); } }
        public virtual BorderStyle BorderStyle { get => borderStyle; set { borderStyle = value; Ui.Set(Id, "borderstyle", value.ToString()); if (AutoSize) AdjustAutoSize(); } }
        public FlatStyle FlatStyle { get; set; } = FlatStyle.Standard;
        public bool UseMnemonic { get; set; } = true;
        public bool UseCompatibleTextRendering { get; set; }
        public bool AutoEllipsis { get; set; }
        public Image Image { get => image; set { image = value; Ui.Set(Id, "image", value?.Url ?? ""); } }
        public ContentAlignment ImageAlign { get; set; } = ContentAlignment.MiddleCenter;
        public int PreferredWidth => MeasureText(Text).Width;
        public int PreferredHeight => MeasureText(Text).Height;
        public override bool CanFocus => false;

        internal override void AdjustAutoSize()
        {
            var s = MeasureText(Text);
            int border = borderStyle == BorderStyle.None ? 0 : 2;
            SetBoundsCore(Left, Top, s.Width + border, s.Height + border);
        }
    }

    public class LinkLabel : Label
    {
        static readonly object EvLinkClicked = new object();

        public LinkLabel() { Listen("click"); Cursor = Cursors.Hand; }
        internal override string UiType => "LinkLabel";

        public Color LinkColor { get; set; } = Color.FromArgb(0, 0, 255);
        public Color ActiveLinkColor { get; set; } = Color.Red;
        public Color VisitedLinkColor { get; set; } = Color.FromArgb(128, 0, 128);
        public bool LinkVisited { get; set; }
        public LinkBehavior LinkBehavior { get; set; }

        public event LinkLabelLinkClickedEventHandler LinkClicked { add => Events.AddHandler(EvLinkClicked, value); remove => Events.RemoveHandler(EvLinkClicked, value); }
        protected virtual void OnLinkClicked(LinkLabelLinkClickedEventArgs e) => Ev.Fire(Events[EvLinkClicked], this, e);

        protected override void OnClick(EventArgs e)
        {
            base.OnClick(e);
            OnLinkClicked(new LinkLabelLinkClickedEventArgs(null));
        }
    }

    // ======================= Metin kutuları =======================

    public abstract class TextBoxBase : Control
    {
        bool multiline, readOnly, wordWrap = true, hideSelection = true;
        int maxLength = 32767;
        BorderStyle borderStyle = BorderStyle.Fixed3D;

        internal override Color DefaultBack => SystemColors.Window;
        internal override Color DefaultFore => SystemColors.WindowText;

        public virtual bool Multiline
        {
            get => multiline;
            set { multiline = value; Ui.Set(Id, "multiline", value); }
        }

        public bool ReadOnly { get => readOnly; set { readOnly = value; Ui.Set(Id, "readonly", value); } }
        public bool WordWrap { get => wordWrap; set { wordWrap = value; Ui.Set(Id, "wordwrap", value); } }
        public virtual int MaxLength { get => maxLength; set { maxLength = value; Ui.Set(Id, "maxlength", value); } }
        public BorderStyle BorderStyle { get => borderStyle; set { borderStyle = value; Ui.Set(Id, "borderstyle", value.ToString()); } }
        public bool HideSelection { get => hideSelection; set => hideSelection = value; }
        public bool AcceptsTab { get; set; }
        public bool ShortcutsEnabled { get; set; } = true;
        public bool Modified { get; set; }
        public int TextLength => Text.Length;
        public bool CanUndo => false;

        public string[] Lines
        {
            get => Text.Replace("\r\n", "\n").Split('\n');
            set => Text = value == null ? "" : string.Join(Environment.NewLine, value);
        }

        public int SelectionStart
        {
            get => QueryInt("selstart");
            set => Ui.Call(Id, "select", value + "," + SelectionLengthOr0());
        }

        public int SelectionLength
        {
            get => QueryInt("sellength");
            set => Ui.Call(Id, "select", QueryInt("selstart") + "," + value);
        }

        public string SelectedText
        {
            get
            {
                int s = Math.Min(SelectionStart, Text.Length), l = Math.Min(SelectionLength, Text.Length - s);
                return l > 0 ? Text.Substring(s, l) : "";
            }
            set
            {
                int s = Math.Min(SelectionStart, Text.Length), l = Math.Min(SelectionLength, Text.Length - s);
                Text = Text.Substring(0, s) + (value ?? "") + Text.Substring(s + l);
                Ui.Call(Id, "select", (s + (value ?? "").Length) + ",0");
            }
        }

        int SelectionLengthOr0() => 0;

        int QueryInt(string what)
        {
            Ui.Flush();
            var r = Ui.Backend.Query(Id, what);
            return int.TryParse(r, out int v) ? v : 0;
        }

        public void AppendText(string text)
        {
            Text += text;
            Ui.Call(Id, "scrollend");
        }

        public void Clear() => Text = "";
        public void SelectAll() => Ui.Call(Id, "selectall");
        public void Select(int start, int length) => Ui.Call(Id, "select", start + "," + length);
        public void DeselectAll() => Ui.Call(Id, "select", "0,0");
        public void ScrollToCaret() => Ui.Call(Id, "scrollend");
        public void Copy() { }
        public void Cut() { }
        public void Paste() { }
        public void Paste(string text) => SelectedText = text;
        public void Undo() { }
        public void ClearUndo() { }
        public int GetLineFromCharIndex(int index) => Text.Substring(0, Math.Min(index, Text.Length)).Split('\n').Length - 1;
        public int GetFirstCharIndexFromLine(int lineNumber)
        {
            var lines = Lines;
            int idx = 0;
            for (int i = 0; i < lineNumber && i < lines.Length; i++) idx += lines[i].Length + Environment.NewLine.Length;
            return lineNumber < lines.Length ? idx : -1;
        }

        internal virtual string TransformInput(string v) => v;

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "input")
            {
                string v = TransformInput(data);
                if (v != Text)
                {
                    SetTextSilently(v);
                    if (v != data) Ui.Set(Id, "text", v);
                    Modified = true;
                    OnTextChanged(EventArgs.Empty);
                }
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class TextBox : TextBoxBase
    {
        char passwordChar;
        bool useSystemPasswordChar;
        HorizontalAlignment textAlign;
        ScrollBars scrollBars;
        CharacterCasing casing;
        string placeholder = "";

        internal override string UiType => "TextBox";
        protected override Size DefaultSize => new Size(100, 23);

        public char PasswordChar { get => passwordChar; set { passwordChar = value; SendPassword(); } }
        public bool UseSystemPasswordChar { get => useSystemPasswordChar; set { useSystemPasswordChar = value; SendPassword(); } }
        void SendPassword() => Ui.Set(Id, "password", passwordChar != '\0' || useSystemPasswordChar);
        public HorizontalAlignment TextAlign { get => textAlign; set { textAlign = value; Ui.Set(Id, "align", value.ToString()); } }
        public ScrollBars ScrollBars { get => scrollBars; set { scrollBars = value; Ui.Set(Id, "scrollbars", value.ToString()); } }
        public bool AcceptsReturn { get; set; }
        public string PlaceholderText { get => placeholder; set { placeholder = value ?? ""; Ui.Set(Id, "placeholder", placeholder); } }
        public AutoCompleteMode AutoCompleteMode { get; set; }
        public AutoCompleteSource AutoCompleteSource { get; set; }
        public AutoCompleteStringCollection AutoCompleteCustomSource { get; set; } = new AutoCompleteStringCollection();

        public CharacterCasing CharacterCasing
        {
            get => casing;
            set { casing = value; if (value != CharacterCasing.Normal) Text = TransformInput(Text); }
        }

        internal override string TransformInput(string v) => casing switch
        {
            CharacterCasing.Upper => v.ToUpper(CultureInfo.CurrentCulture),
            CharacterCasing.Lower => v.ToLower(CultureInfo.CurrentCulture),
            _ => v,
        };

        public override string Text
        {
            get => base.Text;
            set => base.Text = TransformInput(value ?? "");
        }
    }

    public enum AutoCompleteMode { None = 0, Suggest = 1, Append = 2, SuggestAppend = 3 }
    public enum AutoCompleteSource { FileSystem = 1, HistoryList = 2, RecentlyUsedList = 4, AllUrl = 6, AllSystemSources = 7, FileSystemDirectories = 32, CustomSource = 64, None = 128, ListItems = 256 }
    public class AutoCompleteStringCollection : List<string> { }

    public class RichTextBox : TextBoxBase
    {
        public RichTextBox() { Multiline = true; }
        internal override string UiType => "TextBox";
        protected override Size DefaultSize => new Size(100, 96);
        public RichTextBoxScrollBars ScrollBars { get; set; } = RichTextBoxScrollBars.Both;
        public bool DetectUrls { get; set; } = true;
        public Color SelectionColor { get; set; }
        public Font SelectionFont { get; set; }
        public HorizontalAlignment SelectionAlignment { get; set; }
        public string Rtf { get => Text; set => Text = value; }
        public float ZoomFactor { get; set; } = 1;
        public void LoadFile(string path) => Text = System.IO.File.ReadAllText(path);
        public void SaveFile(string path) => System.IO.File.WriteAllText(path, Text);
        public int Find(string str) => Text.IndexOf(str ?? "", StringComparison.Ordinal);
    }

    public enum MaskFormat { ExcludePromptAndLiterals = 0, IncludePrompt = 1, IncludeLiterals = 2, IncludePromptAndLiterals = 3 }
    public enum InsertKeyMode { Default = 0, Insert = 1, Overwrite = 2 }
    public delegate void MaskInputRejectedEventHandler(object sender, MaskInputRejectedEventArgs e);
    public class MaskInputRejectedEventArgs : EventArgs
    {
        public MaskInputRejectedEventArgs(int position, System.ComponentModel.MaskedTextResultHint rejectionHint) { Position = position; RejectionHint = rejectionHint; }
        public int Position { get; }
        public System.ComponentModel.MaskedTextResultHint RejectionHint { get; }
    }
    public delegate void TypeValidationEventHandler(object sender, TypeValidationEventArgs e);
    public class TypeValidationEventArgs : EventArgs
    {
        public TypeValidationEventArgs(Type validatingType, bool isValidInput, object returnValue, string message)
        { ValidatingType = validatingType; IsValidInput = isValidInput; ReturnValue = returnValue; Message = message; }
        public Type ValidatingType { get; }
        public bool IsValidInput { get; }
        public object ReturnValue { get; }
        public string Message { get; }
        public bool Cancel { get; set; }
    }

    /// <summary>
    /// Maskeli metin kutusu (ör. telefon "(999) 000-0000", tarih "00/00/0000").
    /// Maske kuralları WinForms ile aynıdır: 0 rakam (zorunlu), 9 rakam/boşluk, # rakam/+/-, L harf (zorunlu), ? harf,
    /// &amp; herhangi karakter (zorunlu), C herhangi, A harf/rakam (zorunlu), a harf/rakam, &lt; küçük harf, &gt; büyük harf, \ kaçış.
    /// </summary>
    public class MaskedTextBox : TextBox
    {
        static readonly object EvMaskInputRejected = new object(), EvTypeValidationCompleted = new object(), EvMaskChanged = new object();
        internal struct Slot { public char Kind; public char Literal; public char Case; public bool Edit => Kind != '\0'; public bool Required => Kind is '0' or 'L' or '&' or 'A'; }
        string mask = "";
        Slot[] slots = new Slot[0];
        char[] values = new char[0];
        char promptChar = '_';
        MaskFormat textMaskFormat = MaskFormat.IncludeLiterals;
        System.Globalization.CultureInfo culture;

        public MaskedTextBox() { }
        public MaskedTextBox(string mask) : this() { Mask = mask; }

        internal override string UiType => "MaskedTextBox";

        public string Mask
        {
            get => mask;
            set
            {
                string text = Text;
                mask = value ?? "";
                Parse();
                Ui.Set(Id, "mask", MaskJson());
                SetValue(text, false);
                Ev.Fire(Events[EvMaskChanged], this, EventArgs.Empty);
            }
        }

        public char PromptChar { get => promptChar; set { promptChar = value; Ui.Set(Id, "mask", MaskJson()); SendDisplay(); } }
        public MaskFormat TextMaskFormat { get => textMaskFormat; set => textMaskFormat = value; }
        public MaskFormat CutCopyMaskFormat { get; set; } = MaskFormat.IncludeLiterals;
        public System.Globalization.CultureInfo Culture { get => culture ?? System.Globalization.CultureInfo.CurrentCulture; set { culture = value; Mask = mask; } }
        public bool HidePromptOnLeave { get; set; }
        public bool BeepOnError { get; set; }
        public bool AllowPromptAsInput { get; set; } = true;
        public bool AsciiOnly { get; set; }
        public bool RejectInputOnFirstFailure { get; set; }
        public bool ResetOnPrompt { get; set; } = true;
        public bool ResetOnSpace { get; set; } = true;
        public bool SkipLiterals { get; set; } = true;
        public InsertKeyMode InsertKeyMode { get; set; }
        public bool IsOverwriteMode => InsertKeyMode == InsertKeyMode.Overwrite;
        public Type ValidatingType { get; set; }
        public IFormatProvider FormatProvider { get; set; }
        public System.ComponentModel.MaskedTextProvider MaskedTextProvider => null;

        /// <summary>Zorunlu (0, L, &amp;, A) bütün yerler dolu mu?</summary>
        public bool MaskCompleted
        {
            get
            {
                for (int i = 0; i < slots.Length; i++) if (slots[i].Required && values[i] == '\0') return false;
                return true;
            }
        }

        /// <summary>Bütün giriş yerleri dolu mu?</summary>
        public bool MaskFull
        {
            get
            {
                for (int i = 0; i < slots.Length; i++) if (slots[i].Edit && values[i] == '\0') return false;
                return true;
            }
        }

        public event MaskInputRejectedEventHandler MaskInputRejected { add => Events.AddHandler(EvMaskInputRejected, value); remove => Events.RemoveHandler(EvMaskInputRejected, value); }
        public event TypeValidationEventHandler TypeValidationCompleted { add => Events.AddHandler(EvTypeValidationCompleted, value); remove => Events.RemoveHandler(EvTypeValidationCompleted, value); }
        public event EventHandler MaskChanged { add => Events.AddHandler(EvMaskChanged, value); remove => Events.RemoveHandler(EvMaskChanged, value); }

        void Parse()
        {
            var list = new List<Slot>();
            var c = Culture;
            char caseMode = '\0';
            for (int i = 0; i < mask.Length; i++)
            {
                char m = mask[i];
                switch (m)
                {
                    case '\\':
                        if (i + 1 < mask.Length) list.Add(new Slot { Literal = mask[++i] });
                        break;
                    case '<': caseMode = 'L'; break;
                    case '>': caseMode = 'U'; break;
                    case '|': caseMode = '\0'; break;
                    case '0': case '9': case '#': case 'L': case '?': case '&': case 'C': case 'A': case 'a':
                        list.Add(new Slot { Kind = m, Case = caseMode });
                        break;
                    case '.': AddLiterals(list, c.NumberFormat.NumberDecimalSeparator); break;
                    case ',': AddLiterals(list, c.NumberFormat.NumberGroupSeparator); break;
                    case ':': AddLiterals(list, c.DateTimeFormat.TimeSeparator); break;
                    case '/': AddLiterals(list, c.DateTimeFormat.DateSeparator); break;
                    case '$': AddLiterals(list, c.NumberFormat.CurrencySymbol); break;
                    default: list.Add(new Slot { Literal = m }); break;
                }
            }
            slots = list.ToArray();
            values = new char[slots.Length];
        }

        static void AddLiterals(List<Slot> list, string s) { foreach (char ch in s) list.Add(new Slot { Literal = ch }); }

        internal static bool Accepts(char kind, char ch) => kind switch
        {
            '0' => char.IsDigit(ch),
            '9' => char.IsDigit(ch) || ch == ' ',
            '#' => char.IsDigit(ch) || ch == ' ' || ch == '+' || ch == '-',
            'L' => char.IsLetter(ch),
            '?' => char.IsLetter(ch) || ch == ' ',
            '&' => !char.IsControl(ch) && ch != ' ',
            'C' => !char.IsControl(ch),
            'A' => char.IsLetterOrDigit(ch),
            'a' => char.IsLetterOrDigit(ch) || ch == ' ',
            _ => false,
        };

        static char ApplyCase(Slot s, char ch, System.Globalization.CultureInfo c) =>
            s.Case == 'U' ? char.ToUpper(ch, c) : s.Case == 'L' ? char.ToLower(ch, c) : ch;

        string MaskJson()
        {
            var sb = new StringBuilder("{\"p\":").Append(Ui.J(promptChar.ToString())).Append(",\"s\":[");
            for (int i = 0; i < slots.Length; i++)
            {
                if (i > 0) sb.Append(',');
                if (slots[i].Edit) sb.Append("{\"k\":").Append(Ui.J(slots[i].Kind.ToString())).Append(slots[i].Case != '\0' ? ",\"c\":" + Ui.J(slots[i].Case.ToString()) : "").Append('}');
                else sb.Append("{\"l\":").Append(Ui.J(slots[i].Literal.ToString())).Append('}');
            }
            return sb.Append("]}").ToString();
        }

        /// <summary>Ekranda görünen metin (boş yerlerde PromptChar).</summary>
        string Display()
        {
            var sb = new StringBuilder(slots.Length);
            for (int i = 0; i < slots.Length; i++) sb.Append(slots[i].Edit ? (values[i] == '\0' ? promptChar : values[i]) : slots[i].Literal);
            return sb.ToString();
        }

        string Format(MaskFormat f)
        {
            if (mask.Length == 0) return base.Text;
            bool lit = f == MaskFormat.IncludeLiterals || f == MaskFormat.IncludePromptAndLiterals;
            bool prompt = f == MaskFormat.IncludePrompt || f == MaskFormat.IncludePromptAndLiterals;
            var sb = new StringBuilder();
            int keep = 0;
            for (int i = 0; i < slots.Length; i++)
            {
                if (!slots[i].Edit)
                {
                    if (!lit) continue;
                    sb.Append(slots[i].Literal);
                    keep = sb.Length;
                }
                else if (values[i] != '\0') { sb.Append(values[i]); keep = sb.Length; }
                else { sb.Append(prompt ? promptChar : ' '); if (prompt) keep = sb.Length; }
            }
            // Sondaki boş giriş yerleri (WinForms'taki gibi) metne katılmaz.
            return sb.ToString(0, keep);
        }

        public override string Text
        {
            get => mask.Length == 0 ? base.Text : Format(textMaskFormat);
            set
            {
                if (mask.Length == 0) { base.Text = value; return; }
                SetValue(value, true);
            }
        }

        public override int MaxLength { get => mask.Length == 0 ? base.MaxLength : slots.Length; set => base.MaxLength = value; }

        void SetValue(string value, bool raise)
        {
            if (mask.Length == 0) { base.Text = value; return; }
            string before = Display();
            Array.Clear(values, 0, values.Length);
            int pos = 0;
            var c = Culture;
            foreach (char ch in value ?? "")
            {
                if (pos >= slots.Length) break;
                if (!slots[pos].Edit && slots[pos].Literal == ch) { pos++; continue; }
                while (pos < slots.Length && !slots[pos].Edit) pos++;
                if (pos >= slots.Length) break;
                if (ch == promptChar || (ch == ' ' && !Accepts(slots[pos].Kind, ' '))) { pos++; continue; }
                if (Accepts(slots[pos].Kind, ch)) values[pos++] = ApplyCase(slots[pos - 1], ch, c);
            }
            string after = Display();
            SetTextSilently(after);
            Ui.Set(Id, "text", after);
            if (raise && after != before) OnTextChanged(EventArgs.Empty);
        }

        void SendDisplay() { string d = Display(); SetTextSilently(d); Ui.Set(Id, "text", d); }

        internal override string HandleUiEvent(string evt, string data)
        {
            if (mask.Length > 0 && evt == "input")
            {
                // Tarayıcı maskeyi uygulayıp ekrandaki metni gönderir: yer yer okunur.
                string before = Display();
                var c = Culture;
                for (int i = 0; i < slots.Length; i++)
                {
                    if (!slots[i].Edit) continue;
                    char ch = i < data.Length ? data[i] : promptChar;
                    values[i] = ch == promptChar || !Accepts(slots[i].Kind, ch) ? '\0' : ApplyCase(slots[i], ch, c);
                }
                string after = Display();
                SetTextSilently(after);
                if (after != data) Ui.Set(Id, "text", after);
                if (after != before) { Modified = true; OnTextChanged(EventArgs.Empty); }
                return "";
            }
            if (evt == "reject")
            {
                int.TryParse(data, out int p);
                (Events[EvMaskInputRejected] as MaskInputRejectedEventHandler)?.Invoke(this, new MaskInputRejectedEventArgs(p, System.ComponentModel.MaskedTextResultHint.LetterExpected));
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }

        /// <summary>ValidatingType'a göre metni çevirir (ör. DateTime).</summary>
        public object ValidateText()
        {
            if (ValidatingType == null) return null;
            try { return Convert.ChangeType(Format(MaskFormat.IncludeLiterals), ValidatingType, Culture); }
            catch { return null; }
        }

        protected override void OnLeave(EventArgs e)
        {
            base.OnLeave(e);
            if (ValidatingType != null)
            {
                object v = ValidateText();
                var args = new TypeValidationEventArgs(ValidatingType, v != null, v, v != null ? "" : "Değer " + ValidatingType.Name + " türüne çevrilemedi.");
                (Events[EvTypeValidationCompleted] as TypeValidationEventHandler)?.Invoke(this, args);
            }
        }
    }

    // ======================= Listeler =======================

    public abstract class ListControl : Control
    {
        static readonly object EvSelectedValueChanged = new object(), EvDataSourceChanged = new object();
        object dataSource;
        string displayMember = "", valueMember = "";

        internal override Color DefaultBack => SystemColors.Window;
        internal override Color DefaultFore => SystemColors.WindowText;

        public abstract int SelectedIndex { get; set; }
        internal abstract ObjectList ItemList { get; }

        public object DataSource
        {
            get => dataSource;
            set
            {
                dataSource = value;
                ItemList.ClearSilently();
                if (value is IEnumerable en && value is not string)
                    foreach (var o in en) ItemList.AddSilently(o);
                ItemList.Changed();
                SelectedIndex = ItemList.Count > 0 ? 0 : -1;
                Ev.Fire(Events[EvDataSourceChanged], this, EventArgs.Empty);
            }
        }

        public string DisplayMember { get => displayMember; set { displayMember = value ?? ""; ItemList.Changed(); } }
        public string ValueMember { get => valueMember; set => valueMember = value ?? ""; }
        public bool FormattingEnabled { get; set; }
        public string FormatString { get; set; } = "";

        public object SelectedValue
        {
            get
            {
                int i = SelectedIndex;
                if (i < 0) return null;
                return GetMember(ItemList[i], valueMember);
            }
            set
            {
                for (int i = 0; i < ItemList.Count; i++)
                    if (Equals(GetMember(ItemList[i], valueMember), value)) { SelectedIndex = i; return; }
                SelectedIndex = -1;
            }
        }

        public string GetItemText(object item)
        {
            var v = GetMember(item, displayMember);
            return Convert.ToString(v, CultureInfo.CurrentCulture) ?? "";
        }

        static object GetMember(object item, string member)
        {
            if (item == null || string.IsNullOrEmpty(member)) return item;
            var t = item.GetType();
            var p = t.GetProperty(member);
            if (p != null) return p.GetValue(item);
            var f = t.GetField(member);
            if (f != null) return f.GetValue(item);
            return item;
        }

        public event EventHandler SelectedValueChanged { add => Events.AddHandler(EvSelectedValueChanged, value); remove => Events.RemoveHandler(EvSelectedValueChanged, value); }
        public event EventHandler DataSourceChanged { add => Events.AddHandler(EvDataSourceChanged, value); remove => Events.RemoveHandler(EvDataSourceChanged, value); }
        protected virtual void OnSelectedValueChanged(EventArgs e) => Ev.Fire(Events[EvSelectedValueChanged], this, e);

        internal string ItemsJson()
        {
            var sb = new StringBuilder("[");
            for (int i = 0; i < ItemList.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(Ui.J(GetItemText(ItemList[i])));
            }
            return sb.Append(']').ToString();
        }
    }

    /// <summary>ComboBox.Items / ListBox.Items koleksiyonu.</summary>
    public class ObjectList : IList
    {
        readonly List<object> list = new List<object>();
        readonly ListControl owner;
        internal Action<int> OnRemoved;
        internal Action OnCleared;

        internal ObjectList(ListControl owner) { this.owner = owner; }

        public int Count => list.Count;
        public bool IsReadOnly => false;
        public bool IsFixedSize => false;
        public bool IsSynchronized => false;
        public object SyncRoot => this;
        internal bool Sorted { get; set; }

        public virtual object this[int index]
        {
            get
            {
                if (index < 0 || index >= list.Count) throw new ArgumentOutOfRangeException(nameof(index), "Geçersiz indeks: " + index + ". Listede " + list.Count + " öğe var.");
                return list[index];
            }
            set { list[index] = value ?? throw new ArgumentNullException(nameof(value)); Changed(); }
        }

        internal void Changed() => Ui.SetLazy(owner.Id, "items", owner.ItemsJson);
        internal void ClearSilently() => list.Clear();
        internal void AddSilently(object o) => list.Add(o);

        public int Add(object item)
        {
            if (item == null) throw new ArgumentNullException(nameof(item));
            int index;
            if (Sorted)
            {
                string t = owner.GetItemText(item);
                index = 0;
                while (index < list.Count && string.Compare(owner.GetItemText(list[index]), t, StringComparison.CurrentCultureIgnoreCase) <= 0) index++;
                list.Insert(index, item);
            }
            else
            {
                list.Add(item);
                index = list.Count - 1;
            }
            Changed();
            return index;
        }

        public void AddRange(object[] items)
        {
            foreach (var i in items) Add(i);
        }

        public void AddRange(ObjectList items)
        {
            foreach (var i in items.list.ToArray()) Add(i);
        }

        public void Insert(int index, object item)
        {
            list.Insert(index, item ?? throw new ArgumentNullException(nameof(item)));
            Changed();
        }

        public void Remove(object value)
        {
            int i = list.IndexOf(value);
            if (i >= 0) RemoveAt(i);
        }

        public void RemoveAt(int index)
        {
            if (index < 0 || index >= list.Count) throw new ArgumentOutOfRangeException(nameof(index), "Geçersiz indeks: " + index + ". Listede " + list.Count + " öğe var.");
            list.RemoveAt(index);
            Changed();
            OnRemoved?.Invoke(index);
        }

        public void Clear()
        {
            list.Clear();
            Changed();
            OnCleared?.Invoke();
        }

        internal void SortItems()
        {
            list.Sort((a, b) => string.Compare(owner.GetItemText(a), owner.GetItemText(b), StringComparison.CurrentCultureIgnoreCase));
            Changed();
        }

        public bool Contains(object value) => list.Contains(value);
        public int IndexOf(object value) => list.IndexOf(value);
        public void CopyTo(object[] destination, int arrayIndex) => list.CopyTo(destination, arrayIndex);
        void ICollection.CopyTo(Array array, int index) => ((ICollection)list).CopyTo(array, index);
        public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
    }

    public class ComboBox : ListControl
    {
        static readonly object EvSelectedIndexChanged = new object(), EvDropDownStyleChanged = new object(),
            EvSelectionChangeCommitted = new object(), EvDropDown = new object(), EvDropDownClosed = new object();
        readonly ObjectCollection items;
        int selectedIndex = -1;
        ComboBoxStyle style = ComboBoxStyle.DropDown;
        bool sorted;

        public ComboBox()
        {
            items = new ObjectCollection(this);
            items.OnRemoved = i => { if (i == selectedIndex) SelectedIndex = -1; else if (i < selectedIndex) { selectedIndex--; Ui.Set(Id, "sel", selectedIndex); } };
            items.OnCleared = () => { selectedIndex = -1; Ui.Set(Id, "sel", -1); if (style == ComboBoxStyle.DropDownList) SetTextSilently(""); };
        }

        internal override string UiType => "ComboBox";
        protected override Size DefaultSize => new Size(121, 23);
        internal override ObjectList ItemList => items;

        public class ObjectCollection : ObjectList
        {
            public ObjectCollection(ComboBox owner) : base(owner) { }
        }

        public ObjectCollection Items => items;
        public int MaxDropDownItems { get; set; } = 8;
        public int DropDownHeight { get; set; } = 106;
        public int DropDownWidth { get; set; }
        public bool DroppedDown { get; set; }
        public int MaxLength { get; set; }
        public AutoCompleteMode AutoCompleteMode { get; set; }
        public AutoCompleteSource AutoCompleteSource { get; set; }
        public AutoCompleteStringCollection AutoCompleteCustomSource { get; set; } = new AutoCompleteStringCollection();
        public FlatStyle FlatStyle { get; set; } = FlatStyle.Standard;
        public int ItemHeight { get; set; } = 15;

        public bool Sorted
        {
            get => sorted;
            set { sorted = value; items.Sorted = value; if (value) items.SortItems(); }
        }

        public ComboBoxStyle DropDownStyle
        {
            get => style;
            set
            {
                style = value;
                Ui.Set(Id, "style", value.ToString());
                Ev.Fire(Events[EvDropDownStyleChanged], this, EventArgs.Empty);
            }
        }

        public override int SelectedIndex
        {
            get => selectedIndex;
            set
            {
                if (value < -1 || value >= items.Count) throw new ArgumentOutOfRangeException(nameof(value), "SelectedIndex için geçersiz değer: " + value + ". Listede " + items.Count + " öğe var.");
                if (selectedIndex == value) return;
                selectedIndex = value;
                Ui.Set(Id, "sel", value);
                string t = value >= 0 ? GetItemText(items[value]) : (style == ComboBoxStyle.DropDownList ? "" : Text);
                if (t != Text)
                {
                    SetTextSilently(t);
                    Ui.Set(Id, "text", t);
                    OnTextChanged(EventArgs.Empty);
                }
                OnSelectedIndexChanged(EventArgs.Empty);
                OnSelectedValueChanged(EventArgs.Empty);
            }
        }

        public object SelectedItem
        {
            get => selectedIndex >= 0 && selectedIndex < items.Count ? items[selectedIndex] : null;
            set => SelectedIndex = value == null ? -1 : items.IndexOf(value);
        }

        public string SelectedText { get => Text; set => Text = value; }
        public int SelectionStart { get; set; }
        public int SelectionLength { get; set; }

        public override string Text
        {
            get => base.Text;
            set
            {
                value ??= "";
                int idx = -1;
                for (int i = 0; i < items.Count; i++)
                    if (GetItemText(items[i]) == value) { idx = i; break; }
                if (idx >= 0) { SelectedIndex = idx; return; }
                if (style == ComboBoxStyle.DropDownList) return;
                base.Text = value;
            }
        }

        public int FindString(string s)
        {
            for (int i = 0; i < items.Count; i++) if (GetItemText(items[i]).StartsWith(s ?? "", StringComparison.CurrentCultureIgnoreCase)) return i;
            return -1;
        }

        public int FindStringExact(string s)
        {
            for (int i = 0; i < items.Count; i++) if (string.Equals(GetItemText(items[i]), s, StringComparison.CurrentCultureIgnoreCase)) return i;
            return -1;
        }

        public void BeginUpdate() { }
        public void EndUpdate() { }
        public void SelectAll() => Ui.Call(Id, "selectall");

        public event EventHandler SelectedIndexChanged { add => Events.AddHandler(EvSelectedIndexChanged, value); remove => Events.RemoveHandler(EvSelectedIndexChanged, value); }
        public event EventHandler DropDownStyleChanged { add => Events.AddHandler(EvDropDownStyleChanged, value); remove => Events.RemoveHandler(EvDropDownStyleChanged, value); }
        public event EventHandler SelectionChangeCommitted { add => Events.AddHandler(EvSelectionChangeCommitted, value); remove => Events.RemoveHandler(EvSelectionChangeCommitted, value); }
        public event EventHandler DropDown { add => Events.AddHandler(EvDropDown, value); remove => Events.RemoveHandler(EvDropDown, value); }
        public event EventHandler DropDownClosed { add => Events.AddHandler(EvDropDownClosed, value); remove => Events.RemoveHandler(EvDropDownClosed, value); }
        protected virtual void OnSelectedIndexChanged(EventArgs e) => Ev.Fire(Events[EvSelectedIndexChanged], this, e);

        internal override string HandleUiEvent(string evt, string data)
        {
            switch (evt)
            {
                case "select":
                    if (int.TryParse(data, out int i) && i >= -1 && i < items.Count)
                    {
                        SelectedIndex = i;
                        Ev.Fire(Events[EvSelectionChangeCommitted], this, EventArgs.Empty);
                    }
                    return "";
                case "input":
                    if (data != Text)
                    {
                        SetTextSilently(data);
                        OnTextChanged(EventArgs.Empty);
                        int match = FindStringExact(data);
                        if (match != selectedIndex)
                        {
                            selectedIndex = match;
                            Ui.Set(Id, "sel", match);
                            OnSelectedIndexChanged(EventArgs.Empty);
                        }
                    }
                    return "";
                case "dropdown":
                    Ev.Fire(Events[EvDropDown], this, EventArgs.Empty);
                    return "";
                case "dropdownclosed":
                    Ev.Fire(Events[EvDropDownClosed], this, EventArgs.Empty);
                    return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class ListBox : ListControl
    {
        static readonly object EvSelectedIndexChanged = new object();
        readonly ObjectCollection items;
        readonly List<int> selected = new List<int>();
        SelectionMode selectionMode = SelectionMode.One;
        bool sorted;
        BorderStyle borderStyle = BorderStyle.Fixed3D;

        public ListBox()
        {
            items = new ObjectCollection(this);
            items.OnRemoved = i =>
            {
                bool changed = selected.Remove(i);
                for (int k = 0; k < selected.Count; k++) if (selected[k] > i) { selected[k]--; changed = true; }
                SendSelection();
                if (changed) OnSelectedIndexChanged(EventArgs.Empty);
            };
            items.OnCleared = () =>
            {
                bool changed = selected.Count > 0;
                selected.Clear();
                SendSelection();
                if (changed) OnSelectedIndexChanged(EventArgs.Empty);
            };
        }

        internal override string UiType => "ListBox";
        protected override Size DefaultSize => new Size(120, 94);
        internal override ObjectList ItemList => items;

        public class ObjectCollection : ObjectList
        {
            public ObjectCollection(ListBox owner) : base(owner) { }
        }

        public class SelectedIndexCollection : List<int> { internal SelectedIndexCollection(IEnumerable<int> e) : base(e) { } }
        public class SelectedObjectCollection : List<object> { internal SelectedObjectCollection(IEnumerable<object> e) : base(e) { } }

        public ObjectCollection Items => items;
        public int ItemHeight { get; set; } = 15;
        public bool IntegralHeight { get; set; } = true;
        public bool HorizontalScrollbar { get; set; }
        public bool ScrollAlwaysVisible { get; set; }
        public bool MultiColumn { get; set; }
        public int TopIndex { get; set; }
        public BorderStyle BorderStyle { get => borderStyle; set { borderStyle = value; Ui.Set(Id, "borderstyle", value.ToString()); } }

        public bool Sorted
        {
            get => sorted;
            set { sorted = value; items.Sorted = value; if (value) items.SortItems(); }
        }

        public SelectionMode SelectionMode
        {
            get => selectionMode;
            set { selectionMode = value; Ui.Set(Id, "selmode", value.ToString()); }
        }

        void SendSelection() => Ui.Set(Id, "sel", string.Join(",", selected));

        public override int SelectedIndex
        {
            get => selected.Count > 0 ? selected[0] : -1;
            set
            {
                if (value < -1 || value >= items.Count) throw new ArgumentOutOfRangeException(nameof(value), "SelectedIndex için geçersiz değer: " + value + ". Listede " + items.Count + " öğe var.");
                if (selected.Count == 1 && selected[0] == value || selected.Count == 0 && value == -1) return;
                if (selectionMode == SelectionMode.One || value == -1) selected.Clear();
                if (value >= 0 && !selected.Contains(value)) selected.Add(value);
                SendSelection();
                OnSelectedIndexChanged(EventArgs.Empty);
                OnSelectedValueChanged(EventArgs.Empty);
            }
        }

        public object SelectedItem
        {
            get { int i = SelectedIndex; return i >= 0 && i < items.Count ? items[i] : null; }
            set => SelectedIndex = value == null ? -1 : items.IndexOf(value);
        }

        public SelectedIndexCollection SelectedIndices { get { var l = new List<int>(selected); l.Sort(); return new SelectedIndexCollection(l); } }

        public SelectedObjectCollection SelectedItems
        {
            get
            {
                var l = new List<int>(selected);
                l.Sort();
                var o = new List<object>();
                foreach (var i in l) if (i < items.Count) o.Add(items[i]);
                return new SelectedObjectCollection(o);
            }
        }

        public override string Text
        {
            get => SelectedItem == null ? "" : GetItemText(SelectedItem);
            set { int i = FindStringExact(value); if (i >= 0) SelectedIndex = i; }
        }

        public bool GetSelected(int index) => selected.Contains(index);

        public void SetSelected(int index, bool value)
        {
            if (index < 0 || index >= items.Count) throw new ArgumentOutOfRangeException(nameof(index));
            if (value)
            {
                if (selectionMode == SelectionMode.One) selected.Clear();
                if (!selected.Contains(index)) selected.Add(index);
            }
            else selected.Remove(index);
            SendSelection();
            OnSelectedIndexChanged(EventArgs.Empty);
        }

        public void ClearSelected()
        {
            if (selected.Count == 0) return;
            selected.Clear();
            SendSelection();
            OnSelectedIndexChanged(EventArgs.Empty);
        }

        public int FindString(string s)
        {
            for (int i = 0; i < items.Count; i++) if (GetItemText(items[i]).StartsWith(s ?? "", StringComparison.CurrentCultureIgnoreCase)) return i;
            return -1;
        }

        public int FindStringExact(string s)
        {
            for (int i = 0; i < items.Count; i++) if (string.Equals(GetItemText(items[i]), s, StringComparison.CurrentCultureIgnoreCase)) return i;
            return -1;
        }

        public int IndexFromPoint(Point p) => IndexFromPoint(p.X, p.Y);
        public int IndexFromPoint(int x, int y) { int i = y / ItemHeight + TopIndex; return i >= 0 && i < items.Count ? i : -1; }
        public void BeginUpdate() { }
        public void EndUpdate() { }

        public event EventHandler SelectedIndexChanged { add => Events.AddHandler(EvSelectedIndexChanged, value); remove => Events.RemoveHandler(EvSelectedIndexChanged, value); }
        protected virtual void OnSelectedIndexChanged(EventArgs e) => Ev.Fire(Events[EvSelectedIndexChanged], this, e);

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "select")
            {
                var list = new List<int>();
                foreach (var part in (data ?? "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
                    if (int.TryParse(part, out int i) && i >= 0 && i < items.Count) list.Add(i);
                if (selectionMode == SelectionMode.None) list.Clear();
                if (selectionMode == SelectionMode.One && list.Count > 1) list.RemoveRange(1, list.Count - 1);
                var a = new List<int>(selected); a.Sort();
                var b = new List<int>(list); b.Sort();
                if (string.Join(",", a) == string.Join(",", b)) return "";
                selected.Clear();
                selected.AddRange(list);
                SendSelection();
                OnSelectedIndexChanged(EventArgs.Empty);
                OnSelectedValueChanged(EventArgs.Empty);
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class CheckedListBox : ListBox
    {
        static readonly object EvItemCheck = new object();
        readonly List<int> checkedIdx = new List<int>();

        public CheckedListBox()
        {
            Items.OnRemoved = i =>
            {
                checkedIdx.Remove(i);
                for (int k = 0; k < checkedIdx.Count; k++) if (checkedIdx[k] > i) checkedIdx[k]--;
                SendChecked();
            };
            Items.OnCleared = () => { checkedIdx.Clear(); SendChecked(); };
        }

        internal override string UiType => "CheckedListBox";
        public bool CheckOnClick { get; set; }

        void SendChecked() => Ui.Set(Id, "checkeditems", string.Join(",", checkedIdx));

        public bool GetItemChecked(int index) => checkedIdx.Contains(index);
        public CheckState GetItemCheckState(int index) => GetItemChecked(index) ? CheckState.Checked : CheckState.Unchecked;
        public void SetItemCheckState(int index, CheckState value) => SetItemChecked(index, value != CheckState.Unchecked);

        public void SetItemChecked(int index, bool value)
        {
            if (index < 0 || index >= Items.Count) throw new ArgumentOutOfRangeException(nameof(index));
            if (GetItemChecked(index) == value) return;
            var e = new ItemCheckEventArgs(index, value ? CheckState.Checked : CheckState.Unchecked, value ? CheckState.Unchecked : CheckState.Checked);
            Ev.Fire(Events[EvItemCheck], this, e);
            if (e.NewValue != CheckState.Unchecked) { if (!checkedIdx.Contains(index)) checkedIdx.Add(index); }
            else checkedIdx.Remove(index);
            SendChecked();
        }

        public List<object> CheckedItems
        {
            get
            {
                var l = new List<int>(checkedIdx); l.Sort();
                var o = new List<object>();
                foreach (var i in l) o.Add(Items[i]);
                return o;
            }
        }

        public List<int> CheckedIndices { get { var l = new List<int>(checkedIdx); l.Sort(); return l; } }

        public event ItemCheckEventHandler ItemCheck { add => Events.AddHandler(EvItemCheck, value); remove => Events.RemoveHandler(EvItemCheck, value); }

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "check" && int.TryParse(data, out int i) && i >= 0 && i < Items.Count)
            {
                SetItemChecked(i, !GetItemChecked(i));
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    // ======================= Kapsayıcılar =======================

    public class GroupBox : Control
    {
        internal override string UiType => "GroupBox";
        protected override Size DefaultSize => new Size(200, 100);
        public FlatStyle FlatStyle { get; set; } = FlatStyle.Standard;
        public override Rectangle DisplayRectangle
        {
            get
            {
                var c = ClientSize;
                int top = Font.Height + 3;
                return new Rectangle(3, top, Math.Max(0, c.Width - 6), Math.Max(0, c.Height - top - 3));
            }
        }
        public override bool CanFocus => false;
    }

    public class Panel : ScrollableControl
    {
        BorderStyle borderStyle;
        internal override string UiType => "Panel";
        protected override Size DefaultSize => new Size(200, 100);
        public BorderStyle BorderStyle { get => borderStyle; set { borderStyle = value; Ui.Set(Id, "borderstyle", value.ToString()); } }
        public override bool CanFocus => false;
    }

    public class FlowLayoutPanel : Panel
    {
        public FlowDirection FlowDirection { get; set; }
        public bool WrapContents { get; set; } = true;
    }

    public enum FlowDirection { LeftToRight = 0, TopDown = 1, RightToLeft = 2, BottomUp = 3 }

    public class UserControl : ContainerControl
    {
        BorderStyle borderStyle;
        internal override string UiType => "Panel";
        protected override Size DefaultSize => new Size(150, 150);
        public BorderStyle BorderStyle { get => borderStyle; set { borderStyle = value; Ui.Set(Id, "borderstyle", value.ToString()); } }
        public event EventHandler Load;
    }

    // ======================= Resim =======================

    public class PictureBox : Control, ISupportInitialize
    {
        Image image;
        string imageLocation = "";
        PictureBoxSizeMode sizeMode;
        BorderStyle borderStyle;

        internal override string UiType => "PictureBox";
        protected override Size DefaultSize => new Size(100, 50);

        public Image Image
        {
            get => image;
            set { image = value; Ui.Set(Id, "image", value?.Url ?? ""); FitImage(); }
        }

        public string ImageLocation
        {
            get => imageLocation;
            set { imageLocation = value ?? ""; image = string.IsNullOrEmpty(value) ? null : new Bitmap(value); Ui.Set(Id, "image", image?.Url ?? ""); FitImage(); }
        }

        /// <summary>SizeMode = AutoSize ise kutu resmin boyutunu alır.</summary>
        void FitImage()
        {
            if (sizeMode != PictureBoxSizeMode.AutoSize || image == null || image.Width <= 0) return;
            int extra = borderStyle == BorderStyle.None ? 0 : 2;
            Size = new Size(image.Width + extra, image.Height + extra);
        }

        public Image InitialImage { get; set; }
        public Image ErrorImage { get; set; }
        public bool WaitOnLoad { get; set; }
        public PictureBoxSizeMode SizeMode { get => sizeMode; set { sizeMode = value; Ui.Set(Id, "sizemode", value.ToString()); FitImage(); } }
        public BorderStyle BorderStyle { get => borderStyle; set { borderStyle = value; Ui.Set(Id, "borderstyle", value.ToString()); } }
        public override bool CanFocus => false;

        public void BeginInit() { }
        public void EndInit() { }
        public void Load() => ImageLocation = imageLocation;
        public void Load(string url) => ImageLocation = url;
        public void LoadAsync() => Load();
        public void LoadAsync(string url) => Load(url);
    }

    // ======================= Sayısal / Tarih =======================

    public class NumericUpDown : Control, ISupportInitialize
    {
        static readonly object EvValueChanged = new object();
        decimal value, minimum, maximum = 100, increment = 1;
        int decimalPlaces;
        HorizontalAlignment textAlign;

        public NumericUpDown() { SendRange(); }
        internal override string UiType => "NumericUpDown";
        protected override Size DefaultSize => new Size(120, 23);
        internal override Color DefaultBack => SystemColors.Window;

        public decimal Value
        {
            get => value;
            set
            {
                if (value < minimum || value > maximum)
                    throw new ArgumentOutOfRangeException(nameof(value), "Value değeri " + value + " geçersiz. Minimum (" + minimum + ") ile Maximum (" + maximum + ") arasında olmalıdır.");
                if (this.value == value) return;
                this.value = value;
                Ui.Set(Id, "value", value.ToString(CultureInfo.InvariantCulture));
                OnValueChanged(EventArgs.Empty);
            }
        }

        public decimal Minimum { get => minimum; set { minimum = value; if (maximum < value) maximum = value; if (this.value < value) Value = value; SendRange(); } }
        public decimal Maximum { get => maximum; set { maximum = value; if (minimum > value) minimum = value; if (this.value > value) Value = value; SendRange(); } }
        public decimal Increment { get => increment; set { increment = value; SendRange(); } }
        public int DecimalPlaces { get => decimalPlaces; set { decimalPlaces = value; SendRange(); } }
        public bool Hexadecimal { get; set; }
        public bool ThousandsSeparator { get; set; }
        public bool ReadOnly { get; set; }
        public bool InterceptArrowKeys { get; set; } = true;
        public HorizontalAlignment TextAlign { get => textAlign; set { textAlign = value; Ui.Set(Id, "align", value.ToString()); } }
        public BorderStyle BorderStyle { get; set; } = BorderStyle.Fixed3D;
        public LeftRightAlignment UpDownAlign { get; set; } = LeftRightAlignment.Right;
        public override string Text { get => value.ToString("F" + decimalPlaces, CultureInfo.CurrentCulture); set { if (decimal.TryParse(value, NumberStyles.Number, CultureInfo.CurrentCulture, out var d)) Value = Math.Max(minimum, Math.Min(maximum, d)); } }

        void SendRange() => Ui.Set(Id, "range", string.Join(",", minimum.ToString(CultureInfo.InvariantCulture), maximum.ToString(CultureInfo.InvariantCulture), increment.ToString(CultureInfo.InvariantCulture), decimalPlaces.ToString(CultureInfo.InvariantCulture)));

        public void BeginInit() { }
        public void EndInit() { }
        public void UpButton() => Value = Math.Min(maximum, value + increment);
        public void DownButton() => Value = Math.Max(minimum, value - increment);
        public void Select(int start, int length) { }

        public event EventHandler ValueChanged { add => Events.AddHandler(EvValueChanged, value); remove => Events.RemoveHandler(EvValueChanged, value); }
        protected virtual void OnValueChanged(EventArgs e) => Ev.Fire(Events[EvValueChanged], this, e);

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "input")
            {
                if (decimal.TryParse(data, NumberStyles.Number, CultureInfo.InvariantCulture, out var d))
                {
                    d = Math.Round(Math.Max(minimum, Math.Min(maximum, d)), decimalPlaces);
                    if (d != value) { value = d; OnValueChanged(EventArgs.Empty); }
                }
                Ui.Set(Id, "value", value.ToString(CultureInfo.InvariantCulture));
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class DomainUpDown : Control
    {
        internal override string UiType => "TextBox";
        public List<object> Items { get; } = new List<object>();
    }

    public class ProgressBar : Control
    {
        int value, minimum, maximum = 100, step = 10;
        ProgressBarStyle style = ProgressBarStyle.Blocks;

        public ProgressBar() { SendState(); }
        internal override string UiType => "ProgressBar";
        protected override Size DefaultSize => new Size(100, 23);

        public int Value
        {
            get => value;
            set
            {
                if (value < minimum || value > maximum)
                    throw new ArgumentOutOfRangeException(nameof(value), "ProgressBar Value değeri " + value + " geçersiz. " + minimum + " ile " + maximum + " arasında olmalıdır.");
                this.value = value;
                SendState();
            }
        }

        public int Minimum { get => minimum; set { minimum = value; if (this.value < value) this.value = value; SendState(); } }
        public int Maximum { get => maximum; set { maximum = value; if (this.value > value) this.value = value; SendState(); } }
        public int Step { get => step; set => step = value; }
        public ProgressBarStyle Style { get => style; set { style = value; SendState(); } }
        public int MarqueeAnimationSpeed { get; set; } = 100;
        public bool RightToLeftLayout { get; set; }
        public override bool CanFocus => false;

        void SendState() => Ui.Set(Id, "progress", minimum + "," + maximum + "," + value + "," + style);
        public void PerformStep() => Increment(step);
        public void Increment(int amount) { value = Math.Max(minimum, Math.Min(maximum, value + amount)); SendState(); }
    }

    public class TrackBar : Control, ISupportInitialize
    {
        static readonly object EvValueChanged = new object(), EvScroll = new object();
        int value, minimum, maximum = 10, tickFrequency = 1, smallChange = 1, largeChange = 5;
        Orientation orientation;
        TickStyle tickStyle = TickStyle.BottomRight;

        public TrackBar() { SendRange(); }
        internal override string UiType => "TrackBar";
        protected override Size DefaultSize => new Size(104, 45);

        public int Value
        {
            get => value;
            set
            {
                if (value < minimum || value > maximum)
                    throw new ArgumentOutOfRangeException(nameof(value), "TrackBar Value değeri " + value + " geçersiz. " + minimum + " ile " + maximum + " arasında olmalıdır.");
                if (this.value == value) return;
                this.value = value;
                Ui.Set(Id, "value", value);
                OnValueChanged(EventArgs.Empty);
            }
        }

        public int Minimum { get => minimum; set { minimum = value; if (this.value < value) this.value = value; SendRange(); } }
        public int Maximum { get => maximum; set { maximum = value; if (this.value > value) this.value = value; SendRange(); } }
        public int TickFrequency { get => tickFrequency; set { tickFrequency = value; SendRange(); } }
        public int SmallChange { get => smallChange; set => smallChange = value; }
        public int LargeChange { get => largeChange; set => largeChange = value; }
        public Orientation Orientation { get => orientation; set { orientation = value; SendRange(); } }
        public TickStyle TickStyle { get => tickStyle; set { tickStyle = value; SendRange(); } }

        void SendRange()
        {
            Ui.Set(Id, "range", minimum + "," + maximum + "," + tickFrequency + "," + orientation + "," + tickStyle);
            Ui.Set(Id, "value", value);
        }

        public void BeginInit() { }
        public void EndInit() { }
        public void SetRange(int min, int max) { Minimum = min; Maximum = max; }

        public event EventHandler ValueChanged { add => Events.AddHandler(EvValueChanged, value); remove => Events.RemoveHandler(EvValueChanged, value); }
        public event EventHandler Scroll { add => Events.AddHandler(EvScroll, value); remove => Events.RemoveHandler(EvScroll, value); }
        protected virtual void OnValueChanged(EventArgs e) => Ev.Fire(Events[EvValueChanged], this, e);

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "input")
            {
                if (int.TryParse(data, out int v))
                {
                    v = Math.Max(minimum, Math.Min(maximum, v));
                    if (v != value)
                    {
                        value = v;
                        Ev.Fire(Events[EvScroll], this, EventArgs.Empty);
                        OnValueChanged(EventArgs.Empty);
                    }
                }
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class DateTimePicker : Control
    {
        static readonly object EvValueChanged = new object();
        DateTime value = DateTime.Now;
        DateTimePickerFormat format = DateTimePickerFormat.Long;
        DateTime minDate = new DateTime(1753, 1, 1), maxDate = new DateTime(9998, 12, 31);
        bool showUpDown, isChecked = true;

        public DateTimePicker() { SendValue(); }
        internal override string UiType => "DateTimePicker";
        protected override Size DefaultSize => new Size(200, 23);
        internal override Color DefaultBack => SystemColors.Window;

        public static readonly DateTime MinimumDateTime = new DateTime(1753, 1, 1);
        public static readonly DateTime MaximumDateTime = new DateTime(9998, 12, 31);

        public DateTime Value
        {
            get => value;
            set
            {
                if (value < minDate || value > maxDate) throw new ArgumentOutOfRangeException(nameof(value), "Tarih MinDate ile MaxDate arasında olmalıdır.");
                if (this.value == value) return;
                this.value = value;
                SendValue();
                OnValueChanged(EventArgs.Empty);
            }
        }

        public DateTimePickerFormat Format { get => format; set { format = value; SendValue(); } }
        public string CustomFormat { get; set; }
        public DateTime MinDate { get => minDate; set { minDate = value; SendValue(); } }
        public DateTime MaxDate { get => maxDate; set { maxDate = value; SendValue(); } }
        public bool ShowUpDown { get => showUpDown; set { showUpDown = value; } }
        public bool ShowCheckBox { get; set; }
        public bool Checked { get => isChecked; set => isChecked = value; }
        public override string Text
        {
            get => format switch
            {
                DateTimePickerFormat.Short => value.ToShortDateString(),
                DateTimePickerFormat.Time => value.ToLongTimeString(),
                DateTimePickerFormat.Custom when !string.IsNullOrEmpty(CustomFormat) => value.ToString(CustomFormat),
                _ => value.ToLongDateString(),
            };
            set { if (DateTime.TryParse(value, out var d)) Value = d; }
        }

        void SendValue()
        {
            Ui.Set(Id, "datetime", format + "|" + value.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture) + "|" +
                minDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "|" + maxDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        }

        public event EventHandler ValueChanged { add => Events.AddHandler(EvValueChanged, value); remove => Events.RemoveHandler(EvValueChanged, value); }
        protected virtual void OnValueChanged(EventArgs e) => Ev.Fire(Events[EvValueChanged], this, e);

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "input")
            {
                if (DateTime.TryParse(data, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                {
                    if (format == DateTimePickerFormat.Time) d = value.Date + d.TimeOfDay;
                    else d = d.Date + value.TimeOfDay;
                    if (d < minDate) d = minDate;
                    if (d > maxDate) d = maxDate;
                    if (d != value) { value = d; OnValueChanged(EventArgs.Empty); }
                }
                SendValue();
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class MonthCalendar : DateTimePicker { }

    // ======================= Zamanlayıcı =======================

    public class Timer : Component, IUiTarget
    {
        internal readonly int Id;
        int interval = 100;
        bool enabled;

        public Timer() { GC.SuppressFinalize(this); Id = Ui.Register(this); }
        public Timer(IContainer container) : this() { container?.Add(this); }

        public object Tag { get; set; }

        public int Interval
        {
            get => interval;
            set
            {
                if (value < 1) throw new ArgumentOutOfRangeException(nameof(value), "Interval en az 1 olmalıdır.");
                interval = value;
                if (enabled) Send();
            }
        }

        public bool Enabled
        {
            get => enabled;
            set
            {
                if (enabled == value) return;
                enabled = value;
                Send();
            }
        }

        void Send() => Ui.Set(Id, "timer", enabled ? interval : 0);

        public void Start() => Enabled = true;
        public void Stop() => Enabled = false;

        public event EventHandler Tick;
        protected virtual void OnTick(EventArgs e) => Tick?.Invoke(this, e);

        string IUiTarget.HandleUiEvent(string evt, string data)
        {
            if (evt == "tick" && enabled) OnTick(EventArgs.Empty);
            return "";
        }

        protected override void Dispose(bool disposing)
        {
            Enabled = false;
            Ui.Unregister(Id);
            base.Dispose(disposing);
        }
    }

    public class ToolTip : Component
    {
        public ToolTip() { }
        public ToolTip(IContainer container) { container?.Add(this); }
        readonly Dictionary<Control, string> tips = new Dictionary<Control, string>();
        public void SetToolTip(Control control, string caption)
        {
            if (control == null) return;
            tips[control] = caption;
            Ui.Set(control.Id, "tooltip", caption ?? "");
        }
        public string GetToolTip(Control control) => control != null && tips.TryGetValue(control, out var s) ? s : "";
        public string ToolTipTitle { get; set; }
        public bool IsBalloon { get; set; }
        public int AutoPopDelay { get; set; } = 5000;
        public int InitialDelay { get; set; } = 500;
        public int ReshowDelay { get; set; } = 100;
        public bool Active { get; set; } = true;
    }
}
