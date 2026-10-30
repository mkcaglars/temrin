using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CLesson.Compiler
{
    /// <summary>Kod editörü için otomatik tamamlama (IntelliSense) önerileri.</summary>
    public static class Completion
    {
        static readonly string[] keywords =
        {
            "abstract", "as", "async", "await", "base", "bool", "break", "byte", "case", "catch", "char", "class", "const", "continue",
            "decimal", "default", "do", "double", "else", "enum", "false", "finally", "float", "for", "foreach", "if", "in", "int",
            "interface", "internal", "is", "long", "namespace", "new", "null", "object", "out", "override", "private", "protected",
            "public", "readonly", "ref", "return", "short", "static", "string", "struct", "switch", "this", "throw", "true", "try",
            "typeof", "using", "var", "virtual", "void", "while", "partial", "get", "set", "value",
        };

        public static List<CompletionItemInfo> GetItems(ProjectCompiler compiler, ProjectInput project, string fileName, int position)
        {
            var comp = compiler.Update(project);
            var tree = compiler.TreeOf(fileName);
            if (tree == null) return new();
            var model = comp.GetSemanticModel(tree);
            var text = tree.GetText();
            position = Math.Max(0, Math.Min(position, text.Length));

            // Yazılmakta olan kelimenin başına git.
            int start = position;
            while (start > 0 && (char.IsLetterOrDigit(text[start - 1]) || text[start - 1] == '_')) start--;

            var root = tree.GetRoot();
            if (start > 0 && text[start - 1] == '.')
            {
                var dotToken = root.FindToken(start - 1);
                if (dotToken.Parent is MemberAccessExpressionSyntax ma && ma.OperatorToken == dotToken)
                    return MemberItems(model, ma.Expression, start);
                if (dotToken.Parent is QualifiedNameSyntax qn && qn.DotToken == dotToken)
                    return MemberItems(model, qn.Left, start);
                return new();
            }

            // Yorum veya metin içindeysek öneri verme.
            var token = root.FindToken(Math.Max(0, start - 1));
            if (token.IsKind(SyntaxKind.StringLiteralToken) && token.Span.Contains(start - 1)) return new();
            var trivia = root.FindTrivia(Math.Max(0, start - 1));
            if (trivia.IsKind(SyntaxKind.SingleLineCommentTrivia) || trivia.IsKind(SyntaxKind.MultiLineCommentTrivia)) return new();

            var symbols = model.LookupSymbols(start);
            var items = Build(model, start, symbols, includeStatic: true);
            foreach (var k in keywords) items.Add(new CompletionItemInfo { Label = k, Kind = "Keyword", SortText = "9" + k });
            return items;
        }

        static List<CompletionItemInfo> MemberItems(SemanticModel model, ExpressionSyntax expr, int position)
        {
            var symbol = model.GetSymbolInfo(expr).Symbol;
            if (symbol is INamespaceSymbol ns)
                return Build(model, position, model.LookupNamespacesAndTypes(position, ns), true);
            if (symbol is INamedTypeSymbol type && expr is not ThisExpressionSyntax)
            {
                // "Color.Red" gibi statik erişim; ancak "button1.Text" gibi alan adı tür adıyla aynıysa ikisini de göster.
                var statics = model.LookupStaticMembers(position, type);
                return Build(model, position, statics, true);
            }
            var t = model.GetTypeInfo(expr).Type;
            if (t == null || t.TypeKind == TypeKind.Error) return new();
            var members = model.LookupSymbols(position, t, includeReducedExtensionMethods: true);
            return Build(model, position, members.Where(m => !m.IsStatic || m is INamedTypeSymbol).ToList(), false);
        }

        static List<CompletionItemInfo> Build(SemanticModel model, int position, IEnumerable<ISymbol> symbols, bool includeStatic)
        {
            var groups = new Dictionary<string, (ISymbol first, int count)>();
            foreach (var s in symbols)
            {
                if (s.IsImplicitlyDeclared && s is not IParameterSymbol) continue;
                if (!model.IsAccessible(position, s)) continue;
                if (s is IMethodSymbol m && m.MethodKind is not (MethodKind.Ordinary or MethodKind.ReducedExtension or MethodKind.LocalFunction)) continue;
                if (s.Name.StartsWith("<") || s.Name.StartsWith("__") || s.Name == "Finalize" || s.Name == "MemberwiseClone") continue;
                string ns = s.ContainingNamespace?.ToDisplayString() ?? "";
                if (ns.StartsWith("MiniWinForms") || ns.StartsWith("Microsoft.CodeAnalysis") || ns.StartsWith("Internal")) continue;
                if (s is INamespaceSymbol nsym && (nsym.Name is "MiniWinForms" or "Internal" or "Microsoft" or "FxResources")) continue;
                if (s.GetAttributes().Any(a => a.AttributeClass?.Name is "ObsoleteAttribute" or "EditorBrowsableAttribute")) continue;
                if (groups.TryGetValue(s.Name, out var g)) groups[s.Name] = (g.first, g.count + 1);
                else groups[s.Name] = (s, 1);
            }

            var list = new List<CompletionItemInfo>();
            foreach (var (name, (s, count)) in groups)
            {
                string kind = KindOf(s);
                string detail = Detail(s);
                if (count > 1) detail += "  (+" + (count - 1) + " aşırı yükleme)";
                string prio = s is ILocalSymbol or IParameterSymbol ? "0" : s.ContainingType != null && !(s is INamedTypeSymbol) ? "1" : "5";
                list.Add(new CompletionItemInfo { Label = name, Kind = kind, Detail = detail, SortText = prio + name });
            }
            return list;
        }

        static string KindOf(ISymbol s) => s switch
        {
            IMethodSymbol => "Method",
            IPropertySymbol => "Property",
            IFieldSymbol f when f.ContainingType?.TypeKind == TypeKind.Enum => "EnumMember",
            IFieldSymbol f when f.IsConst => "Constant",
            IFieldSymbol => "Field",
            IEventSymbol => "Event",
            ILocalSymbol or IParameterSymbol or IRangeVariableSymbol => "Variable",
            INamespaceSymbol => "Module",
            INamedTypeSymbol t => t.TypeKind switch
            {
                TypeKind.Interface => "Interface",
                TypeKind.Enum => "Enum",
                TypeKind.Struct => "Struct",
                TypeKind.Delegate => "Function",
                _ => "Class",
            },
            _ => "Text",
        };

        static readonly SymbolDisplayFormat format = new(
            globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
            typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameOnly,
            genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
            memberOptions: SymbolDisplayMemberOptions.IncludeParameters | SymbolDisplayMemberOptions.IncludeType | SymbolDisplayMemberOptions.IncludeContainingType,
            parameterOptions: SymbolDisplayParameterOptions.IncludeType | SymbolDisplayParameterOptions.IncludeName | SymbolDisplayParameterOptions.IncludeDefaultValue,
            propertyStyle: SymbolDisplayPropertyStyle.ShowReadWriteDescriptor,
            localOptions: SymbolDisplayLocalOptions.IncludeType,
            miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes);

        static string Detail(ISymbol s)
        {
            try { return s.ToDisplayString(format); }
            catch { return s.Name; }
        }
    }
}
