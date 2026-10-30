// Veritabanı uygulaması şablonu: Visual Studio'da okul.mdf + OkulDataSet + "Veri Kaynakları"ndan
// alanları forma sürükledikten sonra oluşan form ile aynı nesneler (laboratuvarda yapılan adımların sonucu).
import { instanceName, tableAdapterName } from './datasetgen.js';

const AD = ['Ayşe', 'Mehmet', 'Elif', 'Can', 'Zeynep', 'Mustafa', 'İrem', 'Emre', 'Şule', 'Burak', 'Gizem', 'Oğuz', 'Merve', 'Ömer', 'Selin', 'İsmail', 'Büşra', 'Kaan', 'Ece', 'Yusuf'];
const SOYAD = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özdemir', 'Şimşek', 'Polat', 'Erdoğan'];
const ADRES = ['Atatürk Cad. No:12 Kadıköy/İstanbul', 'Cumhuriyet Mah. 45. Sok. No:3 Çankaya/Ankara', 'İnönü Bulv. No:88 Konak/İzmir',
  'Gazi Cad. No:7 Osmangazi/Bursa', 'Fatih Mah. Lale Sok. No:21 Seyhan/Adana', 'Barış Mah. No:5 Muratpaşa/Antalya',
  'Yeni Mah. Gül Sok. No:9 Selçuklu/Konya', 'Hürriyet Cad. No:30 Tepebaşı/Eskişehir', 'İstiklal Cad. No:101 Beyoğlu/İstanbul',
  'Kızılay Mah. No:14 Merkez/Sivas'];
const KIZ = new Set(['Ayşe', 'Elif', 'Zeynep', 'İrem', 'Şule', 'Gizem', 'Merve', 'Selin', 'Büşra', 'Ece']);

/** Ders notundaki okul.mdf / ogrenci tablosu + 20 örnek kayıt. */
export function sampleDatabase() {
  const rows = AD.map((ad, i) => [
    i + 1, ad, SOYAD[i], `(5${30 + (i * 7) % 70}) ${String(100 + (i * 37) % 900).padStart(3, '0')}-${String(1000 + (i * 271) % 9000).padStart(4, '0')}`,
    !KIZ.has(ad), ADRES[i % ADRES.length],
  ]);
  return {
    name: 'okul',
    dataSet: 'OkulDataSet',
    tables: [{
      name: 'ogrenci',
      columns: [
        { name: 'OgrenciID', type: 'int', nullable: false, pk: true, autoIncrement: true, seed: 1, step: 1 },
        { name: 'Ad', type: 'varchar', length: 50 },
        { name: 'Soyad', type: 'varchar', length: 50 },
        { name: 'Telefon', type: 'varchar', length: 50 },
        { name: 'Cinsiyet', type: 'bit' },
        { name: 'Adres', type: 'varchar', length: -1 },
      ],
      rows,
    }],
  };
}

/** "OgrenciID" → "Ogrenci ID:" (VS'nin Veri Kaynakları etiketleri gibi) */
export function fieldLabel(name) {
  return name.replace(/([a-zçğıöşü0-9])([A-ZÇĞİÖŞÜ])/g, '$1 $2').replace(/_/g, ' ') + ':';
}

/** "Ad" → "ad" (VS: adTextBox, adLabel) */
export function fieldPrefix(name) {
  return name.charAt(0).toLocaleLowerCase('tr-TR') + name.slice(1);
}

/** BindingNavigator'ın standart öğeleri (VS'nin eklediği adlarla). */
export function navigatorItems(withSaveName = null) {
  const btn = (name, text) => ({ type: 'ToolStripButton', name, props: { Text: text, DisplayStyle: 'Image' }, events: {} });
  const items = [
    btn('bindingNavigatorMoveFirstItem', 'İlkine taşı'),
    btn('bindingNavigatorMovePreviousItem', 'Öncekine taşı'),
    { type: 'ToolStripSeparator', name: 'bindingNavigatorSeparator', props: {}, events: {} },
    { type: 'ToolStripTextBox', name: 'bindingNavigatorPositionItem', props: { Text: '0', ToolTipText: 'Geçerli konum' }, events: {} },
    { type: 'ToolStripLabel', name: 'bindingNavigatorCountItem', props: { Text: '/{0}', ToolTipText: 'Toplam öğe sayısı' }, events: {} },
    { type: 'ToolStripSeparator', name: 'bindingNavigatorSeparator1', props: {}, events: {} },
    btn('bindingNavigatorMoveNextItem', 'Sonrakine taşı'),
    btn('bindingNavigatorMoveLastItem', 'Sona taşı'),
    { type: 'ToolStripSeparator', name: 'bindingNavigatorSeparator2', props: {}, events: {} },
    btn('bindingNavigatorAddNewItem', 'Yeni ekle'),
    btn('bindingNavigatorDeleteItem', 'Sil'),
  ];
  if (withSaveName) items.push(btn(withSaveName, 'Verileri Kaydet'));
  return items;
}

