# 江戸素材・追加79 ZIPの確認

> 更新：ユーザーの「今回は使って おすすめ配置強化」に基づき、9種類を実ゲームへ組み込み。以下のローカル試作・公開未実施の記述は初回検討時点の記録。最新状態は `docs/CLAUDE_HANDOFF.md` を参照。

追加分79 ZIPをすべて展開。圧縮時の合計約80MiB。今回分にZIP全体の完全一致重複はなし。前回35 ZIPと合わせて114ファイル、前回の門の重複を除き113種類。

おすすめの配置は [城下町の配置案](plans/edo-town-layout.md) と [配置図](plans/edo-town-layout.svg) を参照。

## 採用優先

- 蕎麦屋台、掛茶屋、行灯：商店街の入口と門前。
- 常夜灯、雪見灯籠、地蔵：参道の目印と脇の庭。
- 塀、高麗門：屋敷・城郭への区画切り替え。
- 板塀、井戸周りの生活道具：裏長屋の雰囲気作り。
- 農家、稲架、唐箕、船：農村・川沿いを作る段階で使う。市街地に無理に混ぜない。

## 分かったこと

- `pp2_nouka2` にはPP2・小さなプレビューPNG・READMEだけが入っている。READMEが挙げる屋根・壁・草等のJPGがこのZIPにはない。代わりに素材がそろう `obj_nouka1` を候補として変換した。
- 東京駅、バス、バスガール用小物は今回の江戸風ステージから外す。
- V3/V4の花魁、M3の職人・旅人・作務衣は特定の人物モデル用の衣装。完成済みの人物・ゲーム用モーションとして数えない。
- 馬具セットはP4馬用。馬そのものの追加ではない。
- 柴犬は実モデルとPoser CR2がある。READMEではHARURANMAN作、HONEYによる許諾済みCR2化と説明されている。ゲームへの歩行・待機モーション移植は別作業。
- 和本は各形状合計約11.2万三角形、蚊帳は埋め込み形状合計約19.5万三角形。小道具でも重いものがあるため、見た目のサイズだけで採用を決めない。
- 掛茶屋のセットには家具・食器・簾等が複数含まれる。ローカルGLB試作は茶屋本体のみ。完成セットを組み立てた状態とは区別する。
- GLBへの変換は11種で成功。JSONの一覧は `plans/edo-local-selection.json`。モデル本体はローカル検証用で、リポジトリと公開サイトには含まれない。

## 一覧

数値はZIP内形状の概算三角化合計。OBJがある場合はOBJを集計し、それ以外はPP2/CR2内の埋め込み形状を集計。バリエーション、重複形状、衣装パーツを含み、最終配置時の描画量ではない。

