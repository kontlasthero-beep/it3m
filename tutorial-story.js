(function (root) {
  'use strict';
  // Add a relative audio path to voiceSrc when a recorded line becomes available.
  const line = (id, text) => ({ id, text, voiceSrc: null });
  root.SecondChanceTutorial = {
    speaker: '더글라스 피스트 · 빅보이',
    portrait: '영웅 초상화/big boy.png',
    introduction: [
      line('welcome', '너가 이번에 새로 들어왔다는 신입이냐.'),
      line('introduce', '내 이름은 더글라스 피스트, 사람들은 날 빅보이라고도 부르지.'),
      line('ask-name', '그래 신입, 네 이름은 뭐냐?')
    ],
    briefing: [
      line('name-response', '{name}… 그래, 오늘은 특별히 내가 우리 신입을 교육시켜주도록 하지.'),
      line('question', '{name}, 너는 이 새로운 세상에서 가장 중요한 게 뭐라고 생각하나?'),
      line('exploration', '바로 가능한 멀리 나아가는 것이다. 너가 이전 세상에 대해 얼마만큼 알고 있는지 모르지만, AI가 바꿔놓은 이 새로운 세상은 미지로 가득 차 있어.'),
      line('risk', '너무 멀리 나아가면 추락할 수도 있지. 그렇지만 가능한 멀리 나아가야 한다. 더 많은 것들을 차지하기 위해서 말이야.')
    ],
    lessons: [
      { id: 'launch', title: '멀리 나아가기', text: '발사 버튼을 누르고, 얼마만큼의 힘으로 스톤을 발사할지 결정하세요. 결정을 완료했으면 스톤을 드래그하여 방향을 정해 발사하세요.', objective: '80점 이상인 위치에 스톤을 멈추세요.', dialogue: [] },
      { id: 'collision', title: '상대 밀어내기', text: '발사 파워와 방향을 정해 상대 스톤을 테이블 밖으로 밀어내세요.', objective: '상대 스톤을 떨어뜨리세요.', dialogue: [
        line('push-intro', '만약 너를 가로막는 뭔가가 등장한다면… 뭘 해야 할지 알고 있지? 힘껏 밀쳐내 떨어뜨려 버리라고.')
      ] },
      { id: 'cards', title: '카드 사용', kind: 'card', elementId: 'ammo', timed: true, text: '총알 장전 카드를 자신의 스톤에 사용하고, 스톤을 드래그해 총알을 발사하세요.', objective: '총알 장전으로 상대 스톤을 떨어뜨리세요.', dialogue: [
        line('cards-intro', '남보다 앞서가기 위해선 때론 비겁한 수도 서슴지 않아야 하지.'),
        line('cards-rule', '카드는 자신의 차례마다 한 장씩 받게 되며, 자신의 차례엔 제한 없이 사용할 수 있어. 카드를 사용해 불리한 상황에서 벗어나거나, 유리한 위치를 점거하라고.')
      ] },
      { id: 'triggers', title: '트리거', kind: 'trigger', elementId: 'pulse', text: '앞에 놓인 방출 트리거를 활용해 경질화된 상대 스톤을 떨어뜨리세요.', objective: '트리거를 이용해 상대 스톤을 떨어뜨리세요.', dialogue: [
        line('triggers-intro', '트리거… AI 녀석이 세상을 망쳐놓은 후 종종 발견되는 미지의 힘이야. 잘만 이용한다면, 상황을 유리하게 가져갈 수 있지.'),
        line('triggers-rule', '트리거는 불안정한 힘이라, 너와 맞닿으면 그 힘이 풀려나게 될 거야. 무슨 일이 벌어질지는 그 트리거의 생김새를 보고 유추해볼 수 있어.')
      ] }
    ],
    responses: {
      launchSuccess: line('launch-success', '아주 잘하는군.'),
      launchShort: line('launch-short', '이 정도론 부족하지, 한 번 다시 시도해보라고.'),
      launchFall: line('launch-fall', '욕심이 과했군, 한 번 다시 해보도록.'),
      collisionSuccess: line('push-success', '좋아, 그렇게 하는 거야.'),
      collisionFail: line('push-fail', '정밀함이 부족하군, 다시 해보라고.'),
      cardsSuccess: line('cards-success', '겁도 없이 이 빅보이의 앞을 가로막다니, 가소롭군.'),
      cardsFail: line('cards-fail', '영점 조절이 필요한가? 다시 해보라고.'),
      cardsTimeout: line('cards-timeout', '신중한 건 좋지만, 좀 서두르라고. 실전에선 이렇게 여유롭지 못할걸.'),
      triggersSuccess: line('triggers-success', '잘했어. 트리거는 게임당 한 번, 너가 원하는 위치에 배치할 수도 있다는 걸 기억해둬.'),
      triggersFail: line('triggers-fail', '이봐, 진심이야?')
    },
    farewell: line('farewell', '잘했어 신입. 실력이 꽤 봐줄 만하군. 장비 챙겨라. 곧 데이터센터를 조사하러 떠날 건데, 너도 함께하게 해주지.')
  };
})(globalThis);
