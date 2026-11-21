// 빙고판에 넣을 수 있는 내용(숫자·테마·커스텀)을 모아 둡니다.
// 테마는 모두 25개라서 5×5 는 그대로, 4×4 는 같은 테마에서 16개를 골라 씁니다.

export const SIZE_CELLS = { 4: 16, 5: 25 };

export const THEMES = {
  food: {
    name: '음식', emoji: '🍚',
    items: [
      '김치찌개', '비빔밥', '떡볶이', '삼겹살', '치킨', '피자', '햄버거', '라면', '김밥', '순두부찌개',
      '불고기', '물냉면', '짜장면', '탕수육', '돈가스', '우동', '만두', '붕어빵', '아이스크림', '초콜릿',
      '사과', '바나나', '수박', '딸기', '커피',
    ],
  },
  animal: {
    name: '동물', emoji: '🐾',
    items: [
      '강아지', '고양이', '토끼', '사자', '호랑이', '코끼리', '기린', '원숭이', '판다', '여우',
      '늑대', '곰', '독수리', '부엉이', '펭귄', '돌고래', '상어', '거북이', '개구리', '뱀',
      '다람쥐', '사슴', '얼룩말', '앵무새', '햄스터',
    ],
  },
  school: {
    name: '학교·일상', emoji: '🏫',
    items: [
      '급식', '체육', '수학', '국어', '영어', '도서관', '기숙사', '운동장', '시험', '숙제',
      '청소', '조회', '종례', '축제', '야시장', '동아리', '선생님', '친구', '버스', '자전거',
      '우산', '알람', '샤워', '양치', '일기',
    ],
  },
  english: {
    name: '영어 기초', emoji: '🔤',
    items: [
      'apple', 'banana', 'cat', 'dog', 'egg', 'fish', 'grape', 'hat', 'ice', 'juice',
      'kite', 'lion', 'moon', 'nose', 'orange', 'panda', 'queen', 'rabbit', 'sun', 'tiger',
      'umbrella', 'van', 'water', 'box', 'yellow',
    ],
  },
};

export const CONTENT_LABEL = {
  number: '숫자',
  theme: '테마',
  custom: '직접 입력',
};

export function themeName(id) {
  return THEMES[id]?.name ?? '테마';
}

/** 숫자 빙고 값: '1' … '25' (보기 좋게 문자열로 통일) */
export function numberItems(size) {
  return Array.from({ length: SIZE_CELLS[size] }, (_, i) => String(i + 1));
}
