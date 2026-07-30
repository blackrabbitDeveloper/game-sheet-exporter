// IR → C# 런타임 (GameDataRuntime.cs)
//
// 사양: docs/spec.md §6.3
//
// **이 파일은 시트를 모른다.** ir 을 인자로 받지만 읽지 않는다 — 다른 에미터와
// 서명을 맞추기 위한 것이고, 워크북이 무엇이든 같은 바이트가 나와야 한다.
//
// 그게 이 파일이 따로 있는 이유다. §2.2 가 여러 워크북 병합을 제외했으므로 도구는
// 한 번에 워크북 하나만 본다. 시트 목록을 담은 클래스를 워크북 하나에서 만들면
// 두 번째 내보내기가 첫 번째를 덮는다. 시트를 아는 부분(class.js)과 모르는 부분을
// 갈라 두면 각 파일이 자기가 아는 범위에서 완결된다.
import { DEFAULT_NAMESPACE, INDENT } from './writer.js';

/**
 * @param {object} _ir 읽지 않는다. 에미터 서명을 맞추기 위해 받는다
 * @param {{namespace?: string, csv?: boolean}} [options] csv 를 켜면 CSV 읽기가 함께 난다
 * @returns {Array<{fileName: string, text: string}>} 항상 파일 하나
 */
export function emitCSharpRuntime(_ir, options = {}) {
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  return [
    { fileName: 'GameDataRuntime.cs', text: render(namespace, options.csv === true) },
  ];
}

