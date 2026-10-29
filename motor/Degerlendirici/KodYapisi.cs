using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Temrin.Motor
{
    /// <summary>Sözdizimi ağacı üzerinde kontroller: olay metodu bulma, döngü/karar yapısı, kod parçası arama.</summary>
    internal sealed class KodYapisi
    {
        readonly List<SyntaxTree> agaclar;

        public KodYapisi(IEnumerable<(string ad, string icerik)> dosyalar)
        {
            agaclar = dosyalar.Select(d => CSharpSyntaxTree.ParseText(d.icerik ?? "", path: d.ad)).ToList();
        }

        IEnumerable<SyntaxNode> Kokler => agaclar.Select(a => a.GetRoot());

        /// <summary>
        /// Hedefin kod düğümleri: "*" → tüm proje; "btnFor.Click" → tasarımcıda bağlanan olay metodu;
        /// "Hesapla" → o adlı metot. Olay metodunun aynı sınıfta çağırdığı metotlar da (3 kademe) dahil edilir.
        /// Bulunamazsa null.
        /// </summary>
        public List<SyntaxNode> Hedef(string hedef, out string neden)
        {
            neden = "";
            hedef = (hedef ?? "").Trim();
            if (hedef == "" || hedef == "*") return Kokler.ToList();

            var baslangic = new List<SyntaxNode>();
            string metotAdi = hedef;
            int nokta = hedef.LastIndexOf('.');
            if (nokta > 0)
            {
                string kontrol = hedef[..nokta], olay = hedef[(nokta + 1)..];
                var baglanti = OlayBaglantisi(kontrol, olay);
                if (baglanti == null)
                {
                    neden = $"{kontrol} düğmesinin {olay} olayına bağlı bir metot yok.";
                    return null;
                }
                if (baglanti is AnonymousFunctionExpressionSyntax lambda) baslangic.Add(lambda.Body);
                else metotAdi = MetotAdi(baglanti);
            }
            if (baslangic.Count == 0)
            {
                var m = Metotlar(metotAdi).ToList();
                if (m.Count == 0)
                {
                    neden = $"{metotAdi} metodu bulunamadı.";
                    return null;
                }
                baslangic.AddRange(m);
            }

            // Olay metodunun çağırdığı (aynı projedeki) metotlar da sayılır.
            var sonuc = new List<SyntaxNode>(baslangic);
            var gorulen = new HashSet<string>(StringComparer.Ordinal) { metotAdi };
            var kuyruk = new Queue<(SyntaxNode dugum, int derinlik)>(baslangic.Select(b => (b, 0)));
            while (kuyruk.Count > 0)
            {
                var (d, derinlik) = kuyruk.Dequeue();
                if (derinlik >= 3) continue;
                foreach (var cagri in d.DescendantNodesAndSelf().OfType<InvocationExpressionSyntax>())
                {
                    string ad = cagri.Expression switch
                    {
                        IdentifierNameSyntax i => i.Identifier.ValueText,
                        MemberAccessExpressionSyntax { Expression: ThisExpressionSyntax } ma => ma.Name.Identifier.ValueText,
                        _ => null,
                    };
                    if (ad == null || !gorulen.Add(ad)) continue;
                    foreach (var m in Metotlar(ad))
                    {
                        sonuc.Add(m);
                        kuyruk.Enqueue((m, derinlik + 1));
                    }
                }
            }
            return sonuc;
        }

        IEnumerable<MethodDeclarationSyntax> Metotlar(string ad) =>
            Kokler.SelectMany(k => k.DescendantNodes().OfType<MethodDeclarationSyntax>()).Where(m => m.Identifier.ValueText == ad);

        /// <summary>"this.btnFor.Click += ..." atamasının sağ tarafı.</summary>
        ExpressionSyntax OlayBaglantisi(string kontrol, string olay)
        {
            foreach (var a in Kokler.SelectMany(k => k.DescendantNodes().OfType<AssignmentExpressionSyntax>()))
            {
                if (!a.IsKind(SyntaxKind.AddAssignmentExpression)) continue;
                if (a.Left is not MemberAccessExpressionSyntax sol || sol.Name.Identifier.ValueText != olay) continue;
                string nesne = sol.Expression switch
                {
                    IdentifierNameSyntax i => i.Identifier.ValueText,
                    MemberAccessExpressionSyntax ma => ma.Name.Identifier.ValueText,
                    ThisExpressionSyntax => "this",
                    _ => null,
                };
                bool formOlayi = (kontrol == "this" || kontrol == "Form") && nesne == "this";
                if (nesne != kontrol && !formOlayi) continue;
                return a.Right is ObjectCreationExpressionSyntax oc && oc.ArgumentList?.Arguments.Count == 1
                    ? oc.ArgumentList.Arguments[0].Expression
                    : a.Right;
            }
            return null;
        }

        static string MetotAdi(ExpressionSyntax e) => e switch
        {
            IdentifierNameSyntax i => i.Identifier.ValueText,
            MemberAccessExpressionSyntax ma => ma.Name.Identifier.ValueText,
            _ => e.ToString(),
        };

        static readonly Dictionary<string, (string ad, Func<SyntaxNode, bool> var)> Yapilar = new(StringComparer.OrdinalIgnoreCase)
        {
            ["for"] = ("for döngüsü", n => n is ForStatementSyntax),
            ["while"] = ("while döngüsü", n => n is WhileStatementSyntax),
            ["do"] = ("do-while döngüsü", n => n is DoStatementSyntax),
            ["do-while"] = ("do-while döngüsü", n => n is DoStatementSyntax),
            ["foreach"] = ("foreach döngüsü", n => n is ForEachStatementSyntax or ForEachVariableStatementSyntax),
            ["break"] = ("break", n => n is BreakStatementSyntax),
            ["continue"] = ("continue", n => n is ContinueStatementSyntax),
            ["if"] = ("if karar yapısı", n => n is IfStatementSyntax),
            ["else"] = ("else", n => n is ElseClauseSyntax),
            ["else if"] = ("else if", n => n is ElseClauseSyntax { Statement: IfStatementSyntax }),
            ["switch"] = ("switch", n => n is SwitchStatementSyntax or SwitchExpressionSyntax),
            ["try"] = ("try-catch", n => n is TryStatementSyntax),
            ["return"] = ("return", n => n is ReturnStatementSyntax),
        };

        public static bool BilinenYapi(string ad) => Yapilar.ContainsKey(ad.Trim());

        /// <summary>Beklenen yapıların ("for" ya da "if;else") hepsi hedefte var mı? Yoksa eksik olanları döndürür.</summary>
        public static List<string> EksikYapilar(IEnumerable<SyntaxNode> dugumler, string beklenen)
        {
            var liste = dugumler.ToList();
            var eksik = new List<string>();
            foreach (var parca in beklenen.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (!Yapilar.TryGetValue(parca, out var y)) { eksik.Add($"bilinmeyen yapı '{parca}'"); continue; }
                bool var = liste.Any(d => y.var(d) || d.DescendantNodes().Any(y.var));
                if (!var) eksik.Add(y.ad);
            }
            return eksik;
        }

        /// <summary>Kod parçası, boşluklar yok sayılarak hedefte geçiyor mu?</summary>
        public static bool Iceriyor(IEnumerable<SyntaxNode> dugumler, string parca)
        {
            string aranan = Sikistir(parca);
            if (aranan == "") return true;
            return dugumler.Any(d => Sikistir(YorumsuzMetin(d)).Contains(aranan, StringComparison.Ordinal));
        }

        static string YorumsuzMetin(SyntaxNode d) =>
            string.Concat(d.DescendantTokens().Select(t => t.Text));

        static string Sikistir(string s) => new string((s ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray());
    }
}
