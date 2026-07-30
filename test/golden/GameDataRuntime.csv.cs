using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json;

namespace GameData
{
    /// <summary>기본키로 찾을 수 있는 데이터 행입니다.</summary>
    public interface IGameData<TKey>
    {
        /// <summary>이 행의 기본키입니다.</summary>
        TKey Key { get; }
    }

    /// <summary>JSON 을 읽는 공통 경로입니다.</summary>
    public static class GameDataJson
    {
        /// <summary>테이블 하나의 행 목록을 읽습니다.</summary>
        /// <param name="readJson">테이블 이름(확장자 없음)을 받아 JSON 문자열을 돌려줍니다.</param>
        public static List<T> ReadRows<T>(Func<string, string> readJson)
        {
            if (readJson == null) throw new ArgumentNullException(nameof(readJson));

            // 파일 이름은 클래스명과 같다 (spec §6.4). 인자도 어트리뷰트도 필요 없다.
            var wrapper = JsonConvert.DeserializeObject<RowsWrapper<T>>(readJson(typeof(T).Name));
            return wrapper?.rows ?? new List<T>();
        }

        /// <summary>JSON 최상위의 rows 래퍼입니다 (spec §6.1).</summary>
        private sealed class RowsWrapper<TRow>
        {
            public List<TRow> rows;
        }
    }

    /// <summary>한 시트의 모든 행과 기본키 인덱스입니다.</summary>
    public sealed class GameDataTable<T, TKey> where T : IGameData<TKey>
    {
        private readonly Dictionary<TKey, T> _byKey;

        /// <summary>시트의 행 순서를 그대로 지킵니다.</summary>
        public IReadOnlyList<T> Rows { get; }

        public GameDataTable(List<T> rows)
        {
            if (rows == null) throw new ArgumentNullException(nameof(rows));

            Rows = rows;
            _byKey = new Dictionary<TKey, T>(rows.Count);
            foreach (var row in rows) _byKey[row.Key] = row;
        }

        /// <summary>기본키로 찾습니다. 없으면 KeyNotFoundException 입니다.</summary>
        public T Get(TKey key)
        {
            return _byKey[key];
        }

        /// <summary>기본키로 찾습니다. 없으면 false 입니다.</summary>
        public bool TryGet(TKey key, out T value)
        {
            return _byKey.TryGetValue(key, out value);
        }

        /// <summary>JSON 을 읽어 테이블을 만듭니다.</summary>
        /// <param name="readJson">테이블 이름(확장자 없음)을 받아 JSON 문자열을 돌려줍니다.</param>
        public static GameDataTable<T, TKey> Load(Func<string, string> readJson)
        {
            if (readJson == null) throw new ArgumentNullException(nameof(readJson));

            return new GameDataTable<T, TKey>(GameDataJson.ReadRows<T>(readJson));
        }
    }

    /// <summary>CSV 한 행에서 값을 꺼낼 수 있는 데이터 행입니다.</summary>
    public interface ICsvReadable
    {
        /// <summary>한 행을 읽어 자기 필드를 채웁니다.</summary>
        void ReadCsvRow(GameDataCsvRow row);
    }

    /// <summary>CSV 셀 문자열을 값으로 바꿉니다.</summary>
    public static class GameDataParse
    {
        public static int Int(string text)
        {
            return int.Parse(text, CultureInfo.InvariantCulture);
        }

        public static long Long(string text)
        {
            return long.Parse(text, CultureInfo.InvariantCulture);
        }

        public static float Float(string text)
        {
            return float.Parse(text, CultureInfo.InvariantCulture);
        }

        public static double Double(string text)
        {
            return double.Parse(text, CultureInfo.InvariantCulture);
        }

        /// <summary>TRUE true 1 Y O 와 FALSE false 0 N X 를 받습니다.</summary>
        public static bool Bool(string text)
        {
            switch (text.Trim().ToUpperInvariant())
            {
                case "TRUE": case "1": case "Y": case "O": return true;
                case "FALSE": case "0": case "N": case "X": return false;
            }
            throw new FormatException("bool 로 읽을 수 없습니다: " + text);
        }

