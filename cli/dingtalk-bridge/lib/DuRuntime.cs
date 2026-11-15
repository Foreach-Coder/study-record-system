using System;
using System.Collections;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Numerics;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace DingtalkUtils {
    // Keep the same JSON representation on .NET Framework and modern .NET.
    // In particular, large integer IDs must never pass through a double.
    public static class Json {
        public static object Parse(string text, int byteLimit) {
            if (text == null || byteLimit < 1 || Encoding.UTF8.GetByteCount(text) > byteLimit)
                throw new FormatException("JSON exceeds size bound");
            var parser = new Parser(text.Length > 0 && text[0] == '\ufeff' ? text.Substring(1) : text);
            var result = parser.Value(0); parser.Space();
            if (!parser.End) throw new FormatException("Invalid JSON");
            return result;
        }
        private sealed class Parser {
            private readonly string text; private int index;
            internal Parser(string source) { text = source; }
            internal bool End { get { return index == text.Length; } }
            internal void Space() { while (index < text.Length && (text[index] == ' ' || text[index] == '\r' || text[index] == '\n' || text[index] == '\t')) index++; }
            private void Invalid() { throw new FormatException("Invalid JSON"); }
            private bool Take(char c) { if (index < text.Length && text[index] == c) { index++; return true; } return false; }
            internal object Value(int depth) {
                Space(); if (index >= text.Length) { Invalid(); return null; }
                char c = text[index];
                if (c == '{' || c == '[') {
                    if (++depth > 64) throw new FormatException("JSON exceeds depth bound");
                    index++; Space();
                    if (c == '{') {
                        var map = new OrderedDictionary(StringComparer.Ordinal);
                        if (Take('}')) return map;
                        while (true) {
                            Space(); if (index >= text.Length || text[index] != '"') Invalid();
                            string key = String(); Space(); if (!Take(':')) Invalid();
                            object item = Value(depth);
                            if (map.Contains(key)) throw new FormatException("JSON contains duplicate keys");
                            map.Add(key, item); Space();
                            if (Take('}')) return map;
                            if (!Take(',')) Invalid();
                        }
                    }
                    var list = new List<object>(); if (Take(']')) return list.ToArray();
                    while (true) { list.Add(Value(depth)); Space(); if (Take(']')) return list.ToArray(); if (!Take(',')) Invalid(); }
                }
                if (c == '"') return String();
                if (c == 't') { Literal("true"); return true; }
                if (c == 'f') { Literal("false"); return false; }
                if (c == 'n') { Literal("null"); return null; }
                return Number();
            }
            private void Literal(string literal) {
                if (index + literal.Length > text.Length || System.String.CompareOrdinal(text, index, literal, 0, literal.Length) != 0) Invalid();
                index += literal.Length;
            }
            private string String() {
                if (!Take('"')) Invalid(); var result = new StringBuilder();
                while (index < text.Length) {
                    char c = text[index++]; if (c == '"') return result.ToString();
                    if (c < 32) Invalid();
                    if (c != '\\') { result.Append(c); continue; }
                    if (index >= text.Length) Invalid();
                    c = text[index++];
                    switch (c) {
                        case '"': result.Append('"'); break; case '\\': result.Append('\\'); break; case '/': result.Append('/'); break;
                        case 'b': result.Append('\b'); break; case 'f': result.Append('\f'); break; case 'n': result.Append('\n'); break;
                        case 'r': result.Append('\r'); break; case 't': result.Append('\t'); break;
                        case 'u':
                            if (index + 4 > text.Length) Invalid(); int code;
                            if (!Int32.TryParse(text.Substring(index, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out code)) Invalid();
                            result.Append((char)code); index += 4; break;
                        default: Invalid(); break;
                    }
                }
                Invalid(); return null;
            }
            private object Number() {
                int start = index; Take('-');
                if (Take('0')) { if (index < text.Length && Char.IsDigit(text[index])) Invalid(); }
                else { if (index >= text.Length || text[index] < '1' || text[index] > '9') Invalid(); while (index < text.Length && text[index] >= '0' && text[index] <= '9') index++; }
                bool integral = true;
                if (Take('.')) {
                    integral = false; int digits = index;
                    while (index < text.Length && text[index] >= '0' && text[index] <= '9') index++;
                    if (digits == index) Invalid();
                }
                if (Take('e') || Take('E')) {
                    integral = false; if (!Take('+')) Take('-'); int digits = index;
                    while (index < text.Length && text[index] >= '0' && text[index] <= '9') index++;
                    if (digits == index) Invalid();
                }
                string token = text.Substring(start, index - start);
                if (integral) {
                    long small; if (Int64.TryParse(token, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out small)) return small;
                    // Bound adversarial integer parsing independently of the enclosing byte budget.
                    if (token.Length > 4096) throw new FormatException("JSON integer exceeds size bound");
                    return BigInteger.Parse(token, CultureInfo.InvariantCulture);
                }
                double value;
                if (!Double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out value) || Double.IsNaN(value) || Double.IsInfinity(value)) Invalid();
                return value;
            }
        }
        public static string Stringify(object value) { var output = new StringBuilder(); Write(output, value, 0); return output.ToString(); }
        private static void Quote(StringBuilder output, string value) {
            output.Append('"');
            foreach (char c in value) {
                switch (c) {
                    case '"': output.Append("\\\""); break; case '\\': output.Append("\\\\"); break;
                    case '\b': output.Append("\\b"); break; case '\f': output.Append("\\f"); break;
                    case '\n': output.Append("\\n"); break; case '\r': output.Append("\\r"); break; case '\t': output.Append("\\t"); break;
                    default: if (c < 32 || c == '\u0085' || c == '\u2028' || c == '\u2029') output.Append("\\u" + ((int)c).ToString("x4")); else output.Append(c); break;
                }
            }
            output.Append('"');
        }
        private static void Write(StringBuilder output, object value, int depth) {
            if (value == null) { output.Append("null"); return; }
            // PowerShell sometimes passes a wrapper rather than its scalar base object.
            if (value.GetType().FullName == "System.Management.Automation.PSObject") {
                object original = value.GetType().GetProperty("BaseObject").GetValue(value, null);
                if (!Object.ReferenceEquals(value, original)) { Write(output, original, depth); return; }
            }
            if (value is string || value is char) { Quote(output, value.ToString()); return; }
            if (value is bool) { output.Append((bool)value ? "true" : "false"); return; }
            if (value is BigInteger || value is byte || value is sbyte || value is short || value is ushort || value is int || value is uint || value is long || value is ulong || value is decimal) { output.Append(((IFormattable)value).ToString(null, CultureInfo.InvariantCulture)); return; }
            if (value is double || value is float) {
                double number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
                if (Double.IsInfinity(number) || Double.IsNaN(number)) throw new FormatException("Invalid JSON number");
                output.Append(number.ToString("R", CultureInfo.InvariantCulture)); return;
            }
            if (value is IDictionary) {
                if (++depth > 64) throw new FormatException("JSON exceeds depth bound");
                output.Append('{'); bool first = true;
                foreach (DictionaryEntry pair in (IDictionary)value) {
                    if (!(pair.Key is string)) throw new FormatException("JSON map keys must be strings");
                    if (!first) output.Append(','); first = false; Quote(output, (string)pair.Key); output.Append(':'); Write(output, pair.Value, depth);
                }
                output.Append('}'); return;
            }
            if (value is IEnumerable) {
                if (++depth > 64) throw new FormatException("JSON exceeds depth bound");
                output.Append('['); bool first = true;
                foreach (object item in (IEnumerable)value) { if (!first) output.Append(','); first = false; Write(output, item, depth); }
                output.Append(']'); return;
            }
            throw new FormatException("Unsupported JSON value type");
        }
    }

    public sealed class ProcessChunk { public string Text; public string Stream; }
    public sealed class ProcessSession : IDisposable {
        private readonly Process process;
        private readonly Task<string> stdout, stderr;
        private readonly ConcurrentQueue<ProcessChunk> chunks = new ConcurrentQueue<ProcessChunk>();
        private readonly Stopwatch watch = Stopwatch.StartNew();
        private readonly int timeout;
        private bool finished;
        public string Output { get; private set; }
        public string Error { get; private set; }
        public int ExitCode { get; private set; }

        private static string Quote(string arg) {
            if (arg == null) arg = "";
            return "\"" + Regex.Replace(Regex.Replace(arg, @"(\\*)""", "$1$1\\\""), @"(\\+)$", "$1$1") + "\"";
        }
        public ProcessSession(string file, string[] arguments, IDictionary environment, string directory, int timeoutMs, int stdoutLimit, int stderrLimit) {
            timeout = timeoutMs;
            var info = new ProcessStartInfo(file) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
            var quoted = new List<string>(); foreach (string arg in arguments) quoted.Add(Quote(arg)); info.Arguments = String.Join(" ", quoted.ToArray());
            if (!String.IsNullOrEmpty(directory)) info.WorkingDirectory = directory;
            if (environment != null) {
                info.EnvironmentVariables.Clear(); foreach (DictionaryEntry pair in environment) if (pair.Value != null) info.EnvironmentVariables[Convert.ToString(pair.Key, CultureInfo.InvariantCulture)] = Convert.ToString(pair.Value, CultureInfo.InvariantCulture);
            }
            try { process = Process.Start(info); process.StandardInput.Close(); }
            catch { throw new IOException("Unable to start DWS process"); }
            stdout = Read(process.StandardOutput.BaseStream, stdoutLimit, "stdout");
            stderr = Read(process.StandardError.BaseStream, stderrLimit, "stderr");
        }
        private async Task<string> Read(Stream stream, int limit, string name) {
            var bytes = new byte[4096]; var chars = new char[Encoding.UTF8.GetMaxCharCount(4096)];
            var decoder = new UTF8Encoding(false, true).GetDecoder(); var text = new StringBuilder(); long total = 0;
            int count;
            while ((count = await stream.ReadAsync(bytes, 0, bytes.Length).ConfigureAwait(false)) != 0) {
                total += count; if (total > limit) throw new IOException("DWS output exceeds size bound");
                int length = decoder.GetChars(bytes, 0, count, chars, 0, false);
                if (length > 0) { string chunk = new string(chars, 0, length); text.Append(chunk); chunks.Enqueue(new ProcessChunk { Text = chunk, Stream = name }); }
            }
            int tailLength = decoder.GetChars(new byte[0], 0, 0, chars, 0, true);
            if (tailLength > 0) { string tail = new string(chars, 0, tailLength); text.Append(tail); chunks.Enqueue(new ProcessChunk { Text = tail, Stream = name }); }
            return text.ToString();
        }
        public ProcessChunk[] Drain() {
            var list = new List<ProcessChunk>(); ProcessChunk chunk;
            while (chunks.TryDequeue(out chunk)) list.Add(chunk);
            return list.ToArray();
        }
        public bool Poll() {
            if (finished) return true;
            if (watch.ElapsedMilliseconds > timeout) { Stop(); throw new TimeoutException("DWS command timed out"); }
            if (stdout.IsFaulted || stderr.IsFaulted) { Stop(); throw new IOException("DWS output exceeds size bound or contains invalid UTF-8"); }
            if (process.HasExited && stdout.IsCompleted && stderr.IsCompleted) {
                Output = stdout.GetAwaiter().GetResult(); Error = stderr.GetAwaiter().GetResult(); ExitCode = process.ExitCode; finished = true; return true;
            }
            return false;
        }
        private void Stop() {
            try {
                if (process.HasExited) return;
                // Framework has no Kill(entireProcessTree); taskkill is native on supported Windows hosts.
                var info = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "taskkill.exe"), "/PID " + process.Id + " /T /F") {
                    UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
                };
                using (var killer = Process.Start(info)) {
                    var a = killer.StandardOutput.ReadToEndAsync(); var b = killer.StandardError.ReadToEndAsync();
                    if (!killer.WaitForExit(10000)) killer.Kill();
                }
            } catch { try { process.Kill(); } catch { } }
        }
        public void Dispose() { if (!finished) Stop(); process.Dispose(); }
    }
}
