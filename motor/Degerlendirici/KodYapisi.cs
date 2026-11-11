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

        static readonly System.Text.RegularExpressions.Regex VeyaAyrac =
            new(@"\s*\|\s*|\s+veya\s+", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        /// <summary>
        /// Beklenen yapıları denetler. ";" grupları ayırır (her grup ayrı puanlanır), grup içinde "|" ya da "veya"
        /// eşdeğer seçenekleri ayırır: "for|foreach|while; break" → döngülerden biri VE break.
        /// Sözdizimi ağacına bakıldığı için boşluk, süslü parantez yeri ve değişken adları önemsizdir.
        /// </summary>
        public static (int grup, List<string> eksik) YapiDenetle(IEnumerable<SyntaxNode> dugumler, string beklenen)
        {
            var liste = dugumler.ToList();
            var eksik = new List<string>();
            var gruplar = (beklenen ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var grup in gruplar)
            {
                var secenekler = VeyaAyrac.Split(grup).Select(s => s.Trim()).Where(s => s != "").ToList();
                bool var = false;
                var adlar = new List<string>();
                foreach (var s in secenekler)
                {
                    if (!Yapilar.TryGetValue(s, out var y)) { adlar.Add($"bilinmeyen yapı '{s}'"); continue; }
                    adlar.Add(y.ad);
                    if (liste.Any(d => y.var(d) || d.DescendantNodes().Any(y.var))) { var = true; break; }
                }
                if (!var) eksik.Add(string.Join(" / ", adlar.Distinct()));
            }
            return (gruplar.Length, eksik);
        }

        /// <summary>Tasarımcıda bu olaya bağlanan (nesne adı, metot adı) çiftleri: btnKes.Click += btnBreak_Click → ("btnKes", "btnBreak_Click").</summary>
        public IEnumerable<(string nesne, string metot)> OlayMetotlari(string olay)
        {
            foreach (var a in Kokler.SelectMany(k => k.DescendantNodes().OfType<AssignmentExpressionSyntax>()))
            {
                if (!a.IsKind(SyntaxKind.AddAssignmentExpression)) continue;
                if (a.Left is not MemberAccessExpressionSyntax sol || sol.Name.Identifier.ValueText != olay) continue;
                string nesne = sol.Expression switch
                {
                    IdentifierNameSyntax i => i.Identifier.ValueText,
                    MemberAccessExpressionSyntax ma => ma.Name.Identifier.ValueText,
                    _ => null,
                };
                var sag = a.Right is ObjectCreationExpressionSyntax oc && oc.ArgumentList?.Arguments.Count == 1 ? oc.ArgumentList.Arguments[0].Expression : a.Right;
                if (nesne != null && sag is not AnonymousFunctionExpressionSyntax) yield return (nesne, MetotAdi(sag));
            }
        }

        /// <summary>Tasarımcıda bu olaya (ör. Click) bağlanan nesnelerin adları.</summary>
        public IEnumerable<string> OlayBaglantiAdlari(string olay)
        {
            foreach (var a in Kokler.SelectMany(k => k.DescendantNodes().OfType<AssignmentExpressionSyntax>()))
            {
                if (!a.IsKind(SyntaxKind.AddAssignmentExpression)) continue;
                if (a.Left is not MemberAccessExpressionSyntax sol || sol.Name.Identifier.ValueText != olay) continue;
                switch (sol.Expression)
                {
                    case IdentifierNameSyntax i: yield return i.Identifier.ValueText; break;
                    case MemberAccessExpressionSyntax ma: yield return ma.Name.Identifier.ValueText; break;
                }
            }
        }

        /// <summary>
        /// Kod parçası hedefte geçiyor mu? Boşluklar ve "this." yok sayılır. Seçenekler "veya" ya da satır sonuyla
        /// ayrılır; biri yeterlidir. Ad konumundaki "*" herhangi bir adı karşılar: "*.Items.Clear()".
        /// </summary>
        public static bool Iceriyor(IEnumerable<SyntaxNode> dugumler, string parca)
        {
            var secenekler = System.Text.RegularExpressions.Regex.Split(parca ?? "", @"\r?\n|\s+veya\s+")
                .Select(s => s.Trim()).Where(s => s != "").ToList();
            if (secenekler.Count == 0) return true;
            var metinler = dugumler.Select(d => ThisSiz(Sikistir(YorumsuzMetin(d)))).ToList();
            return secenekler.Any(s =>
            {
                var desen = Desen(ThisSiz(Sikistir(s)));
                return metinler.Any(m => desen.IsMatch(m));
            });
        }

        static string ThisSiz(string s) => s.Replace("this.", "", StringComparison.Ordinal);

        /// <summary>Sıkıştırılmış kod parçasından düzenli ifade: ad konumundaki "*" bir C# adı olur, gerisi aynen aranır.</summary>
        static System.Text.RegularExpressions.Regex Desen(string s)
        {
            var sb = new System.Text.StringBuilder();
            for (int i = 0; i < s.Length; i++)
            {
                char onceki = i > 0 ? s[i - 1] : '\0';
                bool adKonumu = s[i] == '*' && !(char.IsLetterOrDigit(onceki) || onceki == '_' || onceki == ')' || onceki == ']');
                sb.Append(adKonumu ? @"[\p{L}_][\p{L}\p{N}_]*" : System.Text.RegularExpressions.Regex.Escape(s[i].ToString()));
            }
            return new System.Text.RegularExpressions.Regex(sb.ToString());
        }

        static string YorumsuzMetin(SyntaxNode d) =>
            string.Concat(d.DescendantTokens().Select(t => t.Text));

        static string Sikistir(string s) => new string((s ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray());
    }
}
