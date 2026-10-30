using System.ComponentModel;

namespace System.Windows.Forms
{
    /// <summary>Olay temsilcilerini DynamicInvoke kullanmadan çağırır (hatalar sarmalanmadan kullanıcıya ulaşsın diye).</summary>
    internal static class Ev
    {
        public static void Fire(Delegate d, object sender, EventArgs e)
        {
            switch (d)
            {
                case null: return;
                case EventHandler h: h(sender, e); return;
                case MouseEventHandler h: h(sender, (MouseEventArgs)e); return;
                case KeyEventHandler h: h(sender, (KeyEventArgs)e); return;
                case KeyPressEventHandler h: h(sender, (KeyPressEventArgs)e); return;
                case FormClosingEventHandler h: h(sender, (FormClosingEventArgs)e); return;
                case FormClosedEventHandler h: h(sender, (FormClosedEventArgs)e); return;
                case CancelEventHandler h: h(sender, (CancelEventArgs)e); return;
                case ControlEventHandler h: h(sender, (ControlEventArgs)e); return;
                case LayoutEventHandler h: h(sender, (LayoutEventArgs)e); return;
                case PaintEventHandler h: h(sender, (PaintEventArgs)e); return;
                case LinkLabelLinkClickedEventHandler h: h(sender, (LinkLabelLinkClickedEventArgs)e); return;
                case ItemCheckEventHandler h: h(sender, (ItemCheckEventArgs)e); return;
                case DataGridViewCellEventHandler h: h(sender, (DataGridViewCellEventArgs)e); return;
                case DataGridViewCellMouseEventHandler h: h(sender, (DataGridViewCellMouseEventArgs)e); return;
                case DataGridViewCellCancelEventHandler h: h(sender, (DataGridViewCellCancelEventArgs)e); return;
                case DataGridViewRowEventHandler h: h(sender, (DataGridViewRowEventArgs)e); return;
                case DataGridViewRowCancelEventHandler h: h(sender, (DataGridViewRowCancelEventArgs)e); return;
                case DataGridViewRowsAddedEventHandler h: h(sender, (DataGridViewRowsAddedEventArgs)e); return;
                case DataGridViewRowsRemovedEventHandler h: h(sender, (DataGridViewRowsRemovedEventArgs)e); return;
                case DataGridViewCellFormattingEventHandler h: h(sender, (DataGridViewCellFormattingEventArgs)e); return;
                case DataGridViewCellValidatingEventHandler h: h(sender, (DataGridViewCellValidatingEventArgs)e); return;
                case DataGridViewDataErrorEventHandler h: h(sender, (DataGridViewDataErrorEventArgs)e); return;
                case DataGridViewBindingCompleteEventHandler h: h(sender, (DataGridViewBindingCompleteEventArgs)e); return;
                case DataGridViewColumnEventHandler h: h(sender, (DataGridViewColumnEventArgs)e); return;
                default: d.DynamicInvoke(sender, e); return;
            }
        }
    }
}