        /// <summary>UTC ISO 8601 문자열을 읽습니다 (spec §6.1).</summary>
        public static DateTime Date(string text)
        {
            return DateTime.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
        }

        /// <summary>enum 멤버 이름을 읽습니다. 정수가 아니라 이름입니다 (spec §11.1).</summary>
        public static TEnum Enum<TEnum>(string text) where TEnum : struct
        {
            return (TEnum)System.Enum.Parse(typeof(TEnum), text, false);
        }
    }

    /// <summary>CSV 한 행입니다. 열은 헤더 이름으로 찾습니다.</summary>
    public sealed class GameDataCsvRow
    {
        private readonly Dictionary<string, int> _columns;
        private readonly string[] _cells;
        private readonly string _table;
        private readonly int _line;

        public GameDataCsvRow(Dictionary<string, int> columns, string[] cells, string table, int line)
        {
            _columns = columns;
            _cells = cells;
            _table = table;
            _line = line;
        }

        /// <summary>셀 원문. 열이 없거나 비어 있으면 null 입니다.</summary>
        public string Raw(string column)
        {
            int index;
            if (!_columns.TryGetValue(column, out index)) return null;
            if (index >= _cells.Length) return null;

            var cell = _cells[index];
            return cell.Length == 0 ? null : cell;
        }

        /// <summary>필수 값입니다. 비어 있으면 예외입니다 (notation §5.2).</summary>
        public T Value<T>(string column, Func<string, T> parse)
        {
            return parse(Required(column));
        }

        /// <summary>비어 있으면 null 입니다.</summary>
        public T? ValueOrNull<T>(string column, Func<string, T> parse) where T : struct
        {
            var cell = Raw(column);
            return cell == null ? (T?)null : parse(cell);
        }

        /// <summary>필수 문자열입니다.</summary>
        public string Text(string column)
        {
            return Required(column);
        }

        /// <summary>비어 있으면 null 인 문자열입니다.</summary>
        public string TextOrNull(string column)
        {
            return Raw(column);
        }

        /// <summary>비어 있으면 빈 목록입니다 (T[]).</summary>
        public List<T> ValueList<T>(string column, Func<string, T> parse, string delimiter)
        {
            var found = new List<T>();
            var cell = Raw(column);
            if (cell == null) return found;

            foreach (var element in GameDataCsv.SplitElements(cell, delimiter))
            {
                if (element.Length == 0) throw Fail(column, "배열에 빈 원소가 있습니다");
                found.Add(parse(element));
            }
            return found;
        }

        /// <summary>비어 있으면 null 인 목록입니다 (T[]?).</summary>
        public List<T> ValueListOrNull<T>(string column, Func<string, T> parse, string delimiter)
        {
            return Raw(column) == null ? null : ValueList(column, parse, delimiter);
        }

        /// <summary>원소가 비어 있을 수 있는 목록입니다 (T?[]).</summary>
        public List<T?> NullableList<T>(string column, Func<string, T> parse, string delimiter)
        {
            var found = new List<T?>();
            var cell = Raw(column);
            if (cell == null) return found;

            foreach (var element in GameDataCsv.SplitElements(cell, delimiter))
            {
                found.Add(element.Length == 0 ? (T?)null : parse(element));
            }
            return found;
        }

        /// <summary>비어 있으면 null 이고 원소도 비어 있을 수 있는 목록입니다 (T?[]?).</summary>
        public List<T?> NullableListOrNull<T>(string column, Func<string, T> parse, string delimiter)
        {
            return Raw(column) == null ? null : NullableList(column, parse, delimiter);
        }

        /// <summary>문자열 목록입니다 (string[]).</summary>
        public List<string> TextList(string column, string delimiter)
        {
            var cell = Raw(column);
            return cell == null ? new List<string>() : GameDataCsv.SplitElements(cell, delimiter);
        }

        /// <summary>비어 있으면 null 인 문자열 목록입니다 (string[]?).</summary>
        public List<string> TextListOrNull(string column, string delimiter)
        {
            return Raw(column) == null ? null : TextList(column, delimiter);
        }