export function navigatorRefs() {
  return {
    AddNewItem: 'bindingNavigatorAddNewItem',
    DeleteItem: 'bindingNavigatorDeleteItem',
    MoveFirstItem: 'bindingNavigatorMoveFirstItem',
    MovePreviousItem: 'bindingNavigatorMovePreviousItem',
    MoveNextItem: 'bindingNavigatorMoveNextItem',
    MoveLastItem: 'bindingNavigatorMoveLastItem',
    PositionItem: 'bindingNavigatorPositionItem',
    CountItem: 'bindingNavigatorCountItem',
  };
}

/** Tablo sütunlarından DataGridView sütunları (dataGridViewTextBoxColumn1...). */
export function gridColumnsFor(table, taken = new Set()) {
  let tb = 1;
  let cb = 1;
  return table.columns.filter((c) => c.type !== 'image' && c.type !== 'varbinary').map((c) => {
    const isBit = c.type === 'bit';
    let name;
    do name = isBit ? `dataGridViewCheckBoxColumn${cb++}` : `dataGridViewTextBoxColumn${tb++}`; while (taken.has(name));
    taken.add(name);
    const props = { DataPropertyName: c.name, HeaderText: c.name, Width: 125 };
    if (c.identity) props.ReadOnly = true;
    return { name, type: isBit ? 'DataGridViewCheckBoxColumn' : 'DataGridViewTextBoxColumn', props };
  });
}

/** VS'de tablo ve alanlar forma sürüklendikten sonraki Form1 (tasarım + kod). */
export function databaseForm(ns, db) {
  const t = db.tables[0];
  const dsInst = instanceName(db.dataSet);
  const bs = `${t.name}BindingSource`;
  const ta = tableAdapterName(t);
  const nav = `${t.name}BindingNavigator`;
  const save = `${t.name}BindingNavigatorSaveItem`;
  const grid = `${t.name}DataGridView`;
  const controls = [];
  const labels = [];
  let y = 248;
  let tab = 2;
  for (const c of t.columns) {
    const p = fieldPrefix(c.name);
    if (c.type === 'image' || c.type === 'varbinary') continue;
    labels.push({ type: 'Label', name: `${p}Label`, props: { Text: fieldLabel(c.name), AutoSize: true, Location: [20, y + 3], Size: [60, 15], TabIndex: tab++ }, events: {} });
    if (c.type === 'bit') {
      controls.push({ type: 'CheckBox', name: `${p}CheckBox`, props: { Text: 'checkBox1', Location: [110, y], Size: [200, 24], TabIndex: tab++, UseVisualStyleBackColor: true, DataBindings: { CheckState: `${bs}.${c.name}` } }, events: {} });
    } else if (/telefon/i.test(c.name)) {
      controls.push({ type: 'MaskedTextBox', name: `${p}MaskedTextBox`, props: { Location: [110, y], Size: [200, 23], TabIndex: tab++, DataBindings: { Text: `${bs}.${c.name}` } }, events: {} });
    } else {
      controls.push({ type: 'TextBox', name: `${p}TextBox`, props: { Location: [110, y], Size: [200, 23], TabIndex: tab++, DataBindings: { Text: `${bs}.${c.name}` } }, events: {} });
    }
    y += 30;
  }
  const items = navigatorItems(save);
  const saveItem = items.find((i) => i.name === save);
  saveItem.events.Click = `${save}_Click`;
  const form = {
    name: 'Form1',
    props: { Text: 'Form1', ClientSize: [640, Math.max(450, y + 20)] },
    events: { Load: 'Form1_Load' },
    components: [
      { type: 'TypedDataSet', name: dsInst, props: { DataSetName: db.dataSet, SchemaSerializationMode: 'IncludeSchema' }, events: {} },
      { type: 'BindingSource', name: bs, props: { DataMember: t.name, DataSource: dsInst }, events: {} },
      { type: 'TableAdapter', name: ta, props: { Table: t.name, ClearBeforeFill: true }, events: {} },
      { type: 'TableAdapterManager', name: 'tableAdapterManager', props: { BackupDataSetBeforeUpdate: false, AdapterRef: { [ta]: ta }, UpdateOrder: 'InsertUpdateDelete' }, events: {} },
    ],
    controls: [
      ...controls.reverse(), ...labels.reverse(),
      {
        type: 'DataGridView', name: grid,
        props: {
          AutoGenerateColumns: false, ColumnHeadersHeightSizeMode: 'AutoSize', DataSource: bs, Location: [12, 40], Size: [616, 190], TabIndex: 1, RowHeadersWidth: 51,
          Columns: gridColumnsFor(t),
        },
        events: {},
      },
      {
        type: 'BindingNavigator', name: nav,
        props: { Text: 'bindingNavigator1', Dock: 'Top', Location: [0, 0], Size: [640, 27], TabIndex: 0, BindingSourceRef: bs, StripItems: items, ...navigatorRefs() },
        events: {},
      },
    ],
  };
  const code = `using System;
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
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }

        private void ${save}_Click(object sender, EventArgs e)
        {
            this.Validate();
            this.${bs}.EndEdit();
            this.tableAdapterManager.UpdateAll(this.${dsInst});

        }

        private void Form1_Load(object sender, EventArgs e)
        {
            // TODO: Bu kod satırı '${dsInst}.${t.name}' tablosuna veri yükler. Bunu gerektiği şekilde taşıyabilir, veya kaldırabilirsiniz.
            this.${ta}.Fill(this.${dsInst}.${t.name});

        }
    }
}
`;
  return { form, code };
}
