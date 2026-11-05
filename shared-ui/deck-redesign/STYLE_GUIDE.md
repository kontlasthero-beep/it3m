# Second Chance 덱 UI 에셋 스타일 가이드

## 기준 에셋과 용도

| 파일 | 용도 | 이미지 크기 |
| --- | --- | --- |
| `deck-window-v2.png` | 덱 보관함의 큰 배경 패널 | 1586 × 992 |
| `deck-slot-v2.png` | 보관함의 저장 슬롯과 빈 슬롯 | 1942 × 809 |
| `deck-add-v2.png` | 빈 슬롯의 구리색 `+` | 1536 × 1024 |
| `hero-portrait-frame-v2.png` | 영웅 초상화 테두리 | 1086 × 1448 |
| `map-deck-tray-v1.png` | 맵 선택 단계에서 덱 선택 영역의 받침판 | 2172 × 724 |
| `map-deck-plate-v1.png` | 선택 중인 덱 이름과 영웅 초상화의 명패 | 2172 × 724 |
| `map-deck-arrow-v1.png` | 이전·다음 덱 버튼의 공통 외형 | 1024 × 1536 |

새 에셋은 이 폴더의 실물 이미지들을 함께 참조한다. 로비의 다른 프레임을 임의로 혼합하지 않는다.

## 시각 언어

- **재질:** AAB 이후에 회수한 장비처럼 보이는 짙은 청록색 산화 금속과 얇고 마모된 구리 테두리. 카드를 꽂거나 꺼낼 수 있는 물리적인 기구의 두께가 느껴져야 한다.
- **형태:** 직각에 가까운 긴 판과 45도 안팎으로 절단된 모서리. 가장자리에는 한 겹의 주된 구리 프레임과 더 가는 내부 선을 둔다. 여러 겹의 동심 테두리나 기하학 장식은 넣지 않는다.
- **표면:** 어두운 중앙을 유지하고 가장자리와 모서리에 긁힘, 산화, 미세한 사용 흔적을 집중한다. 가운데의 질감은 글자와 초상화를 가리지 않을 정도로만 보인다.
- **색:** 바탕은 거의 검정에 가까운 청록(`#0d1c1d`~`#173333`), 홈은 더 어두운 청록, 프레임은 녹슨 구리·호박색(`#9b6844`~`#c58d5a`), 텍스트는 따뜻한 상아색(`#f0e1c4`). 밝은 금색을 넓은 면에 채우지 않는다.
- **조명:** 얇은 모서리 반사와 약한 안쪽 그림자로 입체감을 만든다. 에너지 발광, 연기, 비네트는 덱 UI 자체에는 넣지 않는다. 배경 삽화가 주인공으로 남아야 한다.
- **문자:** 래스터 에셋에는 글자·숫자·아이콘·화살표를 새겨 넣지 않는다. HTML 텍스트와 상태를 위에 얹는다. 제목은 `SecondChance Gowun Batang` 명조체를 보통 굵기로, 짧은 버튼 글자는 높은 대비로 사용한다.

## 생성·출력 규격

1. 동일 폴더의 `deck-window-v2.png`와 `deck-slot-v2.png`를 색·재질 기준 이미지로 제공한다. 새 UI의 기능과 실제 표시 비율을 별도로 설명한다.
2. PNG는 투명 배경으로, 정면에서 본 직교 UI 조각으로 만든다. 내외부 모두 글자가 없는 빈 판이어야 한다. 투명 배경의 가장자리에 검은 후광이나 화면 전체 조명을 그리지 않는다.
3. 긴 명패는 초상화 영역과 넓은 글자 영역을 분리한다. 초상화가 없는 슬롯은 중앙에 `+`를 HTML로 얹을 수 있도록 빈 공간을 둔다.
4. 이전·다음 버튼은 같은 에셋을 재사용하고 방향 기호만 HTML에서 변경한다. hover·focus·disabled는 별도 비트맵 대신 밝기와 윤곽 강조로 처리한다.
5. 생성 원본은 화면에 실제로 배치했을 때 글자·초상화가 프레임 안에 들어오는지 확인한다. 작은 크기에서는 긁힘이 점무늬처럼 뭉치지 않아야 한다.
6. `map-deck-plate-v1.png`와 `map-deck-tray-v1.png`는 원본 상하에 약 19%의 투명 여백이 있다. CSS에서는 `background-size: 100% 160%`로 표시 프레임을 복원한다. 다음 버전에서는 투명 여백을 줄인 원본을 만드는 편이 좋다.
7. 가변 폭에서 모서리와 초상화 칸이 심하게 늘어나면 중앙의 반복 가능한 면과 모서리 조각을 분리하거나 9-slice로 출력한다. 텍스트는 항상 별도 레이어로 남긴다.

## 재사용 프롬프트 골격

> Create a production-ready, front-facing 2D game UI asset for Second Chance. Match the supplied deck-window-v2 and deck-slot-v2 references: deep oxidized petrol teal, restrained weathered copper edges, clipped corners, tactile salvage equipment, fine scratches focused at the rim, dark quiet center for readable text. Transparent background. [구체적인 형태·비율·초상화 홈 위치·용도]. No letters, numbers, symbols, glyphs, arrows, character art, scenery, smoke, neon, or broad glow. The result must remain clear at [실제 표시 크기] and leave safe space for HTML text.

## 적용 및 검수

- 보관함 제목은 바깥 구리 프레임과 겹치지 않게 내부 여백에 놓고, 밝은 상아색 명조체를 사용한다.
- 덱 이름은 초상화 홈을 침범하지 않아야 한다. 긴 이름은 최대 두 줄까지 허용하고 더 길면 자른다.
- 버튼에는 브라우저 기본 테두리가 비치지 않아야 한다. 키보드 focus는 별도 윤곽으로 반드시 보인다.
- 1인·로컬 2인 화면과 좁은 화면에서 명패, 초상화, 이름, 화살표가 서로 겹치지 않아야 한다.
- 에셋이 로딩되지 않아도 덱 이름과 선택 동작은 유지되어야 한다. `prefers-reduced-motion`에서는 슬라이드 전환을 정지한다.

## 이번 명패 세트 제작 기록

`map-deck-plate-v1.png`는 왼쪽 초상화 홈과 오른쪽 빈 이름판을 가진 수평 명패, `map-deck-arrow-v1.png`는 방향 기호가 없는 세로 버튼 바탕, `map-deck-tray-v1.png`는 두 플레이어의 선택기를 받치는 긴 판으로 생성했다. 모두 기존 보관함 슬롯·패널을 스타일 참조로 사용한 투명 PNG 원본이다.
