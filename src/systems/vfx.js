import * as THREE from "three";
export class CombatVFX {
  constructor(scene,camera){
    this.flash=0;
    const mesh=new THREE.Mesh(
      new THREE.PlaneGeometry(.11,.11),
      new THREE.MeshBasicMaterial({color:0xfff4d6,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending})
    );
    mesh.position.set(.02,-.08,-.72); mesh.visible=false; camera.add(mesh); this.quad=mesh;
  }
  muzzleFlash(duration=.045){ this.flash=duration; this.quad.visible=true; }
  update(dt){ this.flash-=dt; if(this.flash<=0)this.quad.visible=false; else this.quad.material.opacity=Math.min(1,this.flash*32); }
}
