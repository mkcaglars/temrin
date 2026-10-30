namespace Tests
{
    /// <summary>"DataGridView — Uygulama 2: Kurs Takip Sistemi" belgesindeki kod (değiştirilmeden).</summary>
    public static class KursTakip
    {
        public const string Form1 = @"using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace KursTakip
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }

 private void Form1_Load(object sender, EventArgs e)
 {
      // Sütunları oluştur (manuel de yapılabilir)
      dataGridView1.ColumnCount = 4;
      dataGridView1.Columns[0].Name = ""colID"";
      dataGridView1.Columns[0].HeaderText = ""ID"";
      dataGridView1.Columns[1].Name = ""colAd"";
      dataGridView1.Columns[1].HeaderText = ""Öğrenci Adı"";
      dataGridView1.Columns[2].Name = ""colKurs"";
      dataGridView1.Columns[2].HeaderText = ""Kurs"";
      dataGridView1.Columns[3].Name = ""colNot"";
      dataGridView1.Columns[3].HeaderText = ""Not"";


      // Görsel ayarları yap.
      dataGridView1.AutoSizeColumnsMode =
           DataGridViewAutoSizeColumnsMode.Fill;
      dataGridView1.SelectionMode =
           DataGridViewSelectionMode.FullRowSelect;


      // örnek veri
      dataGridView1.Rows.Add(""1"", ""Ayşe Kılıç"", ""C#"", ""88"");
      dataGridView1.Rows.Add(""2"", ""Murat Çelik"", ""Java"", ""74"");
      dataGridView1.Rows.Add(""3"", ""Elif Demir"", ""PHP"", ""95"");
 }

 private void btnEkle_Click(object sender, EventArgs e)
 {
  // boş textbox var mı (kolay yaklaşım, isNullOrEmpty de kullanılabilir)
      if (txtAd.Text == """" || txtKurs.Text == """" || txtNot.Text == """")
      {
           MessageBox.Show(""Lütfen tüm alanları doldurun!"");
           return;
      }
  // her veri eklediğinde ros sayısından 1 fazla otomatik id artsın

      int yeniID = dataGridView1.Rows.Count + 1;
      dataGridView1.Rows.Add(
           yeniID.ToString(),
           txtAd.Text,
           txtKurs.Text,
           txtNot.Text
      );


      // TextBox'ları temizle
      txtAd.Clear(); txtKurs.Clear(); txtNot.Clear();
      OrtalamaHesapla();
 }

 private void dataGridView1_CellClick(object sender,
       DataGridViewCellEventArgs e) {
       if (e.RowIndex >= 0) {
            DataGridViewRow row = dataGridView1.Rows[e.RowIndex];

            txtAd.Text      = row.Cells[""colAd""].Value?.ToString();

            txtKurs.Text = row.Cells[""colKurs""].Value?.ToString();

            txtNot.Text = row.Cells[""colNot""].Value?.ToString();

       }
 }

 private void btnGuncelle_Click(object sender, EventArgs e)
 {
       if (dataGridView1.SelectedRows.Count == 0)
       {
            MessageBox.Show(""Lütfen güncellenecek satırı seçin!"");
            return;
       }
       int index = dataGridView1.SelectedRows[0].Index;
       dataGridView1.Rows[index].Cells[""colAd""].Value                       = txtAd.Text;
       dataGridView1.Rows[index].Cells[""colKurs""].Value = txtKurs.Text;
       dataGridView1.Rows[index].Cells[""colNot""].Value                      = txtNot.Text;
       OrtalamaHesapla();
 }

 private void btnSil_Click(object sender, EventArgs e)
 {
       if (dataGridView1.SelectedRows.Count > 0)
       {
             int index = dataGridView1.SelectedRows[0].Index;
             dataGridView1.Rows.RemoveAt(index);
       }
       else
       {
             MessageBox.Show(""Silinecek bir satır seçin!"");
       }
       OrtalamaHesapla();
 }

 private void txtArama_TextChanged(object sender, EventArgs e)
 {
      string aranan = txtArama.Text.ToLower();
      // Her satırı tek tek kontrol et
      foreach (DataGridViewRow satir in dataGridView1.Rows) {
          // altta boş satır varsa devam et
          if (satir.IsNewRow) continue;
          // O satırdaki ad ve kurs bilgilerini oku
          string ad      = satir.Cells[""colAd""].Value.ToString().ToLower();
          string kurs = satir.Cells[""colKurs""].Value.ToString().ToLower();

          // aranan isimde veya kursta geçiyor mu?
          if (ad.Contains(aranan) || kurs.Contains(aranan)) {
                // satırı sarıya boya
               satir.DefaultCellStyle.BackColor = Color.LightYellow;
               satir.DefaultCellStyle.ForeColor = Color.Black;
          }
          else {
               // satırı soluklaştır
               satir.DefaultCellStyle.BackColor = Color.LightGray;
               satir.DefaultCellStyle.ForeColor = Color.Gray;
          }
      }
 }

        private void btnTemizle_Click(object sender, EventArgs e)
        {
            txtArama.Text = """";
        }

        void OrtalamaHesapla()
        {
            double toplam = 0;
            int sayi = 0;
            foreach (DataGridViewRow satir in dataGridView1.Rows)
            {
                if (satir.IsNewRow) continue;
                toplam += Convert.ToDouble(satir.Cells[""colNot""].Value);
                sayi++;
            }
            lblOrtalama.Text = sayi > 0 ? ""Ortalama: "" + (toplam / sayi).ToString(""0.00"") : ""Ortalama: -"";
        }
    }
}
";

        public const string Designer = @"namespace KursTakip
{
    partial class Form1
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        private void InitializeComponent()
        {
            this.dataGridView1 = new System.Windows.Forms.DataGridView();
            this.txtAd = new System.Windows.Forms.TextBox();
            this.txtKurs = new System.Windows.Forms.TextBox();
            this.txtNot = new System.Windows.Forms.TextBox();
            this.txtArama = new System.Windows.Forms.TextBox();
            this.btnEkle = new System.Windows.Forms.Button();
            this.btnGuncelle = new System.Windows.Forms.Button();
            this.btnSil = new System.Windows.Forms.Button();
            this.btnTemizle = new System.Windows.Forms.Button();
            this.lblOrtalama = new System.Windows.Forms.Label();
            ((System.ComponentModel.ISupportInitialize)(this.dataGridView1)).BeginInit();
            this.SuspendLayout();
            //
            // dataGridView1
            //
            this.dataGridView1.ColumnHeadersHeightSizeMode = System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode.AutoSize;
            this.dataGridView1.Location = new System.Drawing.Point(12, 12);
            this.dataGridView1.Name = ""dataGridView1"";
            this.dataGridView1.RowHeadersWidth = 51;
            this.dataGridView1.Size = new System.Drawing.Size(460, 200);
            this.dataGridView1.TabIndex = 0;
            this.dataGridView1.CellClick += new System.Windows.Forms.DataGridViewCellEventHandler(this.dataGridView1_CellClick);
            this.txtAd.Location = new System.Drawing.Point(12, 230);
            this.txtAd.Name = ""txtAd"";
            this.txtKurs.Location = new System.Drawing.Point(12, 260);
            this.txtKurs.Name = ""txtKurs"";
            this.txtNot.Location = new System.Drawing.Point(12, 290);
            this.txtNot.Name = ""txtNot"";
            this.txtArama.Location = new System.Drawing.Point(300, 230);
            this.txtArama.Name = ""txtArama"";
            this.txtArama.TextChanged += new System.EventHandler(this.txtArama_TextChanged);
            this.btnEkle.Location = new System.Drawing.Point(150, 230);
            this.btnEkle.Name = ""btnEkle"";
            this.btnEkle.Text = ""Ekle"";
            this.btnEkle.Click += new System.EventHandler(this.btnEkle_Click);
            this.btnGuncelle.Location = new System.Drawing.Point(150, 260);
            this.btnGuncelle.Name = ""btnGuncelle"";
            this.btnGuncelle.Text = ""Güncelle"";
            this.btnGuncelle.Click += new System.EventHandler(this.btnGuncelle_Click);
            this.btnSil.Location = new System.Drawing.Point(150, 290);
            this.btnSil.Name = ""btnSil"";
            this.btnSil.Text = ""Sil"";
            this.btnSil.Click += new System.EventHandler(this.btnSil_Click);
            this.btnTemizle.Location = new System.Drawing.Point(300, 260);
            this.btnTemizle.Name = ""btnTemizle"";
            this.btnTemizle.Text = ""Aramayı Temizle"";
            this.btnTemizle.Click += new System.EventHandler(this.btnTemizle_Click);
            this.lblOrtalama.Location = new System.Drawing.Point(300, 300);
            this.lblOrtalama.Name = ""lblOrtalama"";
            this.lblOrtalama.AutoSize = true;
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(484, 330);
            this.Controls.Add(this.lblOrtalama);
            this.Controls.Add(this.btnTemizle);
            this.Controls.Add(this.btnSil);
            this.Controls.Add(this.btnGuncelle);
            this.Controls.Add(this.btnEkle);
            this.Controls.Add(this.txtArama);
            this.Controls.Add(this.txtNot);
            this.Controls.Add(this.txtKurs);
            this.Controls.Add(this.txtAd);
            this.Controls.Add(this.dataGridView1);
            this.Name = ""Form1"";
            this.Text = ""Kurs Takip"";
            this.Load += new System.EventHandler(this.Form1_Load);
            ((System.ComponentModel.ISupportInitialize)(this.dataGridView1)).EndInit();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        #endregion

        private System.Windows.Forms.DataGridView dataGridView1;
        private System.Windows.Forms.TextBox txtAd;
        private System.Windows.Forms.TextBox txtKurs;
        private System.Windows.Forms.TextBox txtNot;
        private System.Windows.Forms.TextBox txtArama;
        private System.Windows.Forms.Button btnEkle;
        private System.Windows.Forms.Button btnGuncelle;
        private System.Windows.Forms.Button btnSil;
        private System.Windows.Forms.Button btnTemizle;
        private System.Windows.Forms.Label lblOrtalama;
    }
}
";

        public const string Program = @"using System;
using System.Windows.Forms;

namespace KursTakip
{
    internal static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new Form1());
        }
    }
}
";
    }
}