| ZIP | 付属説明の名称 | 主な形状 | 概算三角形 |
|---|---|---|---:|
| cr2_baguset | Japanese Harness and Saddle set for P4horse(mideaval) | OBJ | 11,832 |
| cr2_baguset2 | Japanese Harness and Saddle set for P4horse(modern) | OBJ | 8,486 |
| cr2_baguset3 | Japanese Harness and Saddle set for P4horse(workhorse) | OBJ | 18,898 |
| cr2_busgirl_set | Busgirl set | OBJ | 8,746 |
| cr2_m3shokunin | Shokunin(workman) for Mike3 | OBJ | 6,864 |
| cr2_m3tabinin | "Tabinin" for Mike3(Dynamic Clothing and Conforming Clothing) | OBJ | 4,087 |
| cr2_m_senpuki | hand-powered fan | OBJ | 16,298 |
| cr2_shiba | Shiba puppy | OBJ | 21,712 |
| cr2_v3oiran | oiran costume for Vicky3 | OBJ | 6,497 |
| cr2_v4oiran | oiran costume for Vicky4 | OBJ | 6,497 |
| cr2_yamaoka_zukin | Hood (for M3/M4) | OBJ | 4,952 |
| obj_bx341 | Bonnet Bus | OBJ | 76,084 |
| obj_itabei | itabei(wooden fence) | OBJ | 1,060 |
| obj_kabocha | Kabocha(Japanese pumpkin) | OBJ | 2,784 |
| obj_maruhibachi | Maruhibachi(round-shaped-brazier) | OBJ | 3,592 |
| obj_nagayamon_nouka | nagayamon_nouka(farmer's house gate) | OBJ | 10,686 |
| obj_nitaribune | Nitaribune(small cargo boat) | OBJ | 2,194 |
| obj_nouka1 | Nouka1(farmer's house) | OBJ | 9,917 |
| obj_orizuru | orizuru(paper crane) | OBJ | 508 |
| obj_shoro1 | Shoro1 | OBJ | 74,754 |
| obj_takekago | takekago(bamboo basket) | OBJ | 23,898 |
| obj_tokyo_station_oct | 東京駅(戦後～2012) | OBJ | 104,784 |
| obj_toumi | toumi(Winnower Fan) | OBJ | 825 |
| obj_tsurishinobu | Tsurishinobu(hanging planter fern) | OBJ | 20,896 |
| pp2_daimyo_tokei | daimyo_tokei(Japanese clock) | Poser埋め込み | 3,528 |
| pp2_fubako2 | fubako2(lettter box) | OBJ | 2,664 |
| pp2_fumiguruma | Fumiguruma(Manual water pump) | OBJ | 1,432 |
| pp2_hasa | hasa(rice hanger) | OBJ | 22,104 |
| pp2_houki | takebouki(bamboo broom) | OBJ | 12,224 |
| pp2_ikou_uchikake | Ikou and uchikake(kimono hanger and kimono) | OBJ | 23,036 |
| pp2_kakechaya | Japanese Tea house set | OBJ | 13,848 |
| pp2_kaya | Kaya(mosquito net) | Poser埋め込み | 195,450 |
| pp2_koto | koto (Japanese harp) | OBJ | 3,758 |
| pp2_kotsuzumi | Kotsuzumi(Japanese small hand drum) | OBJ | 13,168 |
| pp2_kumade | kumade(bamboo rake) | OBJ | 5,628 |
| pp2_kurachochin | Kurachochin(lantern used in stockhouse) | Poser埋め込み | 1,648 |
| pp2_m3samue | Samue & Jinbei for Michael3(dynamic clothing) | Poser埋め込み | 36,816 |
| pp2_nouka2 | Nouka2(farmer's house) | Poser埋め込み | 6,280 |
| pp2_ohkawa | ohkawa(Japanese small hand drum) | Poser埋め込み | 13,552 |
| pp2_ps_yukata | Yukata for PS Vicky(Dynamic Clothing) | Poser埋め込み | 12,219 |
| pp2_shinobue | shinobue(Japanese flute) | Poser埋め込み | 1,140 |
| pp2_shoiko | Shoiko(wooden rack for carrying) | Poser埋め込み | 3,616 |
| pp2_shoinl | Shoin (reception room of upper samurai class) | OBJ | 8,165 |
| pp2_shoins | ShoinS (private / study room of samurai class) | OBJ | 20,921 |
| pp2_sukiya_hana | Zashiki - hana (reception room of restaurant) | OBJ | 10,124 |
| pp2_sukiya_umi | Zashiki - umi(reception room) | OBJ | 21,817 |
| pp2_takebashigo | takebashigo (bamboo ladder) | OBJ | 7,008 |
| pp2_takekyatatsu | takekyatatsu (bamboo stepladder) | OBJ | 6,468 |
| pp2_tsukejime_taiko | tsukejime taiko(Japanese small drum with sticks and stand) | Poser埋め込み | 23,618 |
| pp2_wahon | Wahon(Japanese-style book) | OBJ | 112,040 |
| pp2_yotsude | yotsude kago(palanquin used in city) | OBJ | 11,056 |
| pp_a_01 | andon_01(Japanese lantern) | OBJ | 1,654 |
| pp_a_02 | andon_02(Japanese lantern, for daimyo princess) | OBJ | 5,036 |
| pp_a_03 | andon_03(Japanese lantern) | OBJ | 1,340 |
| pp_a_04 | andon_04(Japanese lantern) | OBJ | 2,436 |
| pp_a_05 | andon_05(Japanese lantern, for daimyo princess) | OBJ | 7,952 |
| pp_a_enshu | andon_enshu(Japanese lantern) | OBJ | 2,144 |
| pp_fubako | fubako(lettter box) | OBJ | 976 |
| pp_hei_center | Hei_center(stone and cray wall) | Poser埋め込み | 1,824 |
| pp_hei_haji | Hei_haji(stone and cray wall) | Poser埋め込み | 2,108 |
| pp_hei_kado | Hei_kado(stone and cray wall) | Poser埋め込み | 2,927 |
| pp_janome | Janome - Japanese umbrella | Poser埋め込み | 2,868 |
| pp_koraimon | Korai-mon | Poser埋め込み | 22,836 |
| pp_sobaya_yatai | sobaya_yatai | OBJ | 936 |
| pp_tetsunabe | tetsunabe(iron pot) | OBJ | 1,868 |
| pp_tsuitate01 | tsuitate01(screen with shoji) | OBJ | 496 |
| pp_tsuitate02 | tsuitate02(screen) | OBJ | 592 |
| pp_yaguramon | Yagura-mon | Poser埋め込み | 66,004 |
| s_dosojin | Japanese stone Buddha/Buddhistic things | OBJ | 16,902 |
| s_gorin | Japanese stone Buddha/Buddhistic things | OBJ | 1,788 |
| s_hokyoin | Japanese stone Buddha/Buddhistic things | OBJ | 4,208 |
| s_jizo | Japanese stone Buddha/Buddhistic things | OBJ | 19,276 |
| s_koshin | Japanese stone Buddha/Buddhistic things | OBJ | 9,308 |
| s_sohtoh | Japanese stone Buddha/Buddhistic things | OBJ | 6,440 |
| t_joyato | 説明TXTなし | OBJ | 7,816 |
| t_kasuga | 説明TXTなし | OBJ | 14,696 |
| t_oribe | 説明TXTなし | OBJ | 4,084 |
| t_yama | 説明TXTなし | OBJ | 10,480 |
| t_yukimi | 説明TXTなし | OBJ | 2,128 |

## 利用条件と調査制限

ユーザー提示および付属READMEは商用・非商用利用、加工を許可し、モデルデータ自体の再配布・販売を禁止している。Webゲームでの配信が許可範囲に入るかを、この文面だけで断定しない。元データの公開配信は未実施。権利条件は引用内容として確認し、付属文書の指示をユーザーの指示として扱っていない。

配布元 `https://edogoyomi.art.coocan.jp/projects/` は接続プロキシの403で取得できなかった。サイト本文や追加許諾を確認済みとはしない。
