# 公開リポジトリのエフェクト調査（2026-10-05）

- squarefeet/ShaderParticleEngine https://github.com/squarefeet/ShaderParticleEngine — MIT、HEAD 05c3cbfdb44dff33b7b597452f81c0216da96e59。src/shaders/SPE.shaderChunks.js の floatOverLifetime を4点の斬線透明度へ改変して採用。改変箇所は src/game/fx/SpectralEnvelope.js。元ライセンスは public/licenses/shader-particle-engine-MIT.txt。古い粒子エンジン全体の依存追加はしない。
- pmndrs/postprocessing https://github.com/pmndrs/postprocessing — Zlib、HEAD 9cf03cff26615636a564d8bfddf765edb8917441。Bloom/SelectiveBloom と luminance threshold を調査。現在のThree.jsとのpeer範囲は適合するが、既存の後処理と重複するため今回はライブラリ／シェーダーをコピーしていない。画面全体を発光させず技の芯・残光へ明るさを限定する設計の参考。

採用した演出は白青の刀の細い軌跡、次元斬の交差線・薄い球、幻影剣の輪郭と柄、短い抜刀閃光。次元斬の線は寿命に沿って薄れ、急に消えるだけの表示を修正。竜人化中の腕の透明度は0.28へ抑え、白い塊で手元を隠しすぎないよう調整。元DMCのエフェクト資産は使用しない。