function render(namespace, withCsv) {
  const one = INDENT;
  const two = INDENT.repeat(2);
  const three = INDENT.repeat(3);
  const four = INDENT.repeat(4);

  const lines = [
    ...usageHeader(withCsv),
    'using System;',
    'using System.Collections.Generic;',
    // CSV 는 숫자·날짜를 문자열에서 되돌리므로 로케일을 고정해야 한다.
    ...(withCsv ? ['using System.Globalization;'] : []),
    // §11.1 이 확정한 전제. manifest.json 에 com.unity.nuget.newtonsoft-json 한 줄이 필요하다.
    'using Newtonsoft.Json;',
    '',
    `namespace ${namespace}`,
    '{',

    `${one}/// <summary>기본키로 찾을 수 있는 데이터 행입니다.</summary>`,
    `${one}public interface IGameData<TKey>`,
    `${one}{`,
    `${two}/// <summary>이 행의 기본키입니다.</summary>`,
    `${two}TKey Key { get; }`,
    `${one}}`,
    '',

    `${one}/// <summary>JSON 을 읽는 공통 경로입니다.</summary>`,
    `${one}public static class GameDataJson`,
    `${one}{`,
    `${two}/// <summary>테이블 하나의 행 목록을 읽습니다.</summary>`,
    `${two}/// <param name="readJson">테이블 이름(확장자 없음)을 받아 JSON 문자열을 돌려줍니다.</param>`,
    `${two}public static List<T> ReadRows<T>(Func<string, string> readJson)`,
    `${two}{`,
    `${three}if (readJson == null) throw new ArgumentNullException(nameof(readJson));`,
    '',
    `${three}// 파일 이름은 클래스명과 같다 (spec §6.4). 인자도 어트리뷰트도 필요 없다.`,
    `${three}var wrapper = JsonConvert.DeserializeObject<RowsWrapper<T>>(readJson(typeof(T).Name));`,
    `${three}return wrapper?.rows ?? new List<T>();`,
    `${two}}`,
    '',
    `${two}/// <summary>JSON 최상위의 rows 래퍼입니다 (spec §6.1).</summary>`,
    `${two}private sealed class RowsWrapper<TRow>`,
    `${two}{`,
    `${three}public List<TRow> rows;`,
    `${two}}`,
    `${one}}`,
    '',

    `${one}/// <summary>한 시트의 모든 행과 기본키 인덱스입니다.</summary>`,
    `${one}public sealed class GameDataTable<T, TKey> where T : IGameData<TKey>`,
    `${one}{`,
    `${two}private readonly Dictionary<TKey, T> _byKey;`,
    '',
    `${two}/// <summary>시트의 행 순서를 그대로 지킵니다.</summary>`,
    `${two}public IReadOnlyList<T> Rows { get; }`,
    '',
    `${two}public GameDataTable(List<T> rows)`,
    `${two}{`,
    `${three}if (rows == null) throw new ArgumentNullException(nameof(rows));`,
    '',
    `${three}Rows = rows;`,
    `${three}_byKey = new Dictionary<TKey, T>(rows.Count);`,
    // 명시적 구현이라 T.Key 는 제약의 인터페이스를 통해 해석된다. 시트에 Key 열이
    // 있어도 그 필드가 아니라 인터페이스 멤버가 잡힌다.
    `${three}foreach (var row in rows) _byKey[row.Key] = row;`,
    `${two}}`,
    '',
    `${two}/// <summary>기본키로 찾습니다. 없으면 KeyNotFoundException 입니다.</summary>`,
    `${two}public T Get(TKey key)`,
    `${two}{`,
    `${three}return _byKey[key];`,
    `${two}}`,
    '',
    `${two}/// <summary>기본키로 찾습니다. 없으면 false 입니다.</summary>`,
    `${two}public bool TryGet(TKey key, out T value)`,
    `${two}{`,
    `${three}return _byKey.TryGetValue(key, out value);`,
    `${two}}`,
    '',
    `${two}/// <summary>JSON 을 읽어 테이블을 만듭니다.</summary>`,
    `${two}/// <param name="readJson">테이블 이름(확장자 없음)을 받아 JSON 문자열을 돌려줍니다.</param>`,
    `${two}public static GameDataTable<T, TKey> Load(Func<string, string> readJson)`,
    `${two}{`,
    `${three}if (readJson == null) throw new ArgumentNullException(nameof(readJson));`,
    '',
    `${three}return new GameDataTable<T, TKey>(GameDataJson.ReadRows<T>(readJson));`,
    `${two}}`,
    `${one}}`,
  ];

  if (withCsv) lines.push('', ...csvSection(one, two, three, four));

  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/**
 * 호출부 예시.
 *
 * 이 파일은 무엇이 있는지는 보여주지만 무엇을 써야 하는지는 보여주지 않는다.
 *
 * **Monster·int 는 고정된 예시 이름이다.** 실제 시트명을 넣으면 워크북마다 이 파일이
 * 달라져, 이 파일이 워크북을 모르게 만든 이유가 사라진다. 실제 이름이 들어간 예시는
 * 화면이 보여준다 (usage.js).
 */
function usageHeader(withCsv) {
  const read = withCsv
    ? [
        '//   Func<string, string> read = name => File.ReadAllText($"Assets/GameData/{name}.csv");',
        '//',
        '//   List<Monster> rows = GameDataCsv.ReadRows<Monster>(read);',
        '//   var table = new GameDataTable<Monster, int>(rows);',
      ]
    : [
        '//   Func<string, string> read = name => File.ReadAllText($"Assets/GameData/{name}.json");',
        '//',
        '//   var table = GameDataTable<Monster, int>.Load(read);',
      ];

  return [
    '// 사용법',
    '//',
    ...read,
    '//',
    '//   Monster found = table.Get(1001);',
    '//   Monster other;',
    '//   if (table.TryGet(1002, out other)) { }',
    '//',
    '//   foreach (var row in table.Rows) { }',
    '//',
    '// Monster 와 int 자리에는 생성된 데이터 클래스와 그 기본키 타입을 넣습니다.',
    '// 읽을 파일 이름은 클래스명과 같습니다 — Monster 클래스는 Monster 를 읽습니다.',
    '',
  ];
}

/**
 * CSV 읽기.
 *
 * 사양 §6.2 는 CSV 를 "차이 확인과 다른 도구 연동용" 으로 두었지만, 런타임 형식으로
 * 쓰겠다면 읽는 경로가 있어야 한다. 대신 타입 변환이 생성 코드로 들어오고, 잘못된
 * 값은 내보내기 시점의 E006 대신 게임 실행 중 예외로 나타난다.
 *
 * 빈 셀의 뜻은 타입이 정한다 (notation §5.2). 그래서 접근자가 T·T?·T[]·T[]? 마다
 * 갈라진다 — csv-read.js 가 필드 타입을 보고 어느 것을 부를지 정한다.
 */
function csvSection(one, two, three, four) {
  return [
    `${one}/// <summary>CSV 한 행에서 값을 꺼낼 수 있는 데이터 행입니다.</summary>`,
    `${one}public interface ICsvReadable`,
    `${one}{`,
    `${two}/// <summary>한 행을 읽어 자기 필드를 채웁니다.</summary>`,
    `${two}void ReadCsvRow(GameDataCsvRow row);`,
    `${one}}`,
    '',

    ...parseClass(one, two, three, four),
    '',
    ...csvRowClass(one, two, three, four),
    '',
    ...csvReaderClass(one, two, three, four),
  ];
}

/** 문자열 → 값. 로케일에 흔들리지 않게 InvariantCulture 로 고정한다. */
function parseClass(one, two, three, four) {
  return [
    `${one}/// <summary>CSV 셀 문자열을 값으로 바꿉니다.</summary>`,
    `${one}public static class GameDataParse`,
    `${one}{`,
    `${two}public static int Int(string text)`,
    `${two}{`,
    `${three}return int.Parse(text, CultureInfo.InvariantCulture);`,
    `${two}}`,
    '',
    `${two}public static long Long(string text)`,
    `${two}{`,
    `${three}return long.Parse(text, CultureInfo.InvariantCulture);`,
    `${two}}`,
    '',
    `${two}public static float Float(string text)`,
    `${two}{`,
    `${three}return float.Parse(text, CultureInfo.InvariantCulture);`,
    `${two}}`,
    '',
    `${two}public static double Double(string text)`,
    `${two}{`,
    `${three}return double.Parse(text, CultureInfo.InvariantCulture);`,
    `${two}}`,
    '',
    `${two}/// <summary>TRUE true 1 Y O 와 FALSE false 0 N X 를 받습니다.</summary>`,
    `${two}public static bool Bool(string text)`,
    `${two}{`,
    `${three}switch (text.Trim().ToUpperInvariant())`,
    `${three}{`,
    `${four}case "TRUE": case "1": case "Y": case "O": return true;`,
    `${four}case "FALSE": case "0": case "N": case "X": return false;`,
    `${three}}`,
    `${three}throw new FormatException("bool 로 읽을 수 없습니다: " + text);`,
    `${two}}`,
    '',
    `${two}/// <summary>UTC ISO 8601 문자열을 읽습니다 (spec §6.1).</summary>`,
    `${two}public static DateTime Date(string text)`,
    `${two}{`,
    `${three}return DateTime.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);`,
    `${two}}`,
    '',
    `${two}/// <summary>enum 멤버 이름을 읽습니다. 정수가 아니라 이름입니다 (spec §11.1).</summary>`,
    `${two}public static TEnum Enum<TEnum>(string text) where TEnum : struct`,
    `${two}{`,
    `${three}return (TEnum)System.Enum.Parse(typeof(TEnum), text, false);`,
    `${two}}`,
    `${one}}`,
  ];
}

/** 헤더로 열을 찾고 타입별 규칙으로 셀을 읽는다. */
function csvRowClass(one, two, three, four) {
  return [
    `${one}/// <summary>CSV 한 행입니다. 열은 헤더 이름으로 찾습니다.</summary>`,
    `${one}public sealed class GameDataCsvRow`,
    `${one}{`,
    `${two}private readonly Dictionary<string, int> _columns;`,
    `${two}private readonly string[] _cells;`,
    `${two}private readonly string _table;`,
    `${two}private readonly int _line;`,
    '',
    `${two}public GameDataCsvRow(Dictionary<string, int> columns, string[] cells, string table, int line)`,
    `${two}{`,
    `${three}_columns = columns;`,
    `${three}_cells = cells;`,
    `${three}_table = table;`,
    `${three}_line = line;`,
    `${two}}`,
    '',
    `${two}/// <summary>셀 원문. 열이 없거나 비어 있으면 null 입니다.</summary>`,
    `${two}public string Raw(string column)`,
    `${two}{`,
    `${three}int index;`,
    `${three}if (!_columns.TryGetValue(column, out index)) return null;`,
    `${three}if (index >= _cells.Length) return null;`,
    '',
    `${three}var cell = _cells[index];`,
    `${three}return cell.Length == 0 ? null : cell;`,
    `${two}}`,
    '',
    `${two}/// <summary>필수 값입니다. 비어 있으면 예외입니다 (notation §5.2).</summary>`,
    `${two}public T Value<T>(string column, Func<string, T> parse)`,
    `${two}{`,
    `${three}return parse(Required(column));`,
    `${two}}`,
    '',
    `${two}/// <summary>비어 있으면 null 입니다.</summary>`,
    `${two}public T? ValueOrNull<T>(string column, Func<string, T> parse) where T : struct`,
    `${two}{`,
    `${three}var cell = Raw(column);`,
    `${three}return cell == null ? (T?)null : parse(cell);`,
    `${two}}`,
    '',
    `${two}/// <summary>필수 문자열입니다.</summary>`,
    `${two}public string Text(string column)`,
    `${two}{`,
    `${three}return Required(column);`,
    `${two}}`,
    '',
    `${two}/// <summary>비어 있으면 null 인 문자열입니다.</summary>`,
    `${two}public string TextOrNull(string column)`,
    `${two}{`,
    `${three}return Raw(column);`,
    `${two}}`,
    '',
    `${two}/// <summary>비어 있으면 빈 목록입니다 (T[]).</summary>`,
    `${two}public List<T> ValueList<T>(string column, Func<string, T> parse, string delimiter)`,
    `${two}{`,
    `${three}var found = new List<T>();`,
    `${three}var cell = Raw(column);`,
    `${three}if (cell == null) return found;`,
    '',
    `${three}foreach (var element in GameDataCsv.SplitElements(cell, delimiter))`,
    `${three}{`,
    `${four}if (element.Length == 0) throw Fail(column, "배열에 빈 원소가 있습니다");`,
    `${four}found.Add(parse(element));`,
    `${three}}`,
    `${three}return found;`,
    `${two}}`,
    '',
    `${two}/// <summary>비어 있으면 null 인 목록입니다 (T[]?).</summary>`,
    `${two}public List<T> ValueListOrNull<T>(string column, Func<string, T> parse, string delimiter)`,
    `${two}{`,
    `${three}return Raw(column) == null ? null : ValueList(column, parse, delimiter);`,
    `${two}}`,
    '',
    `${two}/// <summary>원소가 비어 있을 수 있는 목록입니다 (T?[]).</summary>`,
    `${two}public List<T?> NullableList<T>(string column, Func<string, T> parse, string delimiter)`,
    `${two}{`,
    `${three}var found = new List<T?>();`,
    `${three}var cell = Raw(column);`,
    `${three}if (cell == null) return found;`,
    '',
    `${three}foreach (var element in GameDataCsv.SplitElements(cell, delimiter))`,
    `${three}{`,
    `${four}found.Add(element.Length == 0 ? (T?)null : parse(element));`,
    `${three}}`,
    `${three}return found;`,
    `${two}}`,
    '',
    `${two}/// <summary>비어 있으면 null 이고 원소도 비어 있을 수 있는 목록입니다 (T?[]?).</summary>`,
    `${two}public List<T?> NullableListOrNull<T>(string column, Func<string, T> parse, string delimiter)`,
    `${two}{`,
    `${three}return Raw(column) == null ? null : NullableList(column, parse, delimiter);`,
    `${two}}`,
    '',
    `${two}/// <summary>문자열 목록입니다 (string[]).</summary>`,
    `${two}public List<string> TextList(string column, string delimiter)`,
    `${two}{`,
    `${three}var cell = Raw(column);`,
    `${three}return cell == null ? new List<string>() : GameDataCsv.SplitElements(cell, delimiter);`,
    `${two}}`,
    '',
    `${two}/// <summary>비어 있으면 null 인 문자열 목록입니다 (string[]?).</summary>`,
    `${two}public List<string> TextListOrNull(string column, string delimiter)`,
    `${two}{`,
    `${three}return Raw(column) == null ? null : TextList(column, delimiter);`,
    `${two}}`,
    '',
    `${two}private string Required(string column)`,
    `${two}{`,
    `${three}var cell = Raw(column);`,
    `${three}if (cell == null) throw Fail(column, "필수 값이 비었습니다");`,
    `${three}return cell;`,
    `${two}}`,
    '',
    `${two}/// <summary>어느 표의 몇 번째 줄, 어느 열인지 알려줍니다.</summary>`,
    `${two}private FormatException Fail(string column, string reason)`,
    `${two}{`,
    `${three}return new FormatException(_table + ".csv " + _line + "줄 " + column + " 열: " + reason);`,
    `${two}}`,
    `${one}}`,
  ];
}

/** CSV 텍스트를 행으로 자르고, 셀 안의 배열 원소를 다시 자른다. */
function csvReaderClass(one, two, three, four) {
  return [
    `${one}/// <summary>CSV 를 읽습니다.</summary>`,
    `${one}public static class GameDataCsv`,
    `${one}{`,
    `${two}/// <summary>표 하나를 읽습니다. 파일 이름은 클래스명과 같습니다 (spec §6.4).</summary>`,
    `${two}/// <param name="readCsv">표 이름(확장자 없음)을 받아 CSV 문자열을 돌려줍니다.</param>`,
    `${two}public static List<T> ReadRows<T>(Func<string, string> readCsv) where T : ICsvReadable, new()`,
    `${two}{`,
    `${three}if (readCsv == null) throw new ArgumentNullException(nameof(readCsv));`,
    '',
    `${three}var table = typeof(T).Name;`,
    `${three}var lines = Tokenize(readCsv(table));`,
    `${three}var found = new List<T>();`,
    `${three}if (lines.Count == 0) return found;`,
    '',
    `${three}var columns = new Dictionary<string, int>(lines[0].Length);`,
    `${three}for (var i = 0; i < lines[0].Length; i += 1) columns[lines[0][i]] = i;`,
    '',
    `${three}for (var i = 1; i < lines.Count; i += 1)`,
    `${three}{`,
    // 첫 줄이 헤더이므로 사람이 보는 줄 번호는 i + 1 이다.
    `${four}var row = new GameDataCsvRow(columns, lines[i], table, i + 1);`,
    `${four}var item = new T();`,
    `${four}item.ReadCsvRow(row);`,
    `${four}found.Add(item);`,
    `${three}}`,
    `${three}return found;`,
    `${two}}`,
    '',
    `${two}/// <summary>CSV 텍스트를 줄 단위 셀 배열로 자릅니다. 인용 안의 줄바꿈도 다룹니다.</summary>`,
    `${two}public static List<string[]> Tokenize(string text)`,
    `${two}{`,
    `${three}var lines = new List<string[]>();`,
    `${three}if (string.IsNullOrEmpty(text)) return lines;`,
    '',
    `${three}var cells = new List<string>();`,
    `${three}var cell = new System.Text.StringBuilder();`,
    `${three}var quoted = false;`,
    `${three}var index = 0;`,
    '',
    `${three}while (index < text.Length)`,
    `${three}{`,
    `${four}var current = text[index];`,
    '',
    `${four}if (quoted)`,
    `${four}{`,
    `${four}${one}if (current == '"')`,
    `${four}${one}{`,
    // "" 는 닫는 따옴표가 아니라 값 안의 따옴표 한 개다.
    `${four}${two}if (index + 1 < text.Length && text[index + 1] == '"') { cell.Append('"'); index += 2; continue; }`,
    `${four}${two}quoted = false;`,
    `${four}${two}index += 1;`,
    `${four}${two}continue;`,
    `${four}${one}}`,
    `${four}${one}cell.Append(current);`,
    `${four}${one}index += 1;`,
    `${four}${one}continue;`,
    `${four}}`,
    '',
    `${four}if (current == '"') { quoted = true; index += 1; continue; }`,
    `${four}if (current == ',') { cells.Add(cell.ToString()); cell.Length = 0; index += 1; continue; }`,
    `${four}if (current == '\\n' || current == '\\r')`,
    `${four}{`,
    `${four}${one}cells.Add(cell.ToString());`,
    `${four}${one}cell.Length = 0;`,
    `${four}${one}lines.Add(cells.ToArray());`,
    `${four}${one}cells.Clear();`,
    // CRLF 를 한 줄로 센다.
    `${four}${one}if (current == '\\r' && index + 1 < text.Length && text[index + 1] == '\\n') index += 1;`,
    `${four}${one}index += 1;`,
    `${four}${one}continue;`,
    `${four}}`,
    '',
    `${four}cell.Append(current);`,
    `${four}index += 1;`,
    `${three}}`,
    '',
    // 파일 끝에 개행이 없으면 마지막 줄이 남는다.
    `${three}if (cell.Length > 0 || cells.Count > 0)`,
    `${three}{`,
    `${four}cells.Add(cell.ToString());`,
    `${four}lines.Add(cells.ToArray());`,
    `${three}}`,
    `${three}return lines;`,
    `${two}}`,
    '',
    `${two}/// <summary>셀 안의 배열을 원소로 자릅니다 (notation §5.3).</summary>`,
    `${two}public static List<string> SplitElements(string cell, string delimiter)`,
    `${two}{`,
    `${three}var found = new List<string>();`,
    `${three}var element = new System.Text.StringBuilder();`,
    `${three}var quoted = false;`,
    `${three}var index = 0;`,
    '',
    `${three}while (index < cell.Length)`,
    `${three}{`,
    `${four}if (quoted)`,
    `${four}{`,
    `${four}${one}if (cell[index] == '"')`,
    `${four}${one}{`,
    `${four}${two}if (index + 1 < cell.Length && cell[index + 1] == '"') { element.Append('"'); index += 2; continue; }`,
    `${four}${two}quoted = false;`,
    `${four}${two}index += 1;`,
    `${four}${two}continue;`,
    `${four}${one}}`,
    `${four}${one}element.Append(cell[index]);`,
    `${four}${one}index += 1;`,
    `${four}${one}continue;`,
    `${four}}`,
    '',
    `${four}if (cell[index] == '"') { quoted = true; index += 1; continue; }`,
    `${four}if (string.CompareOrdinal(cell, index, delimiter, 0, delimiter.Length) == 0)`,
    `${four}{`,
    `${four}${one}found.Add(element.ToString());`,
    `${four}${one}element.Length = 0;`,
    `${four}${one}index += delimiter.Length;`,
    `${four}${one}continue;`,
    `${four}}`,
    '',
    `${four}element.Append(cell[index]);`,
    `${four}index += 1;`,
    `${three}}`,
    '',
    `${three}found.Add(element.ToString());`,
    `${three}return found;`,
    `${two}}`,
    `${one}}`,
  ];
}
