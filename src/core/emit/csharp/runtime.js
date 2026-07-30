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
 * @param {{namespace?: string}} [options]
 * @returns {Array<{fileName: string, text: string}>} 항상 파일 하나
 */
export function emitCSharpRuntime(_ir, options = {}) {
  const namespace = options.namespace ?? DEFAULT_NAMESPACE;
  return [{ fileName: 'GameDataRuntime.cs', text: render(namespace) }];
}

function render(namespace) {
  const one = INDENT;
  const two = INDENT.repeat(2);
  const three = INDENT.repeat(3);

  const lines = [
    'using System;',
    'using System.Collections.Generic;',
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
    '}',
  ];

  return `${lines.join('\n')}\n`;
}
