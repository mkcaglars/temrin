using System.Reflection;
using System.Text;
using MiniWinForms;

namespace CLesson.Compiler
{
    /// <summary>Derlenmiş öğrenci programını yükler ve Main metodunu çalıştırır.</summary>
    public static class ProgramRunner
    {
        static bool consoleHooked;

        public static void Run(byte[] assembly, byte[] pdb) => Run(assembly, pdb, null);

        /// <summary>Programı çalıştırır. Veri dosyaları (ör. okul.xml) uygulama klasörüne yazılır ve izlenir.</summary>
        public static void Run(byte[] assembly, byte[] pdb, IEnumerable<ProjectFile> dataFiles)
        {
            Ui.Reset();
            if (dataFiles != null)
                foreach (var f in dataFiles) Ui.WriteDataFile(f.Name, f.Content);
            HookConsole();
            SynchronizationContext.SetSynchronizationContext(new UiSynchronizationContext());
            var asm = pdb != null ? Assembly.Load(assembly, pdb) : Assembly.Load(assembly);
            var entry = asm.EntryPoint ?? throw new InvalidOperationException("Programda Main metodu bulunamadı.");
            Ui.Execute(() =>
            {
                object[] args = entry.GetParameters().Length == 0 ? null : new object[] { Array.Empty<string>() };
                var result = entry.Invoke(null, args);
                if (result is Task t && t.IsFaulted) throw t.Exception.InnerException ?? t.Exception;
            });
            if (!Ui.Running)
            {
                // Hiç form açılmadıysa (konsol programı) program bitmiştir.
                Console.Out.Flush();
                Ui.Backend.ProgramEnded("Program tamamlandı.");
            }
        }

        public static void Stop()
        {
            Ui.Reset();
        }

        static void HookConsole()
        {
            if (consoleHooked) return;
            consoleHooked = true;
            Console.SetOut(new BackendWriter());
            Console.SetError(new BackendWriter());
            Console.SetIn(new PromptReader());
        }

        /// <summary>Console.ReadLine için kullanıcıdan giriş ister.</summary>
        sealed class PromptReader : TextReader
        {
            string pending;
            int pos;

            public override string ReadLine()
            {
                Console.Out.Flush();
                if (pending != null && pos < pending.Length)
                {
                    var rest = pending.Substring(pos).TrimEnd('\n');
                    pending = null;
                    return rest;
                }
                pending = null;
                var r = Ui.Backend.InputBox("Programın girişi bekleniyor (Console.ReadLine):", "Konsol", "");
                Guard.RestartClockPublic();
                if (r != null) Ui.Backend.Output(r + "\n");
                return r;
            }

            public override int Read()
            {
                if (pending == null || pos >= pending.Length)
                {
                    var line = ReadLine();
                    if (line == null) return -1;
                    pending = line + "\n";
                    pos = 0;
                }
                return pending[pos++];
            }

            public override int Peek() => pending != null && pos < pending.Length ? pending[pos] : -1;
        }

        sealed class BackendWriter : TextWriter
        {
            readonly StringBuilder buffer = new();
            public override Encoding Encoding => Encoding.UTF8;

            public override void Write(char value)
            {
                buffer.Append(value);
                if (value == '\n') Flush();
            }

            public override void Write(string value)
            {
                buffer.Append(value);
                Flush();
            }

            public override void Write(char[] chars, int index, int count)
            {
                buffer.Append(chars, index, count);
                Flush();
            }

            public override void Flush()
            {
                if (buffer.Length == 0) return;
                var s = buffer.ToString();
                buffer.Clear();
                Ui.Backend.Output(s);
            }
        }
    }
}
