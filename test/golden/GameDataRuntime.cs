// 사용법
//
//   Func<string, string> read = name => File.ReadAllText($"Assets/GameData/{name}.json");
//
//   var table = GameDataTable<Monster, int>.Load(read);
//
//   Monster found = table.Get(1001);
//   Monster other;
//   if (table.TryGet(1002, out other)) { }
//
//   foreach (var row in table.Rows) { }
//
// Monster 와 int 자리에는 생성된 데이터 클래스와 그 기본키 타입을 넣습니다.
// 읽을 파일 이름은 클래스명과 같습니다 — Monster 클래스는 Monster 를 읽습니다.

using System;
using System.Collections.Generic;
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
}
