using System.Data;
using System.Windows.Forms;
using CLesson.Compiler;
using MiniWinForms;
using Xunit;

namespace Tests
{
    [Collection("ui")]
    public class MySqlTests
    {
        const string Program = @"using System;
using System.Windows.Forms;
namespace Deneme
{
    internal static class Program
    {
        [STAThread]
        static void Main() { Application.Run(new Form1()); }
    }
}";

        static string FormCode(string body) => @"using System;
using System.Data;
using System.Configuration;
using System.Windows.Forms;
using MySql.Data.MySqlClient;
namespace Deneme
{
    public partial class Form1 : Form
    {
        public Label sonuc = new Label();
        public DataGridView grid = new DataGridView();
        public Form1()
        {
            sonuc.Name = ""sonuc""; grid.Name = ""grid""; Controls.Add(sonuc); Controls.Add(grid);
            try { " + body + @" }
            catch (MySqlException ex) { sonuc.Text = ""HATA "" + ex.Number + "": "" + ex.Message; }
        }
    }
}";

        static ProjectInput Project(string body, params string[] refs)
        {
            var p = new ProjectInput { Name = "Deneme", Namespace = "Deneme" };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = Program });
            p.Files.Add(new ProjectFile { Name = "Form1.cs", Content = FormCode(body) });
            p.References.AddRange(refs);
            p.DataFiles.Add(new ProjectFile { Name = "App.config", Content = "<?xml version=\"1.0\"?><configuration><connectionStrings><add name=\"baglanti\" connectionString=\"Server=localhost;Database=sirketdb;Uid=root;Pwd=1234;\" /></connectionStrings></configuration>" });
            return p;
        }

        /// <summary>Simülatörün yerine geçen sahte sunucu: tek tablolu personel.</summary>
        static string Fake(string op, string json)
        {
            if (op == "open") return json.Contains("Pwd=1234") ? "{\"id\":1,\"version\":\"8.0.36\",\"database\":\"sirketdb\"}" : "{\"error\":{\"code\":1045,\"message\":\"Access denied for user 'root'@'localhost' (using password: YES)\"}}";
            if (op == "close") return "{}";
            if (op == "routine") return json.Contains("ort") ? "{\"name\":\"`sirketdb`.`ort`\",\"params\":[{\"name\":\"p_sinif\",\"mode\":\"IN\"},{\"name\":\"p_ort\",\"mode\":\"OUT\"}]}" : "{\"error\":{\"code\":1305,\"message\":\"PROCEDURE sirketdb.yok does not exist\"}}";
            if (json.Contains("CALL ") && json.Contains("ort\\u0060(@p_sinif, @_cnet_p_ort); SELECT @_cnet_p_ort"))
                return "{\"results\":[{\"columns\":[{\"name\":\"ad\",\"type\":\"varchar\"}],\"rows\":[[\"Ali\"],[\"Ayşe\"]]},{\"affected\":0},{\"columns\":[{\"name\":\"@_cnet_p_ort\",\"type\":\"decimal\",\"scale\":2}],\"rows\":[[80.5]]}]}";
            if (json.Contains("COUNT")) return "{\"results\":[{\"columns\":[{\"name\":\"COUNT(*)\",\"type\":\"bigint\"}],\"rows\":[[2]]}]}";
            if (json.Contains("SELECT")) return "{\"results\":[{\"columns\":[{\"name\":\"personel_id\",\"type\":\"int\",\"table\":\"personel\",\"column\":\"personel_id\",\"pk\":true},{\"name\":\"ad\",\"type\":\"varchar\"},{\"name\":\"maas\",\"type\":\"decimal\",\"scale\":2},{\"name\":\"giris\",\"type\":\"date\"}],\"rows\":[[1,\"Ali\",9500.5,\"2020-01-02\"],[2,\"Ayşe\",null,\"2021-03-04\"]]}]}";
            if (json.Contains("INSERT")) return json.Contains("\"name\":\"ad\"") ? "{\"results\":[{\"affected\":1,\"insertId\":3}]}" : "{\"error\":{\"code\":1048,\"message\":\"Column 'ad' cannot be null\"}}";
            return "{\"error\":{\"code\":1064,\"message\":\"syntax\"}}";
        }

        static Form1Like Run(ProjectInput p)
        {
            var b = new NullBackend { SqlHandler = Fake };
            Ui.Backend = b;
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.CurrentUICulture = new System.Globalization.CultureInfo("tr-TR");
            var r = new ProjectCompiler().Build(p);
            Assert.True(r.Success, string.Join("\n", r.Diagnostics.Select(d => d.Line + ": " + d.Message)));
            ProgramRunner.Run(r.Assembly, r.Pdb, r.DataFiles);
            var f = Application.OpenForms[0];
            return new Form1Like(f);
        }

        sealed class Form1Like
        {
            public Form1Like(Form f) { Form = f; }
            public Form Form { get; }
            public string Sonuc => Form.Controls.Find("sonuc", true)[0].Text;
            public DataGridView Grid => (DataGridView)Form.Controls.Find("grid", true)[0];
        }

        [Fact]
        public void WithoutReferenceMySqlNamespaceIsMissing()
        {
            var r = new ProjectCompiler().Build(Project("var c = new MySqlConnection();"));
            Assert.False(r.Success);
            Assert.Contains(r.Diagnostics, d => d.Code == "CS0246" && d.Message.Contains("MySql"));
        }

        [Fact]
        public void ReaderScalarAndAdapterWork()
        {
            var f = Run(Project(@"
                string cs = ConfigurationManager.ConnectionStrings[""baglanti""].ConnectionString;
                using (var baglanti = new MySqlConnection(cs))
                {
                    baglanti.Open();
                    var komut = new MySqlCommand(""SELECT COUNT(*) FROM personel"", baglanti);
                    long n = (long)komut.ExecuteScalar();
                    var oku = new MySqlCommand(""SELECT * FROM personel"", baglanti).ExecuteReader();
                    string s = n + "":"";
                    while (oku.Read()) s += oku[""ad""] + ""="" + (oku.IsDBNull(2) ? ""yok"" : oku.GetDecimal(2).ToString()) + "";"" + ((DateTime)oku[""giris""]).Year + "","";
                    oku.Close();
                    var ekle = new MySqlCommand(""INSERT INTO personel (ad) VALUES (@ad)"", baglanti);
                    ekle.Parameters.AddWithValue(""@ad"", ""Can"");
                    s += ""|"" + ekle.ExecuteNonQuery() + "":"" + ekle.LastInsertedId;
                    sonuc.Text = s;
                }
                var dt = new DataTable();
                new MySqlDataAdapter(""SELECT * FROM personel"", cs).Fill(dt);
                grid.DataSource = dt;
                sonuc.Text += ""|"" + dt.Rows.Count + "":"" + (dt.Columns[""maas""].DataType == typeof(decimal) ? ""Decimal"" : ""?"");", "MySql.Data"));
            Assert.Equal("2:Ali=9500,50;2020,Ayşe=yok;2021,|1:3|2:Decimal", f.Sonuc);
            Assert.Equal(2, f.Grid.Rows.Count - (f.Grid.AllowUserToAddRows ? 1 : 0));
        }

        [Fact]
        public void WrongPasswordThrowsMySqlException()
        {
            var f = Run(Project(@"var c = new MySqlConnection(""Server=localhost;Database=sirketdb;Uid=root;Pwd=yanlis;""); c.Open();", "MySql.Data"));
            Assert.StartsWith("HATA 1045: Access denied", f.Sonuc);
        }

        [Fact]
        public void ExecuteWithoutOpenThrowsInvalidOperation()
        {
            var f = Run(Project(@"try { var c = new MySqlConnection(""Server=localhost;Pwd=1234""); new MySqlCommand(""SELECT 1"", c).ExecuteNonQuery(); } catch (InvalidOperationException ex) { sonuc.Text = ex.Message; }", "MySql.Data"));
            Assert.Equal("Connection must be valid and open.", f.Sonuc);
        }
    
        [Fact]
        public void StoredProcedureCommandBuildsCallAndReadsOutParameters()
        {
            var f = Run(Project(@"
                using (var c = new MySqlConnection(ConfigurationManager.ConnectionStrings[""baglanti""].ConnectionString))
                {
                    c.Open();
                    var k = new MySqlCommand(""ort"", c) { CommandType = CommandType.StoredProcedure };
                    k.Parameters.AddWithValue(""@p_sinif"", ""10A"");
                    k.Parameters.Add(""@p_ort"", MySqlDbType.Decimal).Direction = ParameterDirection.Output;
                    var r = k.ExecuteReader();
                    string s = """";
                    while (r.Read()) s += r.GetString(0) + "","";
                    r.Close();
                    sonuc.Text = s + k.Parameters[""@p_ort""].Value;
                    var y = new MySqlCommand(""yok"", c) { CommandType = CommandType.StoredProcedure };
                    try { y.ExecuteNonQuery(); } catch (MySqlException ex) { sonuc.Text += ""|"" + ex.Number; }
                }", "MySql.Data"));
            Assert.Equal("Ali,Ayşe,80,50|1305", f.Sonuc);
        }
    }
}
