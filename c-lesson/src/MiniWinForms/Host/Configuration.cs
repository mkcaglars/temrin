using System.Collections;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.IO;
using System.Xml;

namespace System.Configuration
{
    /// <summary>App.config dosyasındaki ayarları okur (connectionStrings ve appSettings).</summary>
    public static class ConfigurationManager
    {
        static ConnectionStringSettingsCollection connectionStrings;
        static NameValueCollection appSettings;
        static string loadedFrom;

        static void Load()
        {
            string path = Path.Combine(System.Windows.Forms.Application.StartupPath, "App.config");
            if (connectionStrings != null && loadedFrom == path && !changed) return;
            changed = false;
            loadedFrom = path;
            connectionStrings = new ConnectionStringSettingsCollection();
            appSettings = new NameValueCollection();
            if (!File.Exists(path)) return;
            var doc = new XmlDocument();
            try
            {
                doc.LoadXml(File.ReadAllText(path));
            }
            catch (XmlException ex)
            {
                throw new ConfigurationErrorsException("Configuration system failed to initialize: App.config dosyası geçerli bir XML değil. " + ex.Message);
            }
            foreach (XmlElement e in doc.SelectNodes("/configuration/connectionStrings/add"))
                connectionStrings.Add(new ConnectionStringSettings(e.GetAttribute("name"), e.GetAttribute("connectionString"), e.GetAttribute("providerName")));
            foreach (XmlElement e in doc.SelectNodes("/configuration/appSettings/add"))
                appSettings[e.GetAttribute("key")] = e.GetAttribute("value");
        }

        static bool changed;
        internal static void Invalidate() { changed = true; }

        public static ConnectionStringSettingsCollection ConnectionStrings { get { Load(); return connectionStrings; } }
        public static NameValueCollection AppSettings { get { Load(); return appSettings; } }
        public static void RefreshSection(string sectionName) => Invalidate();
    }

    public sealed class ConnectionStringSettings
    {
        public ConnectionStringSettings() { }
        public ConnectionStringSettings(string name, string connectionString) { Name = name; ConnectionString = connectionString; }
        public ConnectionStringSettings(string name, string connectionString, string providerName) : this(name, connectionString) { ProviderName = providerName; }
        public string Name { get; set; } = "";
        public string ConnectionString { get; set; } = "";
        public string ProviderName { get; set; } = "";
        public override string ToString() => ConnectionString;
    }

    public sealed class ConnectionStringSettingsCollection : IEnumerable<ConnectionStringSettings>
    {
        readonly List<ConnectionStringSettings> list = new List<ConnectionStringSettings>();
        internal void Add(ConnectionStringSettings s) => list.Add(s);
        public int Count => list.Count;
        public ConnectionStringSettings this[int index] => list[index];
        /// <summary>Bulunamazsa null döner (gerçek .NET'teki gibi).</summary>
        public ConnectionStringSettings this[string name] => list.Find(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
        public IEnumerator<ConnectionStringSettings> GetEnumerator() => list.GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => list.GetEnumerator();
    }

    public class ConfigurationErrorsException : Exception
    {
        public ConfigurationErrorsException(string message) : base(message) { }
    }
}
