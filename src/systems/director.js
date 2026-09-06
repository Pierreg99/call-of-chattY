export class CombatDirector {
  constructor({ enemies, onWave=()=>{}, onVictory=()=>{} }={}) {
    this.enemies=enemies; this.onWave=onWave; this.onVictory=onVictory;
    this.wave=1; this.completed=false; this.cooldown=0;
  }
  update(dt){
    this.cooldown=Math.max(0,this.cooldown-dt);
    if(!this.completed && this.enemies.length>0 && this.enemies.every(e=>!e.alive) && this.cooldown===0){
      this.completed=true; this.onVictory(this.wave);
    }
  }
  nextWave(spawn){ this.wave+=1; this.completed=false; this.cooldown=1.5; spawn(this.wave); this.onWave(this.wave); }
}
export function scoreMultiplier({hit=false,kill=false,headshot=false,streak=0}={}){
  let value=hit?10:0; if(kill)value+=100; if(headshot)value+=50;
  return Math.round(value*(1+Math.min(streak,10)*.05));
}
