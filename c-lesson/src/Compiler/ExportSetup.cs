using System.Globalization;
using System.Text;
using System.Text.Json;

namespace CLesson.Compiler
{
    public static partial class CodeTools
    {
        /// <summary>Setup projesi için Visual Studio Installer Projects (.vdproj) metni</summary>
        internal static string Vdproj(SetupInput s, string ns, string projGuid)
        {
            string P(string key, string def = "")
            {
                if (s.Props != null && s.Props.TryGetValue(key, out var v))
                    return v.ValueKind == JsonValueKind.String ? v.GetString() ?? def : v.ToString();
                return def;
            }
            bool B(string key, bool def) => s.Props != null && s.Props.TryGetValue(key, out var v) ? v.ValueKind == JsonValueKind.True || (v.ValueKind == JsonValueKind.String && v.GetString() == "true") : def;
            string Esc(string t) => (t ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
            string Key(string seed) => "_" + StableGuid("setup:" + s.Name + ":" + seed).Replace("-", "").ToUpperInvariant();
            string G(string seed) => "{" + StableGuid("setupg:" + s.Name + ":" + seed).ToUpperInvariant() + "}";
            bool x64 = P("TargetPlatform", "x86") == "x64";
            string appF = Key("folder:app"), deskF = Key("folder:desktop"), progF = Key("folder:programs");
            string FolderKey(string f) => f == "desktop" ? deskF : f == "programs" ? progF : appF;
            var items = s.Items ?? new List<SetupItem>();
            string ItemKey(SetupItem it) => Key("item:" + it.Id + ":" + it.Name);
            SetupItem Find(string idOrName) => items.FirstOrDefault(i => i.Id == idOrName) ?? items.FirstOrDefault(i => i.Name == idOrName || (i.Kind == "output" && idOrName != null && idOrName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)));

            var b = new StringBuilder();
            int depth = 0;
            void L(string line) => b.Append(new string(' ', depth * 4)).Append(line).Append("\r\n");
            void Open(string name) { L("\"" + name + "\""); L("{"); depth++; }
            void Close() { depth--; L("}"); }
            void V(string k, string type, string v) => L("\"" + k + "\" = \"" + type + ":" + v + "\"");
            void S(string k, string v) => V(k, "8", Esc(v));
            void Bo(string k, bool v) => V(k, "11", v ? "TRUE" : "FALSE");
            void I(string k, int v) => V(k, "3", v.ToString(CultureInfo.InvariantCulture));

            Open("DeployProject");
            V("VSVersion", "3", "800");
            S("ProjectType", "{978C614F-708E-4E1A-B201-565925725DBA}");
            Bo("IsWebType", false);
            S("ProjectName", s.Name);
            I("LanguageId", 1033);
            I("CodePage", 1252);
            I("UILanguageId", 1033);
            S("SccProjectName", ""); S("SccLocalPath", ""); S("SccAuxPath", ""); S("SccProvider", "");
            Open("Hierarchy");
            foreach (var it in items.Where(i => i.Kind != "shortcut"))
            {
                Open("Entry");
                S("MsmKey", ItemKey(it));
                S("OwnerKey", "_UNDEFINED");
                S("MsmSig", "_UNDEFINED");
                Close();
            }
            Close();
            Open("Configurations");
            foreach (var cfg in new[] { "Debug", "Release" })
            {
                Open(cfg);
                S("DisplayName", cfg);
                Bo("IsDebugOnly", cfg == "Debug");
                Bo("IsReleaseOnly", cfg == "Release");
                S("OutputFilename", cfg + "\\" + s.Name + ".msi");
                I("PackageFilesAs", 2);
                I("PackageFileSize", int.MinValue);
                I("CabType", 1);
                I("Compression", 2);
                Bo("SignOutput", false);
                S("CertificateFile", ""); S("PrivateKeyFile", ""); S("TimeStampServer", "");
                I("InstallerBootstrapper", 2);
                Open("BootstrapperCfg:{63ACBE69-63AA-4F98-B2B6-99F9E24495F2}");
                Bo("Enabled", true);
                Bo("PromptEnabled", true);
                V("PrerequisitesLocation", "2", "1");
                S("Url", ""); S("ComponentsUrl", "");
                Open("Items");
                Open("{EDC2488A-23F4-4B3C-B4D9-6E1DC5AEB4AB}:.NETFramework,Version=v4.8");
                S("Name", "Microsoft .NET Framework 4.8 (x86 and x64)");
                S("ProductCode", ".NETFramework,Version=v4.8");
                Close();
                Close();
                Close();
                Close();
            }
            Close();
            Open("Deployable");
            Open("CustomAction"); Close();
            Open("DefaultFeature"); S("Name", "DefaultFeature"); S("Title", ""); S("Description", ""); Close();
            Open("ExternalPersistence");
            Open("LaunchCondition");
            Open("{A06ECF26-33A3-4562-8140-9B0E340D4F24}:" + Key("lc:netfx"));
            S("Name", ".NET Framework");
            S("Message", "[VSDNETMSG]");
            S("FrameworkVersion", ".NETFramework,Version=v4.8");
            Bo("AllowLaterVersions", false);
            S("InstallUrl", "http://go.microsoft.com/fwlink/?LinkId=863262");
            Close();
            Close();
            Close();
            Open("File");
            foreach (var it in items.Where(i => i.Kind == "file"))
            {
                Open("{1FB2D0AE-D3B9-43D4-B9DD-F88EC61E35DE}:" + ItemKey(it));
                S("SourcePath", it.Name);
                S("TargetName", it.Name);
                S("Tag", "");
                S("Folder", FolderKey(it.Folder));
                S("Condition", "");
                Bo("Transitive", false); Bo("Vital", true); Bo("ReadOnly", false); Bo("Hidden", false); Bo("System", false); Bo("Permanent", false); Bo("SharedLegacy", false);
                I("PackageAs", 1); I("Register", 1);
                Bo("Exclude", false); Bo("IsDependency", false);
                S("IsolateTo", "");
                Close();
            }
            Close();
            Open("FileType"); Close();
            Open("Folder");
            Open("{3C67513D-01DD-4637-8A68-80971EB9504F}:" + appF);
            S("DefaultLocation", (x64 ? "[ProgramFiles64Folder]" : "[ProgramFilesFolder]") + "[Manufacturer]\\[ProductName]");
            S("Name", "#1925");
            Bo("AlwaysCreate", false); S("Condition", ""); Bo("Transitive", false);
            S("Property", "TARGETDIR");
            Open("Folders"); Close();
            Close();
            foreach (var (key, name, prop) in new[] { (deskF, "#1916", "DesktopFolder"), (progF, "#1919", "ProgramMenuFolder") })
            {
                Open("{1525181F-901A-416C-8A58-119130FE478E}:" + key);
                S("Name", name);
                Bo("AlwaysCreate", false); S("Condition", ""); Bo("Transitive", false);
                S("Property", prop);
                Open("Folders"); Close();
                Close();
            }
            Close();
            Open("LaunchCondition"); Close();
            Open("Locator"); Close();
            Open("MsiBootstrapper"); I("LangId", 1033); Bo("RequiresElevation", false); Close();
            Open("Product");
            S("Name", "Microsoft Visual Studio");
            S("ProductName", P("ProductName", s.Name));
            S("ProductCode", G("product"));
            S("PackageCode", G("package"));
            S("UpgradeCode", G("upgrade"));
            S("AspNetVersion", "2.0.50727.0");
            Bo("RestartWWWService", false);
            Bo("RemovePreviousVersions", B("RemovePreviousVersions", false));
            Bo("DetectNewerInstalledVersion", B("DetectNewerInstalledVersion", true));
            Bo("InstallAllUsers", B("InstallAllUsers", false));
            S("ProductVersion", P("Version", "1.0.0"));
            S("Manufacturer", P("Manufacturer", "Default Company Name"));
            S("ARPHELPTELEPHONE", P("SupportPhone"));
            S("ARPHELPLINK", P("SupportUrl"));
            S("Title", P("Title", s.Name));
            S("Subject", P("Subject"));
            S("ARPCONTACT", P("Author", "Default Company Name"));
            S("Keywords", P("Keywords"));
            S("ARPCOMMENTS", P("Description"));
            S("ARPURLINFOABOUT", P("ManufacturerUrl"));
            var arpIcon = items.FirstOrDefault(i => i.Kind == "file" && i.Name == P("AddRemoveProgramsIcon"));
            S("ARPPRODUCTICON", arpIcon != null ? ItemKey(arpIcon) : "");
            I("ARPIconIndex", 0);
            S("SearchPath", "");
            Bo("UseSystemSearchPath", true);
            I("TargetPlatform", x64 ? 1 : 0);
            S("PreBuildEvent", ""); S("PostBuildEvent", "");
            I("RunPostBuildEvent", 0);
            Close();
            Open("Registry");
            foreach (var hive in new[] { "HKLM", "HKCU", "HKCR", "HKU", "HKPU" }) { Open(hive); Open("Keys"); Close(); Close(); }
            Close();
            Open("Sequences"); Close();
            Open("Shortcut");
            foreach (var it in items.Where(i => i.Kind == "shortcut"))
            {
                var target = Find(it.Target);
                var icon = it.Icon != null ? Find(it.Icon) : null;
                Open("{970C0BB2-C7D0-45D7-ABFA-7EC378858BC0}:" + ItemKey(it));
                S("Name", it.Name);
                S("Arguments", ""); S("Description", "");
                I("ShowCmd", 1); I("IconIndex", 0);
                Bo("Transitive", false);
                S("Target", target != null ? ItemKey(target) : "");
                S("Folder", FolderKey(it.Folder));
                S("WorkingFolder", appF);
                S("Icon", icon != null ? ItemKey(icon) : "");
                S("Feature", "");
                Close();
            }
            Close();
            Open("MergeModule"); Close();
            Open("ProjectOutput");
            foreach (var it in items.Where(i => i.Kind == "output"))
            {
                Open("{5259A561-127C-4D43-A0A1-72F10C7B3BF8}:" + ItemKey(it));
                S("SourcePath", ""); S("TargetName", ""); S("Tag", "");
                S("Folder", appF);
                S("Condition", "");
                Bo("Transitive", false); Bo("Vital", true); Bo("ReadOnly", false); Bo("Hidden", false); Bo("System", false); Bo("Permanent", false); Bo("SharedLegacy", false);
                I("PackageAs", 1); I("Register", 1);
                Bo("Exclude", false); Bo("IsDependency", false);
                S("IsolateTo", "");
                I("ProjectOutputGroupRegister", 1);
                S("OutputConfiguration", "");
                S("OutputGroupCanonicalName", "Built");
                S("OutputProjectGuid", "{" + projGuid + "}");
                Bo("ShowKeyOutput", true);
                Open("ExcludeFilters"); Close();
                Close();
            }
            Close();
            Close();
            Close();
            return b.ToString();
        }

        /// <summary>data: URL → bayt dizisi</summary>
        internal static byte[] DataUrlBytes(string content)
        {
            if (string.IsNullOrEmpty(content)) return Array.Empty<byte>();
            int comma = content.IndexOf(',');
            if (content.StartsWith("data:", StringComparison.Ordinal) && comma > 0)
            {
                string meta = content.Substring(5, comma - 5);
                string data = content.Substring(comma + 1);
                if (meta.EndsWith(";base64", StringComparison.Ordinal)) return Convert.FromBase64String(data);
                return Encoding.UTF8.GetBytes(Uri.UnescapeDataString(data));
            }
            return Encoding.UTF8.GetBytes(content);
        }
    }
}
