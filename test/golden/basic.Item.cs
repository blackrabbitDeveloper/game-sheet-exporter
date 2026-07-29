using System;

namespace GameData
{
    /// <summary>Item 시트의 한 행입니다.</summary>
    [Serializable]
    public sealed class Item
    {
        /// <summary>고유ID</summary>
        public int id;

        /// <summary>이름 (로컬라이즈 키)</summary>
        public string name;
    }
}
