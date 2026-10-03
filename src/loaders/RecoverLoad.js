/** Retry only the failed operation; loaded models and the current run stay alive. */
export async function recoverLoad(label, operation) {
  for (;;) {
    try { return await operation(); }
    catch (error) {
      if (typeof document === 'undefined') throw error;
      const game = globalThis.app?.game;
      if (game?.state === 'playing') game.pause();
      await new Promise(resolve => {
        let root = document.querySelector('.asset-recovery');
        if (!root) {
          root = document.createElement('section');root.className='asset-recovery';root.setAttribute('role','alertdialog');root.setAttribute('aria-label','データの再読み込み');
          Object.assign(root.style,{position:'fixed',inset:'10%',zIndex:10000,background:'#171311',color:'#efe6d2',padding:'24px',overflow:'auto',border:'1px solid #c9a25a'});
          const heading=document.createElement('h2');heading.textContent='一部のデータを読み込めませんでした';root.append(heading);document.body.append(root);
        }
        const row=document.createElement('div'),text=document.createElement('p'),button=document.createElement('button');
        text.textContent=`${String(label).split('/').pop()} — 接続を確認して再試行してください。進行は保持しています。`;
        button.textContent='このデータを再読み込み';button.className='gs-btn';
        button.onclick=()=>{row.remove();if(root.children.length===1)root.remove();resolve()};row.append(text,button);root.append(row);button.focus();
      });
    }
  }
}
