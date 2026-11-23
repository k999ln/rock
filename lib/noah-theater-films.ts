import { noahProjectHref } from './noah-project-view.ts';

// Each film is an editorial example tied to a catalog entry, not a recorded user job.
export const noahTheaterFilms = [
  {
    id: 'memory',
    agent: 'Memory',
    title: '最後の引き継ぎ',
    outcome: ['ミナ → 照明', 'ユウ → 録音'],
    href: noahProjectHref('project-fe39bc2610e52b2b6f77059f22f0a485bc356e083bfcc5ff20263ae6713fe10b'),
    poster: '/noah/theater/memory.webp',
    scenes: [
      { caption: '名前はある。担当が見えない。', detail: '例のメモには「ミナは照明、ユウは録音」とだけ書かれています。' },
      { caption: '二つの名前に、一本ずつ線が走る。', detail: 'Memoryにメモを渡し、人と作業の関係を整理するよう依頼します。' },
      { caption: '次の人が、迷わず始められる。', detail: '誰が何を担当するか、関係を整理したメモを成果として開けます。' },
    ],
  },
  {
    id: 'time',
    agent: 'Time',
    title: 'もうひとつの零時',
    outcome: ['東京 09:00 → UTC 00:00'],
    href: noahProjectHref('project-0b8dcb5ee61c85e2a26f470d3f2547ad5f2c3eec25016f1ecb3f6d48ee71e836'),
    poster: '/noah/theater/time.webp',
    scenes: [
      { caption: '同じ約束に、二つの時計。', detail: '東京の朝9時に決めた打ち合わせ。相手にはUTCで伝える必要があります。' },
      { caption: '東京の針を、九時間戻す。', detail: 'Timeに元の時刻とタイムゾーン、変換先のUTCを指定します。' },
      { caption: '朝九時と、午前零時が重なる。', detail: '返るのは変換した時刻です。この例では東京の09:00が同日の00:00 UTCに当たります。' },
    ],
  },
  {
    id: 'training',
    agent: '法人のsi導入準備',
    title: '会議の前の五分間',
    outcome: ['月2回 × 5分 → 月10分'],
    href: noahProjectHref('project-777248dbd7e37423d0bae088fc9201cfec479dd305b7d94a544cd22face444ad'),
    poster: '/noah/theater/training.webp',
    scenes: [
      { caption: '研修で、何を聞けばいい？', detail: '例にするのは、月2回、1人が5分かけて紙のメモをまとめる仕事です。' },
      { caption: '紙の仕事を、一行ずつほどく。', detail: '準備票に作業内容、回数、所要時間を入力し、整理したい業務を伝えます。' },
      { caption: '一枚の準備票を手に、席に着く。', detail: '作業時間の内訳と研修で聞くことが届きます。相談するかは自分で選べます。' },
    ],
  },
] as const;
