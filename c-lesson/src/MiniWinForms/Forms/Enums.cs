using System.ComponentModel;

namespace System.Windows.Forms
{
    public enum DialogResult { None = 0, OK = 1, Cancel = 2, Abort = 3, Retry = 4, Ignore = 5, Yes = 6, No = 7, TryAgain = 10, Continue = 11 }
    public enum MessageBoxButtons { OK = 0, OKCancel = 1, AbortRetryIgnore = 2, YesNoCancel = 3, YesNo = 4, RetryCancel = 5, CancelTryContinue = 6 }
    public enum MessageBoxIcon { None = 0, Hand = 16, Stop = 16, Error = 16, Question = 32, Exclamation = 48, Warning = 48, Asterisk = 64, Information = 64 }
    public enum MessageBoxDefaultButton { Button1 = 0, Button2 = 256, Button3 = 512, Button4 = 768 }
    [Flags] public enum MessageBoxOptions { DefaultDesktopOnly = 0x20000, RightAlign = 0x80000, RtlReading = 0x100000, ServiceNotification = 0x200000 }

    public enum DockStyle { None = 0, Top = 1, Bottom = 2, Left = 3, Right = 4, Fill = 5 }
    [Flags] public enum AnchorStyles { None = 0, Top = 1, Bottom = 2, Left = 4, Right = 8 }
    public enum BorderStyle { None = 0, FixedSingle = 1, Fixed3D = 2 }
    public enum FlatStyle { Flat = 0, Popup = 1, Standard = 2, System = 3 }
    public enum FormBorderStyle { None = 0, FixedSingle = 1, Fixed3D = 2, FixedDialog = 3, Sizable = 4, FixedToolWindow = 5, SizableToolWindow = 6 }
    public enum FormStartPosition { Manual = 0, CenterScreen = 1, WindowsDefaultLocation = 2, WindowsDefaultBounds = 3, CenterParent = 4 }
    public enum FormWindowState { Normal = 0, Minimized = 1, Maximized = 2 }
    public enum HorizontalAlignment { Left = 0, Right = 1, Center = 2 }
    public enum ScrollBars { None = 0, Horizontal = 1, Vertical = 2, Both = 3 }
    public enum RichTextBoxScrollBars { None = 0, Horizontal = 1, Vertical = 2, Both = 3, ForcedHorizontal = 0x11, ForcedVertical = 0x12, ForcedBoth = 0x13 }
    public enum CharacterCasing { Normal = 0, Upper = 1, Lower = 2 }
    public enum ComboBoxStyle { Simple = 0, DropDown = 1, DropDownList = 2 }
    public enum SelectionMode { None = 0, One = 1, MultiSimple = 2, MultiExtended = 3 }
    public enum PictureBoxSizeMode { Normal = 0, StretchImage = 1, AutoSize = 2, CenterImage = 3, Zoom = 4 }
    public enum Orientation { Horizontal = 0, Vertical = 1 }
    public enum TickStyle { None = 0, TopLeft = 1, BottomRight = 2, Both = 3 }
    public enum DateTimePickerFormat { Long = 1, Short = 2, Time = 4, Custom = 8 }
    public enum AutoScaleMode { None = 0, Font = 1, Dpi = 2, Inherit = 3 }
    public enum HighDpiMode { DpiUnaware = 0, SystemAware = 1, PerMonitor = 2, PerMonitorV2 = 3, DpiUnawareGdiScaled = 4 }
    public enum CheckState { Unchecked = 0, Checked = 1, Indeterminate = 2 }
    public enum Appearance { Normal = 0, Button = 1 }
    public enum ProgressBarStyle { Blocks = 0, Continuous = 1, Marquee = 2 }
    public enum ImageLayout { None = 0, Tile = 1, Center = 2, Stretch = 3, Zoom = 4 }
    public enum CloseReason { None = 0, WindowsShutDown = 1, MdiFormClosing = 2, UserClosing = 3, TaskManagerClosing = 4, FormOwnerClosing = 5, ApplicationExitCall = 6 }
    public enum LeftRightAlignment { Left = 0, Right = 1 }
    public enum RightToLeft { No = 0, Yes = 1, Inherit = 2 }
    public enum ImeMode { Inherit = -1, NoControl = 0, On = 1, Off = 2 }
    public enum LinkBehavior { SystemDefault = 0, AlwaysUnderline = 1, HoverUnderline = 2, NeverUnderline = 3 }

