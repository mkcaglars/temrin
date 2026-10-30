using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CLesson.Compiler
{
    /// <summary>
    /// Ders ortamında güvenlik veya kararlılık açısından izin verilmeyen API'leri yakalar.
    /// Öğretmen öğrencinin projesini kendi tarayıcısında çalıştırdığı için yansıma (reflection)
    /// gibi yollarla sayfaya erişim engellenir.
    /// </summary>
    public static class ApiGuard
    {
        static readonly string[] blockedNamespaces =
        {
            "System.Reflection", "System.Runtime.InteropServices", "System.Runtime.Loader",
            "System.Net", "System.Security", "System.Diagnostics.Tracing", "MiniWinForms",
        };

        static readonly HashSet<string> blockedTypes = new()
        {
            "System.Activator", "System.AppDomain", "System.Diagnostics.Process", "System.Runtime.CompilerServices.Unsafe",
            "System.Diagnostics.StackTrace", "System.Diagnostics.StackFrame",
        };

        // System.Type üyelerinden izin verilenler (yansıma ile çağrı yapmaya yaramayanlar).
        static readonly HashSet<string> allowedTypeMembers = new()
        {
            "Name", "FullName", "Namespace", "ToString", "Equals", "GetHashCode", "IsEnum", "IsClass", "IsValueType",
            "IsArray", "IsInterface", "IsAbstract", "IsPrimitive", "IsGenericType", "BaseType", "IsAssignableFrom",
            "IsSubclassOf", "IsInstanceOfType", "GetTypeCode", "op_Equality", "op_Inequality", "GetEnumNames", "GetEnumValues",
        };

        public static IEnumerable<Diagnostic> Check(SemanticModel model, SyntaxNode root)
        {
            var reported = new HashSet<int>();
            foreach (var node in root.DescendantNodes())
            {
                if (node is not SimpleNameSyntax name) continue;
                if (node.Ancestors().Any(a => a is UsingDirectiveSyntax)) continue;
                var symbol = model.GetSymbolInfo(name).Symbol ?? model.GetSymbolInfo(name).CandidateSymbols.FirstOrDefault();
                if (symbol == null) continue;
                string reason = Reason(symbol);
                if (reason == null) continue;
                if (!reported.Add(name.SpanStart)) continue;
                yield return Diagnostic.Create(Rule, name.GetLocation(), reason);
            }
        }

        static readonly DiagnosticDescriptor Rule = new(
            "DERS001", "İzin verilmeyen API", "{0}", "Ders", DiagnosticSeverity.Error, isEnabledByDefault: true);

        static string Reason(ISymbol symbol)
        {
            if (symbol is IMethodSymbol m && m.ReducedFrom != null) symbol = m.ReducedFrom;
            var type = symbol as INamedTypeSymbol ?? symbol.ContainingType;
            string typeName = type?.OriginalDefinition.ToDisplayString() ?? "";

            if (symbol is INamespaceSymbol ns)
            {
                string nsName = ns.ToDisplayString();
                return IsBlockedNamespace(nsName) ? nsName + " ad alanı bu ders ortamında kullanılamaz." : null;
            }

            if (typeName == "System.Threading.Thread" && symbol.Name == "Sleep")
                return "Thread.Sleep web ortamında programı dondurur. Bekleme için Timer veya 'await Task.Delay(milisaniye);' kullanın (metodu 'async' yapmayı unutmayın).";
            if (typeName == "System.Environment" && (symbol.Name == "Exit" || symbol.Name == "FailFast"))
                return "Environment." + symbol.Name + " yerine Application.Exit() kullanın.";
            if (typeName == "System.Type" && symbol is not INamedTypeSymbol && !allowedTypeMembers.Contains(symbol.Name))
                return "Type." + symbol.Name + " (yansıma/reflection) bu ders ortamında kullanılamaz.";
            if (typeName == "System.Delegate" && symbol.Name is "DynamicInvoke" or "Method")
                return "Delegate." + symbol.Name + " bu ders ortamında kullanılamaz.";
            if (blockedTypes.Contains(typeName))
                return typeName + " bu ders ortamında kullanılamaz.";

            string containingNs = type?.ContainingNamespace?.ToDisplayString() ?? symbol.ContainingNamespace?.ToDisplayString() ?? "";
            if (IsBlockedNamespace(containingNs))
                return (type != null ? typeName : symbol.Name) + " bu ders ortamında kullanılamaz.";

            // Yansıma nesnesi döndüren üyeler (ör. obj.GetType().Assembly) de engellenir.
            ITypeSymbol resultType = symbol switch
            {
                IPropertySymbol p => p.Type,
                IMethodSymbol mm => mm.ReturnType,
                IFieldSymbol f => f.Type,
                _ => null,
            };
            if (resultType != null)
            {
                string rns = resultType.ContainingNamespace?.ToDisplayString() ?? "";
                if (IsBlockedNamespace(rns)) return symbol.Name + " bu ders ortamında kullanılamaz.";
            }
            return null;
        }

        static bool IsBlockedNamespace(string ns)
        {
            foreach (var b in blockedNamespaces)
                if (ns == b || ns.StartsWith(b + ".", StringComparison.Ordinal)) return true;
            return false;
        }
    }
}