        private string Required(string column)
        {
            var cell = Raw(column);
            if (cell == null) throw Fail(column, "필수 값이 비었습니다");
            return cell;
        }

        /// <summary>어느 표의 몇 번째 줄, 어느 열인지 알려줍니다.</summary>
        private FormatException Fail(string column, string reason)
        {
            return new FormatException(_table + ".csv " + _line + "줄 " + column + " 열: " + reason);
        }
    }

    /// <summary>CSV 를 읽습니다.</summary>
    public static class GameDataCsv
    {
        /// <summary>표 하나를 읽습니다. 파일 이름은 클래스명과 같습니다 (spec §6.4).</summary>
        /// <param name="readCsv">표 이름(확장자 없음)을 받아 CSV 문자열을 돌려줍니다.</param>
        public static List<T> ReadRows<T>(Func<string, string> readCsv) where T : ICsvReadable, new()
        {
            if (readCsv == null) throw new ArgumentNullException(nameof(readCsv));

            var table = typeof(T).Name;
            var lines = Tokenize(readCsv(table));
            var found = new List<T>();
            if (lines.Count == 0) return found;

            var columns = new Dictionary<string, int>(lines[0].Length);
            for (var i = 0; i < lines[0].Length; i += 1) columns[lines[0][i]] = i;

            for (var i = 1; i < lines.Count; i += 1)
            {
                var row = new GameDataCsvRow(columns, lines[i], table, i + 1);
                var item = new T();
                item.ReadCsvRow(row);
                found.Add(item);
            }
            return found;
        }

        /// <summary>CSV 텍스트를 줄 단위 셀 배열로 자릅니다. 인용 안의 줄바꿈도 다룹니다.</summary>
        public static List<string[]> Tokenize(string text)
        {
            var lines = new List<string[]>();
            if (string.IsNullOrEmpty(text)) return lines;

            var cells = new List<string>();
            var cell = new System.Text.StringBuilder();
            var quoted = false;
            var index = 0;

            while (index < text.Length)
            {
                var current = text[index];

                if (quoted)
                {
                    if (current == '"')
                    {
                        if (index + 1 < text.Length && text[index + 1] == '"') { cell.Append('"'); index += 2; continue; }
                        quoted = false;
                        index += 1;
                        continue;
                    }
                    cell.Append(current);
                    index += 1;
                    continue;
                }

                if (current == '"') { quoted = true; index += 1; continue; }
                if (current == ',') { cells.Add(cell.ToString()); cell.Length = 0; index += 1; continue; }
                if (current == '\n' || current == '\r')
                {
                    cells.Add(cell.ToString());
                    cell.Length = 0;
                    lines.Add(cells.ToArray());
                    cells.Clear();
                    if (current == '\r' && index + 1 < text.Length && text[index + 1] == '\n') index += 1;
                    index += 1;
                    continue;
                }

                cell.Append(current);
                index += 1;
            }

            if (cell.Length > 0 || cells.Count > 0)
            {
                cells.Add(cell.ToString());
                lines.Add(cells.ToArray());
            }
            return lines;
        }

        /// <summary>셀 안의 배열을 원소로 자릅니다 (notation §5.3).</summary>
        public static List<string> SplitElements(string cell, string delimiter)
        {
            var found = new List<string>();
            var element = new System.Text.StringBuilder();
            var quoted = false;
            var index = 0;

            while (index < cell.Length)
            {
                if (quoted)
                {
                    if (cell[index] == '"')
                    {
                        if (index + 1 < cell.Length && cell[index + 1] == '"') { element.Append('"'); index += 2; continue; }
                        quoted = false;
                        index += 1;
                        continue;
                    }
                    element.Append(cell[index]);
                    index += 1;
                    continue;
                }

                if (cell[index] == '"') { quoted = true; index += 1; continue; }
                if (string.CompareOrdinal(cell, index, delimiter, 0, delimiter.Length) == 0)
                {
                    found.Add(element.ToString());
                    element.Length = 0;
                    index += delimiter.Length;
                    continue;
                }

                element.Append(cell[index]);
                index += 1;
            }

            found.Add(element.ToString());
            return found;
        }
    }
}
