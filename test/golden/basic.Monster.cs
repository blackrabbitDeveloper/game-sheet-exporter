using System;
using System.Collections.Generic;

namespace GameData
{
    /// <summary>Monster 시트의 한 행입니다.</summary>
    [Serializable]
    public sealed class Monster : IGameData<int>
    {
        /// <summary>고유ID</summary>
        public int id;

        /// <summary>이름 (로컬라이즈 키)</summary>
        public string name;

        /// <summary>체력</summary>
        public int hp;

        /// <summary>등급</summary>
        public Grade grade;

        /// <summary>드랍 (→ Item.id)</summary>
        public List<int> drop_ids;

        /// <summary>기본키입니다 (id).</summary>
        int IGameData<int>.Key => id;
    }
}
