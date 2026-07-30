using System;

namespace GameData
{
    /// <summary>생성된 데이터 테이블 모음입니다.</summary>
    public sealed class GameDataTables
    {
        /// <summary>Monster 시트</summary>
        public GameDataTable<Monster, int> MonsterTable { get; }

        /// <summary>Item 시트</summary>
        public GameDataTable<Item, int> ItemTable { get; }

        private GameDataTables(
            GameDataTable<Monster, int> monsterTable,
            GameDataTable<Item, int> itemTable)
        {
            MonsterTable = monsterTable;
            ItemTable = itemTable;
        }

        /// <summary>테이블을 모두 읽어들입니다.</summary>
        /// <param name="readJson">테이블 이름(확장자 없음)을 받아 JSON 문자열을 돌려줍니다.</param>
        public static GameDataTables Load(Func<string, string> readJson)
        {
            if (readJson == null) throw new ArgumentNullException(nameof(readJson));

            return new GameDataTables(
                GameDataTable<Monster, int>.Load(readJson),
                GameDataTable<Item, int>.Load(readJson));
        }
    }
}