    [Flags]
    public enum MouseButtons { None = 0, Left = 0x100000, Right = 0x200000, Middle = 0x400000, XButton1 = 0x800000, XButton2 = 0x1000000 }

    [Flags]
    public enum Keys
    {
        KeyCode = 0xFFFF, Modifiers = unchecked((int)0xFFFF0000), None = 0,
        LButton = 1, RButton = 2, Cancel = 3, MButton = 4,
        Back = 8, Tab = 9, LineFeed = 10, Clear = 12, Return = 13, Enter = 13,
        ShiftKey = 16, ControlKey = 17, Menu = 18, Pause = 19, Capital = 20, CapsLock = 20,
        Escape = 27, Space = 32, Prior = 33, PageUp = 33, Next = 34, PageDown = 34, End = 35, Home = 36,
        Left = 37, Up = 38, Right = 39, Down = 40, Select = 41, Print = 42, Execute = 43, Snapshot = 44, PrintScreen = 44,
        Insert = 45, Delete = 46, Help = 47,
        D0 = 48, D1 = 49, D2 = 50, D3 = 51, D4 = 52, D5 = 53, D6 = 54, D7 = 55, D8 = 56, D9 = 57,
        A = 65, B = 66, C = 67, D = 68, E = 69, F = 70, G = 71, H = 72, I = 73, J = 74, K = 75, L = 76, M = 77,
        N = 78, O = 79, P = 80, Q = 81, R = 82, S = 83, T = 84, U = 85, V = 86, W = 87, X = 88, Y = 89, Z = 90,
        LWin = 91, RWin = 92, Apps = 93,
        NumPad0 = 96, NumPad1 = 97, NumPad2 = 98, NumPad3 = 99, NumPad4 = 100, NumPad5 = 101, NumPad6 = 102, NumPad7 = 103, NumPad8 = 104, NumPad9 = 105,
        Multiply = 106, Add = 107, Separator = 108, Subtract = 109, Decimal = 110, Divide = 111,
        F1 = 112, F2 = 113, F3 = 114, F4 = 115, F5 = 116, F6 = 117, F7 = 118, F8 = 119, F9 = 120, F10 = 121, F11 = 122, F12 = 123,
        NumLock = 144, Scroll = 145, LShiftKey = 160, RShiftKey = 161, LControlKey = 162, RControlKey = 163, LMenu = 164, RMenu = 165,
        OemSemicolon = 186, Oem1 = 186, Oemplus = 187, Oemcomma = 188, OemMinus = 189, OemPeriod = 190, OemQuestion = 191, Oem2 = 191,
        Oemtilde = 192, Oem3 = 192, OemOpenBrackets = 219, Oem4 = 219, OemPipe = 220, Oem5 = 220, OemCloseBrackets = 221, Oem6 = 221,
        OemQuotes = 222, Oem7 = 222, Oem8 = 223, OemBackslash = 226, Oem102 = 226,
        Shift = 0x10000, Control = 0x20000, Alt = 0x40000,
    }

    public delegate void MouseEventHandler(object sender, MouseEventArgs e);
    public delegate void KeyEventHandler(object sender, KeyEventArgs e);
    public delegate void KeyPressEventHandler(object sender, KeyPressEventArgs e);
    public delegate void FormClosingEventHandler(object sender, FormClosingEventArgs e);
    public delegate void FormClosedEventHandler(object sender, FormClosedEventArgs e);
    public delegate void ControlEventHandler(object sender, ControlEventArgs e);
    public delegate void LinkLabelLinkClickedEventHandler(object sender, LinkLabelLinkClickedEventArgs e);
    public delegate void ItemCheckEventHandler(object sender, ItemCheckEventArgs e);
    public delegate void DateRangeEventHandler(object sender, EventArgs e);

    public class MouseEventArgs : EventArgs
    {
        public MouseEventArgs(MouseButtons button, int clicks, int x, int y, int delta)
        {
            Button = button; Clicks = clicks; X = x; Y = y; Delta = delta;
        }
        public MouseButtons Button { get; }
        public int Clicks { get; }
        public int X { get; }
        public int Y { get; }
        public int Delta { get; }
        public System.Drawing.Point Location => new System.Drawing.Point(X, Y);
    }

