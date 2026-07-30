// 예시 워크북.
//
// 사양: docs/spec.md §3(시트 포맷 규약) · docs/notation.md
//
// readWorkbook 이 내는 것과 같은 모양(`{fileName, sheets:[{name, rows}]}`)이라
// 파이프라인에 그대로 넣을 수 있다. 그래서 xlsx 바이트를 base64 로 소스에 박거나
// UI 가 SheetJS 를 직접 쓰지 않아도 된다.
//
// 모든 셀이 문자열이다. 엑셀에서 읽은 값은 전부 문자열이고(notation §5.1), 예시가
// 숫자를 담으면 파서가 실제로 받는 것과 다른 입력을 보여주게 된다.
//
// **이 예시는 진단을 하나도 내지 않아야 한다.** 첫 화면에서 보는 것이 올바른 시트여야
// 하고, 경고가 뜨면 사람이 규약을 잘못 배운다. test/ui-pipeline.test.mjs 가 확인한다.

export const SAMPLE_WORKBOOK = Object.freeze({
  fileName: '예시.xlsx',
  sheets: [
    {
      name: 'Monster',
      rows: [
        ['id', 'name', 'hp', 'grade', 'drop_ids', 'parent_id'],
        ['int', 'loc', 'int', 'enum:Grade', 'ref:Item.id[]', 'ref:Monster.id?'],
        ['고유 번호', '이름 키', '체력', '등급', '드랍 아이템', '상위 몬스터'],
        ['1001', 'MON_SLIME', '30', 'Normal', '2001', ''],
        ['1002', 'MON_GOBLIN', '55', 'Rare', '2001,2002', ''],
        // 상위 몬스터로 같은 시트의 1002 를 가리킨다 — 자기 시트 참조도 된다.
        ['1003', 'MON_ORC', '120', 'Unique', '2002', '1002'],
      ],
    },
    {
      name: 'Item',
      rows: [
        ['id', 'name', 'price', 'stackable'],
        ['int', 'loc', 'int', 'bool'],
        ['고유 번호', '이름 키', '가격', '겹치기'],
        // bool 은 Y·O·TRUE·1 을 모두 참으로 읽는다 (notation §3.1).
        ['2001', 'ITEM_POTION', '50', 'Y'],
        ['2002', 'ITEM_HERB', '10', 'TRUE'],
      ],
    },
    {
      name: 'enum.Grade',
      rows: [
        ['name', 'value', 'comment'],
        ['string', 'int?', 'string?'],
        ['이름', '값', '설명'],
        ['Normal', '0', '일반'],
        ['Rare', '10', '희귀'],
        // 값을 비우면 이전 값 + 1 이 된다 (spec §3.3). 여기서는 11 이다.
        ['Unique', '', '유니크'],
      ],
    },
  ],
});

/**
 * 가이드에 보여줄 시트 구조. SAMPLE_WORKBOOK 의 Monster 시트에서 앞 네 열만 뽑는다.
 *
 * 표를 손으로 다시 쓰지 않는 이유는, 예시를 고쳤을 때 가이드가 조용히 낡는 것을
 * 막기 위해서다.
 */
export const GUIDE_COLUMNS = 4;

export function guideRows() {
  const monster = SAMPLE_WORKBOOK.sheets[0].rows;
  const labels = ['필드명', '타입', '주석', '데이터'];

  return labels.map((label, index) => ({
    label,
    rowNumber: index + 1,
    cells: monster[index].slice(0, GUIDE_COLUMNS),
  }));
}
