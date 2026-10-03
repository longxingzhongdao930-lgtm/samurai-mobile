const ACTIONS={0:'attack',1:'dodge',2:'magic',3:'weapon',4:'guard',5:'lock',6:'special',7:'attack',9:'pause'};
export class GamepadInput {
  constructor(game){this.game=game;this.previous=new Set();this.menuTime=0;this.connected=false;this.neutral=true;}
  poll(dt){
    const g=this.game,input=g.input,pad=[...(navigator.getGamepads?.()??[])].find(p=>p?.connected&&p.mapping==='standard');
    if(!pad){if(this.connected){for(const a of this.previous)input.release(a);input.padAxis=null;g.pause();this.connected=false}this.previous.clear();return}
    if(!this.connected){this.connected=true;g.hud?.notice('パッド：A 攻撃 · B 回避 · LB 守 · X 術 · Y 武器 · LT 奥義',5)}
    const current=new Set(Object.entries(ACTIONS).filter(([i])=>pad.buttons[i]?.pressed).map(([,action])=>action));
    const axis=v=>Math.abs(v)<.22?0:Math.sign(v)*(Math.abs(v)-.22)/.78;
    const x=axis(pad.axes[0]??0),y=-axis(pad.axes[1]??0);
    if(g.screens.open){
      input.padAxis=null;this.menuTime-=dt;
      const buttons=[...g.screens.current.querySelectorAll('button,input,select,a')].filter(b=>!b.disabled&&b.getBoundingClientRect().height>0);
      const active=document.activeElement,index=buttons.indexOf(active);
      if((Math.abs(y)>.5||pad.buttons[12]?.pressed||pad.buttons[13]?.pressed)&&this.menuTime<=0){
        const dir=(y>.5||pad.buttons[12]?.pressed)?-1:1;buttons[(Math.max(0,index)+dir+buttons.length)%buttons.length]?.focus();this.menuTime=.22;
      }
      if(Math.abs(x)>.5&&this.menuTime<=0&&active?.matches('input[type=range],select')){
        if(active.tagName==='SELECT'){active.selectedIndex=Math.max(0,Math.min(active.options.length-1,active.selectedIndex+Math.sign(x)));active.dispatchEvent(new Event('change'))}
        else{active.value=Number(active.value)+Number(active.step)*Math.sign(x);active.dispatchEvent(new Event('input'))}this.menuTime=.18;
      }
      if(current.has('attack')&&!this.previous.has('attack'))(buttons.includes(active)?active:buttons[0])?.click();
      if(current.has('pause')&&!this.previous.has('pause')&&g.state==='paused')g.resume();
    }else{
      input.padAxis={x,y};const lx=axis(pad.axes[2]??0),ly=axis(pad.axes[3]??0);
      if(lx||ly)input.addLook(lx*dt*600,ly*dt*600);
      for(const a of current)if(!this.previous.has(a))input.press(a);
      for(const a of this.previous)if(!current.has(a))input.release(a);
      const dir=pad.buttons[14]?.pressed?-1:pad.buttons[15]?.pressed?1:0;
      if(dir&&this.neutral){let i=g.player.elementIndex;for(let n=0;n<3;n++){i=(i+dir+3)%3;if(g.player.unlocked[i])break}input.press(`el${i}`);input.release(`el${i}`)}this.neutral=!dir;
    }
    this.previous=current;
  }
}
