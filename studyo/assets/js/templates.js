// Yeni proje / form / sınıf şablonları (Visual Studio'nun .NET Framework şablonlarına benzer).
import { generateDesigner } from './codegen.js';
import { sampleDatabase, databaseForm } from './dbtemplate.js';
import { generateDataSet, designerFileName } from './datasetgen.js';

/** Proje adından geçerli bir C# ad alanı üretir ("Hesap Makinesi" → "HesapMakinesi"). */
export function toNamespace(name) {
  const map = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  let s = String(name || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c]);
  s = s.split(/[^A-Za-z0-9_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.substring(1)).join('');
  if (!s) s = 'WinFormsUygulamasi';
  if (/^[0-9]/.test(s)) s = 'Proje' + s;
  return s.substring(0, 60);
}

export function isIdentifier(s) {
  return /^[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*$/.test(s || '') && !CS_KEYWORDS.has(s);
}

export const CS_KEYWORDS = new Set(('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while').split(' '));

export function programCs(ns, startForm = 'Form1') {
  return `using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ${ns}
{
    internal static class Program
    {
        /// <summary>
        /// Uygulamanın ana girdi noktası.
        /// </summary>
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new ${startForm}());
        }
    }
}
`;
}

export function formCs(ns, name) {
  return `using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ${ns}
{
    public partial class ${name} : Form
    {
        public ${name}()
        {
            InitializeComponent();
        }
    }
}
`;
}

export function classCs(ns, name) {
  return `using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ${ns}
{
    internal class ${name}
    {
    }
}
`;
}

export function newFormModel(name) {
  return {
    name,
    props: { Text: name, ClientSize: [800, 450] },
    events: {},
    controls: [],
    components: [],
  };
}

/** Projeye form ekler (kod dosyası + tasarım + Designer.cs). */
export function addForm(data, name) {
  const model = newFormModel(name);
  data.forms[name] = model;
  data.files.push({ name: `${name}.cs`, content: formCs(data.namespace, name) });
  data.files.push({ name: `${name}.Designer.cs`, content: generateDesigner(data.namespace, model), generated: true });
  return model;
}

export const TEMPLATES = [
  {
    id: 'bos',
    title: 'Windows Forms Uygulaması',
    desc: 'Boş bir form ile başlar.',
    create(ns) {
      const data = { format: 1, namespace: ns, files: [], forms: {} };
      data.files.push({ name: 'Program.cs', content: programCs(ns) });
      addForm(data, 'Form1');
      return data;
    },
  },
  {
    id: 'hesap',
    title: 'Örnek: Toplama İşlemi',
    desc: 'İki sayıyı toplayan hazır örnek (TextBox, Button, Label).',
    create(ns) {
      const data = TEMPLATES[0].create(ns);
      const f = data.forms.Form1;
      f.props.Text = 'Toplama';
      f.props.ClientSize = [320, 180];
      f.props.StartPosition = 'CenterScreen';
      f.controls = [
        { type: 'Label', name: 'lblSonuc', props: { AutoSize: true, Font: { name: 'Segoe UI', size: 12, style: ['Bold'] }, ForeColor: 'DarkBlue', Location: [24, 128], Size: [70, 21], Text: 'Sonuç:', TabIndex: 5 }, events: {} },
        { type: 'Button', name: 'btnTopla', props: { Location: [196, 76], Size: [100, 30], Text: 'Topla', TabIndex: 4, UseVisualStyleBackColor: true }, events: { Click: 'btnTopla_Click' } },
        { type: 'TextBox', name: 'txtSayi2', props: { Location: [100, 80], Size: [80, 23], TabIndex: 3 }, events: {} },
        { type: 'TextBox', name: 'txtSayi1', props: { Location: [100, 36], Size: [80, 23], TabIndex: 1 }, events: {} },
        { type: 'Label', name: 'label2', props: { AutoSize: true, Location: [24, 84], Size: [50, 15], Text: '2. sayı:', TabIndex: 2 }, events: {} },
        { type: 'Label', name: 'label1', props: { AutoSize: true, Location: [24, 40], Size: [50, 15], Text: '1. sayı:', TabIndex: 0 }, events: {} },
      ];
      f.props.AcceptButton = 'btnTopla';
      const code = data.files.find((x) => x.name === 'Form1.cs');
      code.content = code.content.replace(`            InitializeComponent();
        }
`, `            InitializeComponent();
        }

        private void btnTopla_Click(object sender, EventArgs e)
        {
            double sayi1 = Convert.ToDouble(txtSayi1.Text);
            double sayi2 = Convert.ToDouble(txtSayi2.Text);
            double toplam = sayi1 + sayi2;
            lblSonuc.Text = "Sonuç: " + toplam;
        }
`);
      data.files.find((x) => x.name === 'Form1.Designer.cs').content = generateDesigner(ns, f);
      return data;
    },
  },
  {
    id: 'veritabani',
    title: 'Veritabanı Uygulaması (okul.mdf)',
    desc: 'okul.mdf + OkulDataSet + 20 örnek öğrenci kaydı. Form, VS\'de alanlar forma sürüklendikten sonraki halidir (BindingNavigator, DataGridView, TextBox...).',
    create(ns) {
      const db = sampleDatabase();
      const { form, code } = databaseForm(ns, db);
      const data = { format: 1, namespace: ns, files: [], forms: { Form1: form }, database: db };
      data.files.push({ name: 'Program.cs', content: programCs(ns) });
      data.files.push({ name: 'Form1.cs', content: code });
      data.files.push({ name: 'Form1.Designer.cs', content: generateDesigner(ns, form, db), generated: true });
      data.files.push({ name: designerFileName(db), content: generateDataSet(ns, db), generated: true });
      return data;
    },
  },
  {
    id: 'konsol',
    title: 'Konsol Uygulaması',
    desc: 'Form olmadan, Console.WriteLine ile çıktı veren program.',
    create(ns) {
      return {
        format: 1,
        namespace: ns,
        forms: {},
        files: [{
          name: 'Program.cs',
          content: `using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ${ns}
{
    internal class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Merhaba Dünya!");

            for (int i = 1; i <= 5; i++)
            {
                Console.WriteLine(i + " x 7 = " + (i * 7));
            }
        }
    }
}
`,
        }],
      };
    },
  },
];
