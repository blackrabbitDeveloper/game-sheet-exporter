using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace GameData
{
    /// <summary>생성된 데이터 테이블 모음입니다.</summary>
    public sealed class GameDataTables
    {
        /// <summary>Monster 시트</summary>
        public IReadOnlyList<Monster> MonsterTable { get; }

        /// <summary>Item 시트</summary>
        public IReadOnlyList<Item> ItemTable { get; }

        private readonly Dictionary<int, Monster> _monsterById;
        private readonly Dictionary<int, Item> _itemById;

        private GameDataTables(List<Monster> monsterRows, List<Item> itemRows)
        {
            MonsterTable = monsterRows;
            ItemTable = itemRows;

            _monsterById = new Dictionary<int, Monster>(monsterRows.Count);
            foreach (var row in monsterRows) _monsterById[row.id] = row;

            _itemById = new Dictionary<int, Item>(itemRows.Count);
            foreach (var row in itemRows) _itemById[row.id] = row;
        }

        /// <summary>Monster 행을 기본키로 찾습니다. 없으면 KeyNotFoundException 입니다.</summary>
        public Monster GetMonster(int id)
        {
            return _monsterById[id];
        }

        /// <summary>Monster 행을 기본키로 찾습니다. 없으면 false 입니다.</summary>
        public bool TryGetMonster(int id, out Monster value)
        {
            return _monsterById.TryGetValue(id, out value);
        }

        /// <summary>Item 행을 기본키로 찾습니다. 없으면 KeyNotFoundException 입니다.</summary>
        public Item GetItem(int id)
        {
            return _itemById[id];
        }

        /// <summary>Item 행을 기본키로 찾습니다. 없으면 false 입니다.</summary>
        public bool TryGetItem(int id, out Item value)
        {
            return _itemById.TryGetValue(id, out value);
        }

        /// <summary>테이블을 읽어들입니다.</summary>
        /// <param name="readJson">테이블 이름(확장자 없음)을 받아 JSON 문자열을 돌려줍니다.</param>
        public static GameDataTables Load(Func<string, string> readJson)
        {
            if (readJson == null) throw new ArgumentNullException(nameof(readJson));

            return new GameDataTables(
                ReadTable<Monster>(readJson, "Monster"),
                ReadTable<Item>(readJson, "Item"));
        }

        private static List<T> ReadTable<T>(Func<string, string> readJson, string name)
        {
            var table = JsonConvert.DeserializeObject<Table<T>>(readJson(name));
            return table?.rows ?? new List<T>();
        }

        /// <summary>JSON 최상위의 rows 래퍼입니다.</summary>
        private sealed class Table<T>
        {
            public List<T> rows;
        }
    }
}