    public class KeyEventArgs : EventArgs
    {
        public KeyEventArgs(Keys keyData) { KeyData = keyData; }
        public Keys KeyData { get; }
        public Keys KeyCode => KeyData & Keys.KeyCode;
        public Keys Modifiers => KeyData & Keys.Modifiers;
        public int KeyValue => (int)(KeyData & Keys.KeyCode);
        public bool Shift => (KeyData & Keys.Shift) != 0;
        public bool Control => (KeyData & Keys.Control) != 0;
        public bool Alt => (KeyData & Keys.Alt) != 0;
        public bool Handled { get; set; }
        public bool SuppressKeyPress { get => suppress; set { suppress = value; if (value) Handled = true; } }
        bool suppress;
    }

    public class KeyPressEventArgs : EventArgs
    {
        public KeyPressEventArgs(char keyChar) { KeyChar = keyChar; }
        public char KeyChar { get; set; }
        public bool Handled { get; set; }
    }

    public class FormClosingEventArgs : CancelEventArgs
    {
        public FormClosingEventArgs(CloseReason closeReason, bool cancel) : base(cancel) { CloseReason = closeReason; }
        public CloseReason CloseReason { get; }
    }

    public class FormClosedEventArgs : EventArgs
    {
        public FormClosedEventArgs(CloseReason closeReason) { CloseReason = closeReason; }
        public CloseReason CloseReason { get; }
    }

    public class ControlEventArgs : EventArgs
    {
        public ControlEventArgs(Control control) { Control = control; }
        public Control Control { get; }
    }

    public class LinkLabelLinkClickedEventArgs : EventArgs
    {
        public LinkLabelLinkClickedEventArgs(object link) { Link = link; }
        public object Link { get; }
        public MouseButtons Button => MouseButtons.Left;
    }

    public class ItemCheckEventArgs : EventArgs
    {
        public ItemCheckEventArgs(int index, CheckState newCheckValue, CheckState currentValue)
        {
            Index = index; NewValue = newCheckValue; CurrentValue = currentValue;
        }
        public int Index { get; }
        public CheckState NewValue { get; set; }
        public CheckState CurrentValue { get; }
    }

    public class Cursor
    {
        internal Cursor(string css) { Css = css; }
        internal string Css { get; }
        public static Cursor Current { get; set; }
        public static System.Drawing.Point Position { get; set; }
    }

    public static class Cursors
    {
        public static Cursor Default { get; } = new Cursor("default");
        public static Cursor Arrow { get; } = new Cursor("default");
        public static Cursor Hand { get; } = new Cursor("pointer");
        public static Cursor IBeam { get; } = new Cursor("text");
        public static Cursor WaitCursor { get; } = new Cursor("wait");
        public static Cursor AppStarting { get; } = new Cursor("progress");
        public static Cursor Cross { get; } = new Cursor("crosshair");
        public static Cursor Help { get; } = new Cursor("help");
        public static Cursor No { get; } = new Cursor("not-allowed");
        public static Cursor SizeAll { get; } = new Cursor("move");
        public static Cursor SizeNS { get; } = new Cursor("ns-resize");
        public static Cursor SizeWE { get; } = new Cursor("ew-resize");
        public static Cursor SizeNESW { get; } = new Cursor("nesw-resize");
        public static Cursor SizeNWSE { get; } = new Cursor("nwse-resize");
        public static Cursor UpArrow { get; } = new Cursor("n-resize");
    }

    public struct Padding
    {
        public Padding(int all) { Left = Top = Right = Bottom = all; }
        public Padding(int left, int top, int right, int bottom) { Left = left; Top = top; Right = right; Bottom = bottom; }
        public int Left { get; set; }
        public int Top { get; set; }
        public int Right { get; set; }
        public int Bottom { get; set; }
        public int All { get => Left == Top && Top == Right && Right == Bottom ? Left : -1; set { Left = Top = Right = Bottom = value; } }
        public int Horizontal => Left + Right;
        public int Vertical => Top + Bottom;
        public static readonly Padding Empty = new Padding(0);
    }
}
