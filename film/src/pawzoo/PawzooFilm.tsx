import { createFilm } from '../components/Film';
import { SCENES } from './script';
import { ApproveScene, HistoryScene, IntroScene, NoticeScene, OrderScene, OutroScene, ProposeScene, ReceiptScene, WalkScene } from './scenes';

export const pawzooFilm = createFilm('pawzoo', SCENES, {
  intro: IntroScene,
  notice: NoticeScene,
  propose: ProposeScene,
  order: OrderScene,
  approve: ApproveScene,
  receipt: ReceiptScene,
  walk: WalkScene,
  history: HistoryScene,
  outro: OutroScene,
});
